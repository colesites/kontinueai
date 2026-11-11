// OAuth sign-in for remote MCP servers (the MCP authorization spec): servers
// like https://mcp.vercel.com answer 401 until you sign in.
//
// 1. Ask the server: its 401 names the protected-resource metadata, which
//    names the authorization server; read that server's metadata.
// 2. Register Kontinue as a client (dynamic client registration).
// 3. Open the browser for sign-in (PKCE), with a loopback redirect back here.
// 4. Swap the code for tokens; keep them in the system keychain and refresh
//    them before they expire.

use base64::engine::general_purpose::URL_SAFE_NO_PAD;
use base64::Engine;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use tauri::Url;

const KEYRING_SERVICE: &str = "kontinue-mcp-oauth";
/// Prefix on errors that mean "sign in to this server".
pub const AUTH_REQUIRED: &str = "MCP_AUTH_REQUIRED";

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StoredToken {
    access_token: String,
    refresh_token: Option<String>,
    /// Seconds since the epoch.
    expires_at: Option<u64>,
    client_id: String,
    token_endpoint: String,
}

fn now() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0)
}

fn key(url: &str) -> String {
    url.trim().trim_end_matches('/').to_string()
}

fn entry(url: &str) -> Option<keyring::Entry> {
    keyring::Entry::new(KEYRING_SERVICE, &key(url)).ok()
}

fn load(url: &str) -> Option<StoredToken> {
    entry(url)?.get_password().ok().and_then(|text| serde_json::from_str(&text).ok())
}

fn save(url: &str, token: &StoredToken) -> Result<(), String> {
    let text = serde_json::to_string(token).map_err(|e| e.to_string())?;
    entry(url)
        .ok_or("Keychain unavailable")?
        .set_password(&text)
        .map_err(|e| format!("Couldn't save the sign-in: {e}"))
}

fn random_b64(bytes: usize) -> String {
    let data: Vec<u8> = (0..bytes).map(|_| rand::random::<u8>()).collect();
    URL_SAFE_NO_PAD.encode(data)
}

/// PKCE S256 challenge for a verifier.
pub fn challenge(verifier: &str) -> String {
    URL_SAFE_NO_PAD.encode(Sha256::digest(verifier.as_bytes()))
}

#[derive(Deserialize)]
struct TokenResponse {
    access_token: String,
    refresh_token: Option<String>,
    expires_in: Option<u64>,
}

fn stored_from(response: TokenResponse, client_id: &str, token_endpoint: &str, old_refresh: Option<String>) -> StoredToken {
    StoredToken {
        access_token: response.access_token,
        refresh_token: response.refresh_token.or(old_refresh),
        expires_at: response.expires_in.map(|s| now() + s),
        client_id: client_id.to_string(),
        token_endpoint: token_endpoint.to_string(),
    }
}

async fn refresh(url: &str, token: &StoredToken) -> Option<StoredToken> {
    let refresh_token = token.refresh_token.clone()?;
    let response = reqwest::Client::new()
        .post(&token.token_endpoint)
        .form(&[
            ("grant_type", "refresh_token"),
            ("refresh_token", refresh_token.as_str()),
            ("client_id", token.client_id.as_str()),
            ("resource", key(url).as_str()),
        ])
        .send()
        .await
        .ok()?;
    if !response.status().is_success() {
        return None;
    }
    let parsed: TokenResponse = response.json().await.ok()?;
    let next = stored_from(parsed, &token.client_id, &token.token_endpoint, Some(refresh_token));
    save(url, &next).ok()?;
    Some(next)
}

/// A usable access token for `url`, refreshed when close to expiry.
pub async fn access_token(url: &str) -> Option<String> {
    let token = load(url)?;
    let expiring = token.expires_at.is_some_and(|at| at <= now() + 60);
    if expiring {
        return refresh(url, &token).await.map(|t| t.access_token);
    }
    Some(token.access_token)
}

/// After a 401: try one refresh. Returns a new access token if that worked.
pub async fn refresh_after_401(url: &str) -> Option<String> {
    let token = load(url)?;
    refresh(url, &token).await.map(|t| t.access_token)
}

// ---------------------------------------------------------------------------
// Discovery
// ---------------------------------------------------------------------------

/// `resource_metadata="…"` from a WWW-Authenticate header.
pub fn resource_metadata_url(header: &str) -> Option<String> {
    let start = header.find("resource_metadata=")? + "resource_metadata=".len();
    let rest = header[start..].trim_start_matches('"');
    let end = rest.find(['"', ',', ' ']).unwrap_or(rest.len());
    Some(rest[..end].to_string())
}

