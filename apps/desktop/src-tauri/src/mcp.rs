// Minimal MCP (Model Context Protocol) client over stdio.
//
// Spawns an MCP server process, performs the initialize handshake, discovers its
// tools, and calls them. The protocol is JSON-RPC 2.0, newline-delimited on
// stdin/stdout. This is deliberately self-contained (no external MCP crate) —
// we only need initialize, tools/list and tools/call.

use std::collections::HashMap;

use serde_json::{json, Value};
use tauri::State;
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tokio::process::{Child, ChildStdin, ChildStdout, Command};
use tokio::sync::Mutex;

pub struct McpConnection {
    child: Child,
    stdin: ChildStdin,
    reader: BufReader<ChildStdout>,
    next_id: u64,
}

impl McpConnection {
    async fn start(command: &str, args: &[String], env: &HashMap<String, String>) -> Result<Self, String> {
        let mut cmd = Command::new(command);
        cmd.args(args);
        for (key, value) in env {
            cmd.env(key, value);
        }
        cmd.stdin(std::process::Stdio::piped());
        cmd.stdout(std::process::Stdio::piped());
        cmd.stderr(std::process::Stdio::piped());

        let mut child = cmd.spawn().map_err(|error| format!("Failed to start {command}: {error}"))?;
        let stdin = child.stdin.take().ok_or("MCP server has no stdin")?;
        let stdout = child.stdout.take().ok_or("MCP server has no stdout")?;
        let reader = BufReader::new(stdout);
        let mut conn = McpConnection { child, stdin, reader, next_id: 1 };

        // Handshake, then signal we're initialized.
        conn.request(
            "initialize",
            json!({
                "protocolVersion": "2024-11-05",
                "capabilities": {},
                "clientInfo": { "name": "Kontinue", "version": "0.1.0" }
            }),
        )
        .await?;
        conn.notify("notifications/initialized").await?;
        Ok(conn)
    }

    async fn request(&mut self, method: &str, params: Value) -> Result<Value, String> {
        let id = self.next_id;
        self.next_id += 1;
        let mut line = serde_json::to_string(&json!({ "jsonrpc": "2.0", "id": id, "method": method, "params": params }))
            .map_err(|error| error.to_string())?;
        line.push('\n');
        self.stdin.write_all(line.as_bytes()).await.map_err(|error| error.to_string())?;
        self.stdin.flush().await.map_err(|error| error.to_string())?;

        // stdio MCP is request/response: the next non-notification message is the
        // reply. Reference servers (the TS SDK) omit the `jsonrpc`/`id` envelope
        // and write `{"result": …}` directly, so we key off result/error presence
        // rather than matching an id.
        loop {
            let mut buf = String::new();
            let read = self.reader.read_line(&mut buf).await.map_err(|error| error.to_string())?;
            if read == 0 {
                return Err("MCP server closed the connection".to_string());
            }
            let trimmed = buf.trim();
            if trimmed.is_empty() {
                continue;
            }
            let value: Value = serde_json::from_str(trimmed).map_err(|error| format!("Bad JSON from MCP server: {error}"))?;
            // Notifications carry a method and no id/result — skip them.
            if value.get("method").is_some() && value.get("id").is_none() {
                continue;
            }
            if let Some(error) = value.get("error") {
                return Err(format!("MCP error: {error}"));
            }
            if let Some(result) = value.get("result") {
                return Ok(result.clone());
            }
        }
    }

    async fn notify(&mut self, method: &str) -> Result<(), String> {
        let mut line = serde_json::to_string(&json!({ "jsonrpc": "2.0", "method": method }))
            .map_err(|error| error.to_string())?;
        line.push('\n');
        self.stdin.write_all(line.as_bytes()).await.map_err(|error| error.to_string())?;
        self.stdin.flush().await.map_err(|error| error.to_string())?;
        Ok(())
    }
}

impl Drop for McpConnection {
    fn drop(&mut self) {
        let _ = self.child.start_kill();
    }
}

// Streamable-HTTP MCP connection. POSTs JSON-RPC to a URL and reads back a JSON
// or SSE response. Mirrors the stdio transport's initialize handshake.
pub struct McpHttpConnection {
    client: reqwest::Client,
    url: String,
    session_id: Option<String>,
    next_id: u64,
}

impl McpHttpConnection {
    async fn start(url: &str) -> Result<Self, String> {
        let mut connection = McpHttpConnection {
            client: reqwest::Client::new(),
            url: url.to_string(),
            session_id: None,
            next_id: 1,
        };
        connection
            .request(
                "initialize",
                json!({
                    "protocolVersion": "2024-11-05",
                    "capabilities": {},
                    "clientInfo": { "name": "Kontinue", "version": "0.1.0" }
                }),
            )
            .await?;
        connection.notify("notifications/initialized").await?;
        Ok(connection)
    }

    fn apply_session(&self, request: reqwest::RequestBuilder) -> reqwest::RequestBuilder {
        match &self.session_id {
            Some(id) => request.header("Mcp-Session-Id", id),
            None => request,
        }
    }

    /// Send with the stored OAuth token (if any); on 401 refresh once.
    async fn send(&self, body: &Value) -> Result<reqwest::Response, String> {
        let build = |token: Option<&str>| {
            let request = self
                .apply_session(self.client.post(&self.url).json(body))
                .header("Accept", "application/json, text/event-stream");
            match token {
                Some(token) => request.bearer_auth(token),
                None => request,
            }
        };
        let token = crate::mcp_auth::access_token(&self.url).await;
        let response = build(token.as_deref()).send().await.map_err(|error| error.to_string())?;
        if response.status() != reqwest::StatusCode::UNAUTHORIZED {
            return Ok(response);
        }
        if token.is_some() {
            if let Some(fresh) = crate::mcp_auth::refresh_after_401(&self.url).await {
                let retry = build(Some(&fresh)).send().await.map_err(|error| error.to_string())?;
                if retry.status() != reqwest::StatusCode::UNAUTHORIZED {
                    return Ok(retry);
                }
            }
        }
        Err(format!("{}: This server needs you to sign in.", crate::mcp_auth::AUTH_REQUIRED))
    }

    async fn request(&mut self, method: &str, params: Value) -> Result<Value, String> {
        let id = self.next_id;
        self.next_id += 1;
        let body = json!({ "jsonrpc": "2.0", "id": id, "method": method, "params": params });
        let response = self.send(&body).await?;

        if let Some(id) = response.headers().get("mcp-session-id").and_then(|v| v.to_str().ok()) {
            self.session_id = Some(id.to_string());
        }
        if !response.status().is_success() {
            return Err(format!("MCP HTTP {}", response.status()));
        }
        let is_sse = response
            .headers()
            .get("content-type")
            .and_then(|v| v.to_str().ok())
            .map(|c| c.contains("text/event-stream"))
            .unwrap_or(false);

        let text = response.text().await.map_err(|error| error.to_string())?;
        if is_sse {
            Self::parse_sse(&text)
        } else {
            let value: Value = serde_json::from_str(&text).map_err(|error| format!("Bad JSON from MCP server: {error}"))?;
            Self::extract(value)
        }
    }

    async fn notify(&mut self, method: &str) -> Result<(), String> {
        let body = json!({ "jsonrpc": "2.0", "method": method });
        self.send(&body).await?;
        Ok(())
    }

    fn extract(value: Value) -> Result<Value, String> {
        if let Some(error) = value.get("error") {
            return Err(format!("MCP error: {error}"));
        }
        Ok(value.get("result").cloned().unwrap_or(Value::Null))
    }

    fn parse_sse(text: &str) -> Result<Value, String> {
        let mut last_data: Option<Value> = None;
        for line in text.lines() {
            if let Some(data) = line.strip_prefix("data:") {
                let data = data.trim();
                if data.is_empty() || data == "[DONE]" {
                    continue;
                }
                if let Ok(value) = serde_json::from_str::<Value>(data) {
                    if value.get("result").is_some() || value.get("error").is_some() {
                        last_data = Some(value);
                    } else if let Some(result) = value.get("result") {
                        last_data = Some(result.clone());
                    } else {
                        last_data = Some(value);
                    }
                }
            }
        }
        match last_data {
            Some(value) => Self::extract(value),
            None => Err("No result in MCP SSE response".to_string()),
        }
    }
}

pub enum McpTransport {
    Stdio(McpConnection),
    Http(McpHttpConnection),
}

impl McpTransport {
    async fn request(&mut self, method: &str, params: Value) -> Result<Value, String> {
        match self {
            McpTransport::Stdio(connection) => connection.request(method, params).await,
            McpTransport::Http(connection) => connection.request(method, params).await,
        }
    }
}

#[derive(Default)]
pub struct McpManager {
    connections: Mutex<HashMap<String, McpTransport>>,
}