/// Well-known URL for an issuer, inserting the path the way RFC 8414 says.
pub fn well_known(issuer: &str, suffix: &str) -> Option<String> {
    let url = Url::parse(issuer).ok()?;
    let path = url.path().trim_end_matches('/');
    let origin = url.origin().ascii_serialization();
    Some(if path.is_empty() {
        format!("{origin}/.well-known/{suffix}")
    } else {
        format!("{origin}/.well-known/{suffix}{path}")
    })
}

async fn get_json(client: &reqwest::Client, url: &str) -> Option<Value> {
    let response = client.get(url).header("Accept", "application/json").send().await.ok()?;
    if !response.status().is_success() {
        return None;
    }
    response.json().await.ok()
}

struct ServerMeta {
    authorization_endpoint: String,
    token_endpoint: String,
    registration_endpoint: Option<String>,
    scopes: Option<String>,
}

async fn discover(client: &reqwest::Client, mcp_url: &str) -> Result<ServerMeta, String> {
    let probe = client
        .post(mcp_url)
        .header("Accept", "application/json, text/event-stream")
        .json(&json!({ "jsonrpc": "2.0", "id": 0, "method": "initialize", "params": {
            "protocolVersion": "2025-06-18", "capabilities": {},
            "clientInfo": { "name": "Kontinue", "version": "0.1.0" } } }))
        .send()
        .await
        .map_err(|e| format!("Couldn't reach {mcp_url}: {e}"))?;
    let header = probe
        .headers()
        .get("www-authenticate")
        .and_then(|v| v.to_str().ok())
        .map(str::to_string);

    let origin = Url::parse(mcp_url)
        .map_err(|e| e.to_string())?
        .origin()
        .ascii_serialization();

    // Protected resource metadata → authorization server.
    let mut resource_meta = None;
    if let Some(url) = header.as_deref().and_then(resource_metadata_url) {
        resource_meta = get_json(client, &url).await;
    }
    if resource_meta.is_none() {
        if let Some(url) = well_known(mcp_url, "oauth-protected-resource") {
            resource_meta = get_json(client, &url).await;
        }
    }
    if resource_meta.is_none() {
        resource_meta = get_json(client, &format!("{origin}/.well-known/oauth-protected-resource")).await;
    }
    let issuer = resource_meta
        .as_ref()
        .and_then(|m| m.get("authorization_servers"))
        .and_then(Value::as_array)
        .and_then(|list| list.first())
        .and_then(Value::as_str)
        .map(str::to_string)
        .unwrap_or_else(|| origin.clone());
    let scopes = resource_meta
        .as_ref()
        .and_then(|m| m.get("scopes_supported"))
        .and_then(Value::as_array)
        .map(|list| list.iter().filter_map(Value::as_str).collect::<Vec<_>>().join(" "))
        .filter(|s| !s.is_empty());

    let mut meta = None;
    for suffix in ["oauth-authorization-server", "openid-configuration"] {
        if let Some(url) = well_known(&issuer, suffix) {
            meta = get_json(client, &url).await;
            if meta.is_some() {
                break;
            }
        }
    }
    let field = |name: &str| meta.as_ref().and_then(|m| m.get(name)).and_then(Value::as_str).map(str::to_string);
    let issuer_origin = Url::parse(&issuer).map(|u| u.origin().ascii_serialization()).unwrap_or(origin);
    Ok(ServerMeta {
        authorization_endpoint: field("authorization_endpoint").unwrap_or_else(|| format!("{issuer_origin}/authorize")),
        token_endpoint: field("token_endpoint").unwrap_or_else(|| format!("{issuer_origin}/token")),
        registration_endpoint: field("registration_endpoint").or_else(|| meta.is_none().then(|| format!("{issuer_origin}/register"))),
        scopes,
    })
}

// ---------------------------------------------------------------------------
// Sign-in
// ---------------------------------------------------------------------------