#[tauri::command]
pub async fn mcp_start(
    state: State<'_, McpManager>,
    server_id: String,
    command: Option<String>,
    args: Option<Vec<String>>,
    env: Option<HashMap<String, String>>,
    url: Option<String>,
) -> Result<Value, String> {
    let transport = if let Some(url) = url.filter(|u| !u.trim().is_empty()) {
        McpTransport::Http(McpHttpConnection::start(&url).await?)
    } else if let Some(command) = command {
        McpTransport::Stdio(
            McpConnection::start(&command, &args.unwrap_or_default(), &env.unwrap_or_default()).await?,
        )
    } else {
        return Err("Provide either a URL or a command".to_string());
    };
    state.connections.lock().await.insert(server_id, transport);
    Ok(json!({ "ok": true }))
}

#[tauri::command]
pub async fn mcp_list_tools(state: State<'_, McpManager>, server_id: String) -> Result<Value, String> {
    let mut guard = state.connections.lock().await;
    let transport = guard.get_mut(&server_id).ok_or("MCP server is not running")?;
    transport.request("tools/list", json!({})).await
}

#[tauri::command]
pub async fn mcp_call_tool(
    state: State<'_, McpManager>,
    server_id: String,
    name: String,
    arguments: Value,
) -> Result<Value, String> {
    let mut guard = state.connections.lock().await;
    let transport = guard.get_mut(&server_id).ok_or("MCP server is not running")?;
    transport.request("tools/call", json!({ "name": name, "arguments": arguments })).await
}

#[tauri::command]
pub async fn mcp_stop(state: State<'_, McpManager>, server_id: String) -> Result<(), String> {
    let mut guard = state.connections.lock().await;
    if let Some(McpTransport::Stdio(mut connection)) = guard.remove(&server_id) {
        let _ = connection.child.kill().await;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;

    #[tokio::test]
    async fn handshake_list_and_call_against_mock_server() {
        let script = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("tests/mock-mcp-server.mjs");
        let mut connection = McpConnection::start(
            "node",
            &[script.to_string_lossy().to_string()],
            &HashMap::new(),
        )
        .await
        .expect("start mock server");

        let list = connection.request("tools/list", json!({})).await.expect("list tools");
        let tools = list.get("tools").and_then(|t| t.as_array()).expect("tools array");
        assert_eq!(tools.len(), 1);
        assert_eq!(tools[0]["name"], "echo");

        let call = connection
            .request("tools/call", json!({ "name": "echo", "arguments": { "text": "hello" } }))
            .await
            .expect("call tool");
        let content = call.get("content").and_then(|c| c.as_array()).expect("content array");
        assert_eq!(content[0]["text"], "You said: hello");
    }

    // Verifies the client against the real reference server. Ignored by default
    // (spawns `npx` and needs network on first run): `cargo test -- --ignored`.
    #[tokio::test]
    #[ignore]
    async fn against_reference_everything_server() {
        let mut connection = McpConnection::start(
            "npx",
            &["-y".to_string(), "@modelcontextprotocol/server-everything".to_string()],
            &HashMap::new(),
        )
        .await
        .expect("start reference server");

        let list = connection.request("tools/list", json!({})).await.expect("list tools");
        let tools = list.get("tools").and_then(|t| t.as_array()).expect("tools array");
        assert!(!tools.is_empty());

        let call = connection
            .request("tools/call", json!({ "name": "echo", "arguments": { "message": "hello mcp" } }))
            .await
            .expect("call echo");
        let content = call.get("content").and_then(|c| c.as_array()).expect("content array");
        assert!(!content.is_empty());
    }

    // Verifies the HTTP transport against the reference server's streamableHttp
    // mode. Ignored by default: start the server first with
    // `npx -y @modelcontextprotocol/server-everything streamableHttp`.
    #[tokio::test]
    #[ignore]
    async fn against_reference_http_server() {
        let mut connection = McpHttpConnection::start("http://localhost:3001/mcp")
            .await
            .expect("start http server");
        let list = connection.request("tools/list", json!({})).await.expect("list tools");
        let tools = list.get("tools").and_then(|t| t.as_array()).expect("tools array");
        assert!(!tools.is_empty());

        let call = connection
            .request("tools/call", json!({ "name": "echo", "arguments": { "message": "hello http" } }))
            .await
            .expect("call echo");
        let content = call.get("content").and_then(|c| c.as_array()).expect("content array");
        assert!(!content.is_empty());
    }
}