const DONE_PAGE: &str = r#"<!DOCTYPE html><html><head><meta charset="utf-8"><title>Connected</title>
<style>body{background:#0d0d0e;color:#f5f5f5;font-family:-apple-system,BlinkMacSystemFont,sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0}</style>
</head><body><div style="text-align:center"><h1>Connected</h1><p>You can close this tab and go back to Kontinue.</p></div></body></html>"#;

#[tauri::command]
pub async fn mcp_oauth_login(app: tauri::AppHandle, url: String) -> Result<(), String> {
    use tauri_plugin_opener::OpenerExt;
    use tauri_plugin_oauth::{cancel, start_with_config, OauthConfig};

    let client = reqwest::Client::new();
    let meta = discover(&client, &url).await?;

    // Loopback redirect: the browser comes back to http://127.0.0.1:<port>.
    let (tx, rx) = tokio::sync::oneshot::channel::<String>();
    let tx = std::sync::Mutex::new(Some(tx));
    let port = start_with_config(
        OauthConfig { response: Some(DONE_PAGE.into()), ..Default::default() },
        move |callback| {
            if let Some(tx) = tx.lock().ok().and_then(|mut slot| slot.take()) {
                let _ = tx.send(callback);
            }
        },
    )
    .map_err(|e| e.to_string())?;
    let redirect = format!("http://127.0.0.1:{port}/callback");

    let result = async {
        let registration = meta
            .registration_endpoint
            .as_deref()
            .ok_or("This server doesn't let apps register themselves, so Kontinue can't sign in to it yet.")?;
        let registered: Value = client
            .post(registration)
            .json(&json!({
                "client_name": "Kontinue",
                "redirect_uris": [redirect],
                "grant_types": ["authorization_code", "refresh_token"],
                "response_types": ["code"],
                "token_endpoint_auth_method": "none",
            }))
            .send()
            .await
            .map_err(|e| format!("Couldn't register with the server: {e}"))?
            .json()
            .await
            .map_err(|e| format!("Unexpected registration reply: {e}"))?;
        let client_id = registered
            .get("client_id")
            .and_then(Value::as_str)
            .ok_or("The server didn't give Kontinue a client ID.")?
            .to_string();

        let verifier = random_b64(48);
        let state = random_b64(16);
        let mut auth = Url::parse(&meta.authorization_endpoint).map_err(|e| e.to_string())?;
        {
            let mut q = auth.query_pairs_mut();
            q.append_pair("response_type", "code")
                .append_pair("client_id", &client_id)
                .append_pair("redirect_uri", &redirect)
                .append_pair("code_challenge", &challenge(&verifier))
                .append_pair("code_challenge_method", "S256")
                .append_pair("state", &state)
                .append_pair("resource", &key(&url));
            if let Some(scopes) = &meta.scopes {
                q.append_pair("scope", scopes);
            }
        }
        app.opener()
            .open_url(auth.as_str(), None::<&str>)
            .map_err(|e| format!("Couldn't open the browser: {e}"))?;

        let callback = tokio::time::timeout(std::time::Duration::from_secs(300), rx)
            .await
            .map_err(|_| "Sign-in timed out.".to_string())?
            .map_err(|_| "Sign-in was interrupted.".to_string())?;
        let back = Url::parse(&callback).map_err(|e| e.to_string())?;
        let param = |name: &str| back.query_pairs().find(|(k, _)| k == name).map(|(_, v)| v.into_owned());
        if let Some(error) = param("error") {
            return Err(format!("Sign-in failed: {}", param("error_description").unwrap_or(error)));
        }
        if param("state").as_deref() != Some(state.as_str()) {
            return Err("Sign-in didn't match this request. Try again.".into());
        }
        let code = param("code").ok_or("No sign-in code came back.")?;

        let response = client
            .post(&meta.token_endpoint)
            .form(&[
                ("grant_type", "authorization_code"),
                ("code", code.as_str()),
                ("redirect_uri", redirect.as_str()),
                ("client_id", client_id.as_str()),
                ("code_verifier", verifier.as_str()),
                ("resource", key(&url).as_str()),
            ])
            .send()
            .await
            .map_err(|e| format!("Couldn't finish sign-in: {e}"))?;
        if !response.status().is_success() {
            let body = response.text().await.unwrap_or_default();
            return Err(format!("The server refused the sign-in: {}", body.chars().take(200).collect::<String>()));
        }
        let tokens: TokenResponse = response.json().await.map_err(|e| e.to_string())?;
        save(&url, &stored_from(tokens, &client_id, &meta.token_endpoint, None))
    }
    .await;

    let _ = cancel(port);
    result
}

#[tauri::command(async)]
pub fn mcp_oauth_status(url: String) -> bool {
    load(&url).is_some()
}

#[tauri::command(async)]
pub fn mcp_oauth_logout(url: String) -> Result<(), String> {
    if let Some(entry) = entry(&url) {
        let _ = entry.delete_credential();
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reads_resource_metadata_from_header() {
        let header = r#"Bearer error="invalid_token", resource_metadata="https://mcp.example.com/.well-known/oauth-protected-resource""#;
        assert_eq!(
            resource_metadata_url(header).as_deref(),
            Some("https://mcp.example.com/.well-known/oauth-protected-resource")
        );
        assert_eq!(resource_metadata_url("Bearer realm=x"), None);
    }

    #[test]
    fn well_known_paths() {
        assert_eq!(
            well_known("https://auth.example.com", "oauth-authorization-server").as_deref(),
            Some("https://auth.example.com/.well-known/oauth-authorization-server")
        );
        assert_eq!(
            well_known("https://example.com/tenant1/", "oauth-authorization-server").as_deref(),
            Some("https://example.com/.well-known/oauth-authorization-server/tenant1")
        );
    }

    #[test]
    fn pkce_challenge_matches_rfc_example() {
        // RFC 7636 appendix B.
        assert_eq!(
            challenge("dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk"),
            "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM"
        );
    }
}
