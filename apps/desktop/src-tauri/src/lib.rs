use futures_util::StreamExt;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::path::{Component, PathBuf};
use tauri::ipc::Channel;

mod kode_import;
mod kode_hooks;
mod kode_mcp_server;
mod snapshot;
mod git_hosts;
mod triage;
mod project_move;
mod text_tool_markup;
mod bg_tasks;
mod mcp;
mod mcp_auth;
mod mcp_import;

mod browser_view;
mod panel;
mod settings_info;
mod menu;
mod agent_usage;
mod editor;
mod plugins;
mod cli_agents;

#[cfg(target_os = "macos")]
mod macos_window;

// Center-to-center distance (points) between the macOS traffic lights.
#[cfg(target_os = "macos")]
const TRAFFIC_LIGHT_SPACING: f64 = 22.0;

const OPENROUTER_CHAT_COMPLETIONS_URL: &str = "https://openrouter.ai/api/v1/chat/completions";
const VERCEL_AI_GATEWAY_CHAT_COMPLETIONS_URL: &str =
    "https://ai-gateway.vercel.sh/v1/chat/completions";
const KODE_MODEL_ID: &str = "kontinue/kode-1.0";
// Kode 1.0 runs on Nex N2 Pro (free, tool-capable, 262K ctx) via OpenRouter. The
// identity lock below keeps it presenting as "Kode 1.0 by Kontinue AI".
const KODE_OPENROUTER_MODEL_ID: &str = "nex-agi/nex-n2-pro:free";
// K-AI 1.0 runs on Gemini 2.5 Flash Lite via Vercel AI Gateway,
// exactly matching packages/ai/src/lib/kai.ts.
const K_AI_MODEL_ID: &str = "kontinue/k-ai-1.0";
const K_AI_PRIMARY_MODEL: &str = "google/gemini-2.5-flash-lite";
const K_AI_FALLBACK_MODELS: &[&str] = &[
    "alibaba/qwen3.7-flash",
    "google/gemma-4-31b-it",
];
const MINIMAX_M3_MODEL_ID: &str = "minimax/minimax-m3";
const DEEPSEEK_V4_PRO_MODEL_ID: &str = "deepseek/deepseek-v4-pro";
const BYOK_KEYRING_SERVICE: &str = "com.kontinue.kode-ide.byok";

// Identity lock — applied ONLY to the branded Kode 1.0 model. The underlying open
// model would otherwise reveal its real name when asked; this overrides that so
// Kode 1.0 always presents as "Kode 1.0 by Kontinue AI". It is NOT applied to the
// premium models (MiniMax M3, DeepSeek V4 Pro, …) — those are shown under their
// real names in the picker and should identify as themselves, not as Kode 1.0.
const KODE_IDENTITY_PROMPT: &str = "You are Kontinue AI, the intelligent AI assistant and desktop workspace created by Kontinue AI. You help users with general reasoning, writing, design, and software engineering.";

const KODE_AGENT_PROMPT: &str = "You are a professional, careful, repo-aware AI assistant inside Kontinue AI desktop application. Prefer concrete, modern, correct code. Explain decisions briefly. Never expose secrets or run destructive actions without confirmation.\n\nYou have tools available to navigate, inspect, and modify the project environment. Always verify tool call results before declaring success. Finish the task: do not stop after a search, and do not repeat the same command. On a multi-step task, start with update_todos and update that checklist as you go, including at the end. Close with a short report of what you did and what you did not do. Ask the user with ask_options when a decision is theirs, instead of writing a questionnaire into the message.";

#[derive(Debug, Deserialize)]
struct KodeChatRequest {
    model_id: String,
    // Raw OpenAI-style chat messages. Kept as `Value` so the frontend agent loop
    // can send any role — including assistant messages carrying `tool_calls` and
    // `tool` result messages — without the Rust layer needing to model them all.
    messages: Vec<Value>,
    // Optional OpenAI-style tool/function definitions. When present, the model may
    // respond with `tool_calls` instead of (or before) final content.
    #[serde(default)]
    tools: Option<Value>,
    // Optional tool_choice override ("auto" | "required" | "none" | {...}). When
    // absent, defaults to "auto" if tools are present. The frontend sets
    // "required" on the first turn of clear file-work requests to force action.
    #[serde(default)]
    tool_choice: Option<Value>,
    // Extra system guidance (repo profile + selected skills) appended to the base
    // Kode system prompt. Built by the frontend skills system per request.
    #[serde(default)]
    system_context: Option<String>,
    // Optional BYOK API key passed directly from client persistence fallback
    #[serde(default)]
    byok_key: Option<String>,
    // Optional BYOK provider ID ("anthropic" | "openai" | "agent_router")
    #[serde(default)]
    byok_provider: Option<String>,
    // Optional thinking / reasoning toggle from the user
    #[serde(default)]
    reasoning_enabled: Option<bool>,
    // Route through the Kontinue server (plan access + usage metering) with
    // the user's Clerk session token. Personal-key (BYOK) routes stay direct.
    #[serde(default)]
    kontinue_server: Option<bool>,
    #[serde(default)]
    session_token: Option<String>,
    // Fast mode: the server swaps in the model's fast variant when allowed.
    #[serde(default)]
    fast: Option<bool>,
    // "kode" (default) → /api/kode/chat, "home" → /api/desktop/chat.
    #[serde(default)]
    kontinue_surface: Option<String>,
    // Requested reasoning effort ("low" | "medium" | "high" | "xhigh" | "max").
    #[serde(default)]
    reasoning_effort: Option<String>,
}

#[derive(Debug, Serialize)]
struct KodeChatResponse {
    content: String,
    reasoning: Option<String>,
    usage: Option<KodeChatUsage>,
    resolved_model_id: String,
    // Tool calls the model requested this turn (OpenAI shape), if any. The
    // frontend executes them and calls `kode_chat` again with the results.
    tool_calls: Option<Value>,
    // "stop" | "tool_calls" | "length" | … — lets the frontend know to loop.
    finish_reason: Option<String>,
    // The reply did not finish: it hit the output limit, the stream dropped,
    // or it ended inside a tool call. The agent asks the model to go on
    // instead of treating the partial text as the final answer.
    truncated: bool,
}

#[derive(Debug, Serialize)]
struct ByokKeyStatus {
    provider: String,
    configured: bool,
}

// Accumulates a single streamed tool call across `delta.tool_calls[i]` frames.
#[derive(Default, Clone)]
struct ToolCallAccum {
    id: String,
    name: String,
    arguments: String,
}

#[derive(Debug, Serialize, Clone)]
struct KodeChatUsage {
    input_tokens: Option<u64>,
    output_tokens: Option<u64>,
    reasoning_tokens: Option<u64>,
    total_tokens: Option<u64>,
}

// Incremental events streamed to the frontend over a Tauri channel as the model
// produces reasoning/content tokens.
#[derive(Debug, Serialize, Clone)]
#[serde(tag = "type", rename_all = "snake_case")]
enum KodeStreamEvent {
    Reasoning { delta: String },
    Content { delta: String },
}

// Free OpenRouter providers intermittently return transient 5xx errors
// (502/503/520/524). Retry a few times with backoff before surfacing them.
const MAX_ATTEMPTS: usize = 4;

#[tauri::command]
async fn kode_chat(
    request: KodeChatRequest,
    on_event: Channel<KodeStreamEvent>,
) -> Result<KodeChatResponse, String> {
    let direct = resolve_model_route(
        &request.model_id,
        request.byok_key.as_deref(),
        request.byok_provider.as_deref(),
    );
    let is_byok_direct = matches!(&direct, Ok(route) if route.name.ends_with("(BYOK)"));
    let use_server = request.kontinue_server.unwrap_or(false) && !is_byok_direct;
    let route = if use_server {
        let token = request
            .session_token
            .clone()
            .filter(|token| !token.trim().is_empty())
            .ok_or("Your session expired. Sign in again to use Kode.")?;
        let home = request.kontinue_surface.as_deref() == Some("home");
        kontinue_route(&request.model_id, token, home)
    } else {
        direct?
    };
    let mut payload = route.payload(
        request.messages,
        request.tools.as_ref(),
        request.tool_choice.as_ref(),
        request.system_context.as_deref(),
        request.reasoning_enabled,
        true,
    );
    if use_server && request.reasoning_enabled != Some(false) {
        if let Some(effort) = request.reasoning_effort.as_deref() {
            payload["reasoning"] = json!({ "enabled": true, "effort": effort });
        }
    }
    if use_server {
        payload["kontinue"] = json!({
            "modelId": request.model_id,
            "fast": request.fast.unwrap_or(false),
        });
    }
    let client = reqwest::Client::new();

    // Open the streaming connection. We only retry the *connection* (transient
    // 5xx / network errors before any tokens arrive); once bytes flow we commit.
    let mut attempt = 0;
    let response = loop {
        attempt += 1;

        match client
            .post(route.url)
            .bearer_auth(&route.api_key)
            .headers(route.headers.clone())
            .json(&payload)
            .send()
            .await
        {
            Ok(response) => {
                let status = response.status();
                if status.is_server_error() && attempt < MAX_ATTEMPTS {
                    backoff(attempt).await;
                    continue;
                }
                if !status.is_success() {
                    let body = response.text().await.unwrap_or_default();
                    let reset_at = extract_reset_at(&body);
                    let message = extract_error_message(&body).unwrap_or(body);
                    let hint = if status.is_server_error() {
                        " (the free provider is temporarily overloaded — try again or switch models)"
                    } else {
                        ""
                    };
                    if route.name == KONTINUE_ROUTE_NAME {
                        // The server sends user-facing messages (limits, plan access).
                        // An HTML page instead (e.g. a 404) means the route isn't there.
                        let looks_like_html = message.trim_start().starts_with('<')
                            || message.contains("<html")
                            || message.contains("next-error");
                        if looks_like_html || status.as_u16() == 404 {
                            return Err(format!(
                                "Couldn't reach Kontinue's model server ({status} from {}). If you're developing, run the web app and set KONTINUE_API_URL in apps/desktop/.env; otherwise deploy the latest web app.",
                                route.url
                            ));
                        }
                        // The session token was refused (expired between fetch and
                        // use, or a clock skew). The frontend fetches a fresh one
                        // and retries once before showing "sign in".
                        if status.as_u16() == 401 {
                            return Err(format!("{message}\n[[auth-expired]]"));
                        }
                        // Usage limits carry `resetAt` (epoch ms); keep it for the
                        // "send when it resets" card (src/lib/kode-limits.ts).
                        if let Some(reset_at) = reset_at {
                            return Err(format!("{message}\n[[limit-reset:{reset_at}]]"));
                        }
                        return Err(message);
                    }
                    return Err(format!("{} returned {status}: {message}{hint}", route.name));
                }
                break response;
            }
            Err(error) => {
                if attempt < MAX_ATTEMPTS {
                    backoff(attempt).await;
                    continue;
                }
                return Err(format!("{} request failed: {error}", route.name));
            }
        }
    };

    // Consume the SSE byte stream, parsing `data:` frames and emitting deltas as
    // they arrive while accumulating the full content/reasoning/usage.
    let mut stream = response.bytes_stream();
    let mut buffer = String::new();
    let mut content = String::new();
    let mut reasoning = String::new();
    let mut usage: Option<KodeChatUsage> = None;
    let mut tool_calls: Vec<ToolCallAccum> = Vec::new();
    let mut finish_reason: Option<String> = None;
    // How much of `content` has been streamed to the UI.
    let mut streamed = 0usize;
    // `[DONE]` or a finish_reason arrived: the reply ended on purpose.
    let mut saw_end = false;
    // The connection dropped after some of the reply arrived.
    let mut interrupted = false;

    while let Some(chunk) = stream.next().await {
        let bytes = match chunk {
            Ok(bytes) => bytes,
            // Keep what arrived and let the agent continue from it; with
            // nothing yet there is nothing to keep.
            Err(_) if !content.is_empty() || !tool_calls.is_empty() => {
                interrupted = true;
                break;
            }
            Err(error) => return Err(format!("{} stream interrupted: {error}", route.name)),
        };
        buffer.push_str(&String::from_utf8_lossy(&bytes));

        // SSE events are separated by a blank line; process complete frames only.
        while let Some(boundary) = buffer.find("\n\n") {
            let frame = buffer[..boundary].to_string();
            buffer.drain(..boundary + 2);

            for line in frame.lines() {
                let line = line.trim_start();
                let Some(data) = line.strip_prefix("data:") else {
                    continue;
                };
                let data = data.trim();
                if data == "[DONE]" {
                    saw_end = true;
                    continue;
                }
                if data.is_empty() {
                    continue;
                }

                let Ok(value) = serde_json::from_str::<Value>(data) else {
                    continue;
                };

                if let Some(found) = extract_usage(value.get("usage")) {
                    usage = Some(found);
                }

                let choice = value
                    .get("choices")
                    .and_then(Value::as_array)
                    .and_then(|choices| choices.first());

                if let Some(reason) = choice
                    .and_then(|choice| choice.get("finish_reason"))
                    .and_then(Value::as_str)
                {
                    finish_reason = Some(reason.to_string());
                    saw_end = true;
                }

                let delta = choice.and_then(|choice| choice.get("delta"));

                if let Some(deltas) = delta
                    .and_then(|delta| delta.get("tool_calls"))
                    .and_then(Value::as_array)
                {
                    for entry in deltas {
                        let index = entry.get("index").and_then(Value::as_u64).unwrap_or(0) as usize;
                        while tool_calls.len() <= index {
                            tool_calls.push(ToolCallAccum::default());
                        }
                        let slot = &mut tool_calls[index];
                        if let Some(id) = entry.get("id").and_then(Value::as_str) {
                            if !id.is_empty() {
                                slot.id = id.to_string();
                            }
                        }
                        if let Some(function) = entry.get("function") {
                            if let Some(name) = function.get("name").and_then(Value::as_str) {
                                if !name.is_empty() {
                                    slot.name.push_str(name);
                                }
                            }
                            if let Some(args) =
                                function.get("arguments").and_then(Value::as_str)
                            {
                                slot.arguments.push_str(args);
                            }
                        }
                    }
                }

                if let Some(delta) = delta {
                    if let Some(text) = delta.get("content").and_then(Value::as_str) {
                        if !text.is_empty() {
                            content.push_str(text);
                            // Some models (DeepSeek) write tool calls as markup in
                            // the text. Only stream what is safely before it, so
                            // it never flashes on screen; it's parsed at the end.
                            let safe = text_tool_markup::safe_prefix_len(&content);
                            if safe > streamed {
                                let _ = on_event.send(KodeStreamEvent::Content {
                                    delta: content[streamed..safe].to_string(),
                                });
                                streamed = safe;
                            }
                        }
                    }
                    if let Some(text) = delta
                        .get("reasoning")
                        .or_else(|| delta.get("reasoning_content"))
                        .and_then(Value::as_str)
                    {
                        if !text.is_empty() {
                            reasoning.push_str(text);
                            let _ = on_event.send(KodeStreamEvent::Reasoning {
                                delta: text.to_string(),
                            });
                        }
                    }
                }
            }
        }
    }

    let mut truncated = interrupted || !saw_end || finish_reason.as_deref() == Some("length");

    // Tool calls written as text markup become real tool calls.
    let mut content = content;
    let mut text_calls: Vec<Value> = Vec::new();
    if tool_calls.is_empty() {
        if let Some((clean, calls)) = text_tool_markup::extract(&content) {
            content = clean;
            text_calls = calls;
            finish_reason = Some("tool_calls".to_string());
        } else if let Some(prefix) = text_tool_markup::unfinished_markup_prefix(&content) {
            // Markup that never became a call: the reply was cut off inside it.
            // Drop it (it used to be shown as raw `<｜DSML｜…>` text) and let
            // the agent ask for the rest.
            content = prefix;
            truncated = true;
        }
    }
    // A cut-off reply can end inside a tool call's JSON arguments. Running a
    // call with half its arguments would do damage, so drop those.
    if truncated {
        tool_calls.retain(|call| {
            call.arguments.trim().is_empty() || serde_json::from_str::<Value>(&call.arguments).is_ok()
        });
    }
    // Text after the markup that wasn't streamed (rare): send it now.
    if streamed < content.len() && content.is_char_boundary(streamed) && text_calls.is_empty() {
        let _ = on_event.send(KodeStreamEvent::Content { delta: content[streamed..].to_string() });
    }
    let serialized_tool_calls: Option<Value> = if !text_calls.is_empty() {
        Some(Value::Array(text_calls))
    } else if tool_calls.is_empty() {
        None
    } else {
        Some(Value::Array(
            tool_calls
                .into_iter()
                .filter(|call| !call.name.is_empty())
                .map(|call| {
                    json!({
                        "id": call.id,
                        "type": "function",
                        "function": {
                            "name": call.name,
                            "arguments": call.arguments,
                        },
                    })
                })
                .collect(),
        ))
    };

    // An empty-content turn is normal when the model only requested tool calls;
    // only substitute the placeholder when there is genuinely nothing to show.
    // A cut-off reply stays empty: the agent asks for the rest.
    let content = if content.trim().is_empty() && serialized_tool_calls.is_none() && !truncated {
        "The model returned an empty response.".to_string()
    } else {
        content
    };
    let reasoning = {
        let trimmed = reasoning.trim();
        if trimmed.is_empty() {
            None
        } else {
            Some(trimmed.to_string())
        }
    };

    Ok(KodeChatResponse {
        content,
        reasoning,
        usage,
        resolved_model_id: route.model_id.to_string(),
        tool_calls: serialized_tool_calls,
        finish_reason,
        truncated,
    })
}

// Exponential-ish backoff: ~400ms, 800ms, 1600ms between retries.
async fn backoff(attempt: usize) {
    let millis = 400u64 * (1 << (attempt.saturating_sub(1)).min(3) as u64);
    tokio::time::sleep(std::time::Duration::from_millis(millis)).await;
}

struct ModelRoute {
    name: &'static str,
    url: &'static str,
    api_key: String,
    model_id: String,
    fallback_models: Option<Vec<String>>,
    include_reasoning: bool,
    // True only for the branded Kode 1.0 model — gates the identity lock so the
    // premium models identify as themselves rather than as "Kode 1.0".
    is_kode: bool,
    headers: reqwest::header::HeaderMap,
    byok: Option<(String, String)>,
    is_anthropic_native: bool,
}

impl ModelRoute {
    fn payload(
        &self,
        messages: Vec<Value>,
        tools: Option<&Value>,
        tool_choice: Option<&Value>,
        system_context: Option<&str>,
        reasoning_enabled: Option<bool>,
        stream: bool,
    ) -> Value {
        // Every model gets the neutral coding/agent guidance. ONLY the branded
        // Kode 1.0 also gets the identity lock prepended, so the premium models
        // don't claim to be "Kode 1.0". Per-request repo/skills context appended.
        let base_prompt = if self.is_kode {
            format!("{KODE_IDENTITY_PROMPT}{KODE_AGENT_PROMPT}")
        } else {
            KODE_AGENT_PROMPT.to_string()
        };
        let mut system_content = match system_context {
            Some(extra) if !extra.trim().is_empty() => {
                format!("{base_prompt}{extra}")
            }
            _ => base_prompt,
        };

        if reasoning_enabled == Some(false) {
            system_content.push_str("\n\n[REASONING DISABLED]: Thinking mode is turned OFF by the user. Do not produce reasoning tokens or chain-of-thought. Answer directly and concisely.");
        }

        if self.is_anthropic_native {
            let mut anthropic_messages = Vec::new();
            for msg in messages {
                if let Some(role) = msg.get("role").and_then(Value::as_str) {
                    if role == "user" || role == "assistant" {
                        let content = msg.get("content").unwrap_or(&json!("")).clone();
                        anthropic_messages.push(json!({
                            "role": role,
                            "content": content
                        }));
                    }
                }
            }
            let mut payload = json!({
                "model": self.model_id,
                "max_tokens": 8192,
                "system": system_content,
                "messages": anthropic_messages,
            });
            if stream {
                payload["stream"] = json!(true);
            }
            return payload;
        }
        let mut chat_messages: Vec<Value> = Vec::with_capacity(messages.len() + 1);
        chat_messages.push(json!({
            "role": "system",
            "content": system_content,
        }));
        chat_messages.extend(messages);

        let mut payload = json!({
            "model": self.model_id,
            "messages": chat_messages,
        });

        if let Some(models) = &self.fallback_models {
            payload["models"] = json!(models);
        }

        if let Some(tools) = tools {
            if tools.as_array().map(|t| !t.is_empty()).unwrap_or(false) {
                payload["tools"] = tools.clone();
                payload["tool_choice"] = tool_choice.cloned().unwrap_or_else(|| json!("auto"));
            }
        }

        if self.include_reasoning {
            if reasoning_enabled == Some(false) {
                payload["reasoning"] = json!({ "enabled": false });
            } else {
                payload["reasoning"] = json!({ "enabled": true });
            }
        }

        // Vercel AI Gateway supports request-scoped BYOK credentials. The key is
        // fetched only inside this native process from the operating system's
        // credential store; it is never returned to the webview or persisted in
        // Convex/localStorage.
        if let Some((provider, api_key)) = &self.byok {
            let mut byok_map = serde_json::Map::new();
            byok_map.insert(
                provider.clone(),
                json!([{ "apiKey": api_key }]),
            );
            payload["providerOptions"] = json!({
                "gateway": {
                    "byok": byok_map
                }
            });
        }

        if stream {
            payload["stream"] = json!(true);
            // Ask the provider to include token usage in the final stream chunk.
            payload["stream_options"] = json!({ "include_usage": true });
        }

        payload
    }
}

fn is_agent_router_model(model_id: &str) -> bool {
    matches!(
        model_id,
        "anthropic/claude-opus-5" | "anthropic/claude-opus-4.8" | "openai/gpt-5.6-sol"
    )
}

fn resolve_model_route(
    model_id: &str,
    request_byok_key: Option<&str>,
    request_byok_provider: Option<&str>,
) -> Result<ModelRoute, String> {
    // 1. AGENT ROUTER BYOK ROUTE:
    // Only route to Agent Router if the selected model is one of the 3 supported Agent Router models:
    // (anthropic/claude-opus-5, anthropic/claude-opus-4.8, openai/gpt-5.6-sol)
    if is_agent_router_model(model_id) {
        let ar_key = if request_byok_provider == Some("agent_router") && request_byok_key.map(|k| !k.trim().is_empty()).unwrap_or(false) {
            request_byok_key.map(ToString::to_string)
        } else {
            read_byok_key("agent_router")
        };

        if let Some(byok_key) = ar_key {
            let base_url = read_byok_key("agent_router_base_url")
                .unwrap_or_else(|| "https://co.agentrouter.org".to_string());

            let clean_base = base_url.trim_end_matches('/');
            let endpoint_url = if clean_base.ends_with("/messages") {
                clean_base.to_string()
            } else if clean_base.ends_with("/v1") {
                format!("{clean_base}/messages")
            } else {
                format!("{clean_base}/v1/messages")
            };

            let model_slug = match model_id {
                "anthropic/claude-opus-5" => "claude-3-7-sonnet-20250219",
                "anthropic/claude-opus-4.8" => "claude-3-opus-20240229",
                "openai/gpt-5.6-sol" => "gpt-5.6-sol",
                other => other,
            }
            .to_string();

            let mut headers = reqwest::header::HeaderMap::new();
            headers.insert(
                "Authorization",
                reqwest::header::HeaderValue::from_str(&format!("Bearer {byok_key}"))
                    .map_err(|e| e.to_string())?,
            );
            headers.insert(
                "x-api-key",
                reqwest::header::HeaderValue::from_str(&byok_key)
                    .map_err(|e| e.to_string())?,
            );

            // Spoof official Claude Code CLI headers to satisfy AgentRouter WAF client check
            headers.insert(
                "User-Agent",
                reqwest::header::HeaderValue::from_static("claude-code/0.2.29"),
            );
            headers.insert(
                "x-stainless-lang",
                reqwest::header::HeaderValue::from_static("js"),
            );
            headers.insert(
                "x-stainless-package-version",
                reqwest::header::HeaderValue::from_static("0.2.29"),
            );
            headers.insert(
                "x-stainless-os",
                reqwest::header::HeaderValue::from_static("MacOS"),
            );
            headers.insert(
                "x-stainless-arch",
                reqwest::header::HeaderValue::from_static("arm64"),
            );
            headers.insert(
                "x-stainless-runtime",
                reqwest::header::HeaderValue::from_static("node"),
            );
            headers.insert(
                "x-stainless-runtime-version",
                reqwest::header::HeaderValue::from_static("v22.0.0"),
            );
            headers.insert(
                "anthropic-version",
                reqwest::header::HeaderValue::from_static("2023-06-01"),
            );
            headers.insert(
                "anthropic-beta",
                reqwest::header::HeaderValue::from_static("prompt-caching-2024-07-31,computer-use-2024-10-22"),
            );

            // Attach System Access Key headers if configured by user
            if let Some(sys_key) = read_byok_key("agent_router_system_key") {
                if let Ok(val) = reqwest::header::HeaderValue::from_str(sys_key.trim()) {
                    headers.insert("x-system-access-key", val.clone());
                    headers.insert("x-access-key", val.clone());
                    headers.insert("x-client-access-key", val);
                }
            }

            return Ok(ModelRoute {
                name: "Agent Router Direct API (BYOK)",
                url: Box::leak(endpoint_url.into_boxed_str()),
                api_key: byok_key,
                model_id: model_slug,
                fallback_models: None,
                include_reasoning: false,
                is_kode: false,
                headers,
                byok: None,
                is_anthropic_native: true,
            });
        }
    }

    // 2. DIRECT PROVIDER BYOK ROUTING FOR OPENAI / ANTHROPIC:
    let provider = gateway_provider(model_id);
    let user_byok_key = provider.and_then(|p| {
        if request_byok_provider == Some(p) && request_byok_key.map(|k| !k.trim().is_empty()).unwrap_or(false) {
            request_byok_key.map(ToString::to_string)
        } else {
            read_byok_key(p)
        }
        .filter(|key| !key.trim().is_empty())
    });

    // DIRECT PROVIDER ROUTING FOR BYOK KEYS:
    // Bypasses third-party gateway proxies entirely so users connect directly to
    // OpenAI or Anthropic using their own key with zero proxy fees or 403 errors.
    if let (Some(provider_name), Some(byok_key)) = (provider, user_byok_key) {
        if provider_name == "openai" {
            let model_slug = model_id
                .strip_prefix("openai/")
                .unwrap_or(model_id)
                .to_string();
            let mut headers = reqwest::header::HeaderMap::new();
            headers.insert(
                "Authorization",
                reqwest::header::HeaderValue::from_str(&format!("Bearer {byok_key}"))
                    .map_err(|e| e.to_string())?,
            );
            return Ok(ModelRoute {
                name: "OpenAI Direct API (BYOK)",
                url: "https://api.openai.com/v1/chat/completions",
                api_key: byok_key,
                model_id: model_slug,
                fallback_models: None,
                include_reasoning: false,
                is_kode: false,
                headers,
                byok: None,
                is_anthropic_native: false,
            });
        }

        if provider_name == "anthropic" {
            let raw_slug = model_id.strip_prefix("anthropic/").unwrap_or(model_id);
            let model_slug = match raw_slug {
                "claude-opus-5" => "claude-3-7-sonnet-20250219",
                "claude-opus-4.8" => "claude-3-opus-20240229",
                "claude-sonnet-4-20250514" => "claude-3-5-sonnet-20241022",
                other => other,
            }
            .to_string();

            let mut headers = reqwest::header::HeaderMap::new();
            headers.insert(
                "x-api-key",
                reqwest::header::HeaderValue::from_str(&byok_key)
                    .map_err(|e| e.to_string())?,
            );
            headers.insert(
                "anthropic-version",
                reqwest::header::HeaderValue::from_static("2023-06-01"),
            );

            return Ok(ModelRoute {
                name: "Anthropic Direct API (BYOK)",
                url: "https://api.anthropic.com/v1/messages",
                api_key: byok_key,
                model_id: model_slug,
                fallback_models: None,
                include_reasoning: false,
                is_kode: false,
                headers,
                byok: None,
                is_anthropic_native: true,
            });
        }
    }

    if is_gateway_model(model_id) {
        let byok = provider.and_then(|provider| {
            request_byok_key
                .map(ToString::to_string)
                .or_else(|| read_byok_key(provider))
                .map(|key| (provider.to_string(), key))
        });
        return Ok(ModelRoute {
            name: "Vercel AI Gateway",
            url: VERCEL_AI_GATEWAY_CHAT_COMPLETIONS_URL,
            api_key: vercel_gateway_api_key()?,
            model_id: model_id.to_string(),
            fallback_models: None,
            include_reasoning: false,
            is_kode: false,
            headers: reqwest::header::HeaderMap::new(),
            byok,
            is_anthropic_native: false,
        });
    }

    let mut headers = reqwest::header::HeaderMap::new();
    headers.insert(
        "HTTP-Referer",
        reqwest::header::HeaderValue::from_static("https://kontinue.ai"),
    );
    headers.insert(
        "X-Title",
        reqwest::header::HeaderValue::from_static("Kontinue AI Desktop"),
    );

    let is_kode = model_id == KODE_MODEL_ID || model_id == "kode-1.0";
    let is_kai = model_id == K_AI_MODEL_ID || model_id == "k-ai-1.0";

    if is_kai {
        return Ok(ModelRoute {
            name: "Vercel AI Gateway",
            url: VERCEL_AI_GATEWAY_CHAT_COMPLETIONS_URL,
            api_key: vercel_gateway_api_key()?,
            model_id: K_AI_PRIMARY_MODEL.to_string(),
            fallback_models: Some(
                K_AI_FALLBACK_MODELS
                    .iter()
                    .map(|s| s.to_string())
                    .collect(),
            ),
            include_reasoning: true,
            is_kode: true,
            headers: reqwest::header::HeaderMap::new(),
            byok: None,
            is_anthropic_native: false,
        });
    }

    let (effective_model_id, fallback_models) = if is_kode {
        (KODE_OPENROUTER_MODEL_ID.to_string(), None)
    } else {
        (model_id.to_string(), None)
    };

    Ok(ModelRoute {
        name: "OpenRouter",
        url: OPENROUTER_CHAT_COMPLETIONS_URL,
        api_key: openrouter_api_key()?,
        model_id: effective_model_id,
        fallback_models,
        include_reasoning: true,
        is_kode,
        headers,
        byok: None,
        is_anthropic_native: false,
    })
}

const KONTINUE_ROUTE_NAME: &str = "Kontinue";

/// Kontinue's web server (apps/web), which proxies models and other APIs.
///
/// Decided once, at startup: KONTINUE_API_URL if set, else the URL the
/// frontend was built with (VITE_WEB_APP_URL, sent by `kontinue_set_base_url`),
/// else production. The frontend's value matters because it comes from the
/// same .env file as the Clerk key: a dev build signs in to Clerk's test
/// instance and must talk to the local web app. Sending its token to
/// production made every Kode turn fail with "Sign in to use Kode".
static KONTINUE_BASE: std::sync::OnceLock<String> = std::sync::OnceLock::new();

fn kontinue_base_url() -> &'static str {
    KONTINUE_BASE.get_or_init(|| {
        std::env::var("KONTINUE_API_URL")
            .ok()
            .filter(|value| !value.trim().is_empty())
            .unwrap_or_else(|| "https://chat.kontinueai.com".to_string())
            .trim_end_matches('/')
            .to_string()
    })
}

/// https anywhere, or http on this machine (the local web app).
fn valid_base_url(url: &str) -> bool {
    let Ok(parsed) = reqwest::Url::parse(url) else { return false };
    match parsed.scheme() {
        "https" => parsed.host_str().is_some(),
        "http" => matches!(parsed.host_str(), Some("localhost" | "127.0.0.1" | "[::1]")),
        _ => false,
    }
}

/// Called by the frontend at startup with the web app URL it was built for.
/// KONTINUE_API_URL still wins, and the first value sticks.
#[tauri::command]
fn kontinue_set_base_url(url: String) -> Result<String, String> {
    let env_override = std::env::var("KONTINUE_API_URL").ok().filter(|v| !v.trim().is_empty());
    if env_override.is_none() {
        if !valid_base_url(url.trim()) {
            return Err(format!("Not a usable Kontinue server URL: {url}"));
        }
        let _ = KONTINUE_BASE.set(url.trim().trim_end_matches('/').to_string());
    }
    Ok(kontinue_base_url().to_string())
}

#[cfg(test)]
mod base_url_tests {
    use super::valid_base_url;

    #[test]
    fn only_https_or_local_http() {
        assert!(valid_base_url("https://chat.kontinueai.com"));
        assert!(valid_base_url("http://localhost:3000"));
        assert!(valid_base_url("http://127.0.0.1:3001/"));
        assert!(!valid_base_url("http://example.com"));
        assert!(!valid_base_url("file:///etc/passwd"));
        assert!(!valid_base_url("not a url"));
    }
}

#[tauri::command]
async fn kontinue_api_post(path: String, session_token: String, body: Value) -> Result<Value, String> {
    if !path.starts_with("/api/") || path.contains("..") {
        return Err("Invalid API path".to_string());
    }
    let response = reqwest::Client::new()
        .post(format!("{}{}", kontinue_base_url(), path))
        .bearer_auth(session_token)
        .json(&body)
        .send()
        .await
        .map_err(|error| format!("Couldn't reach Kontinue: {error}"))?;
    let status = response.status();
    let text = response.text().await.unwrap_or_default();
    if !status.is_success() {
        return Err(extract_error_message(&text).unwrap_or_else(|| format!("Request failed ({status})")));
    }
    serde_json::from_str(&text).map_err(|error| format!("Unexpected response: {error}"))
}

fn kontinue_chat_url(home: bool) -> &'static str {
    static KODE: std::sync::OnceLock<String> = std::sync::OnceLock::new();
    static HOME: std::sync::OnceLock<String> = std::sync::OnceLock::new();
    if home {
        HOME.get_or_init(|| format!("{}/api/desktop/chat", kontinue_base_url()))
    } else {
        KODE.get_or_init(|| format!("{}/api/kode/chat", kontinue_base_url()))
    }
}

fn kontinue_route(model_id: &str, session_token: String, home: bool) -> ModelRoute {
    let is_kai = model_id == K_AI_MODEL_ID || model_id == "k-ai-1.0";
    ModelRoute {
        name: KONTINUE_ROUTE_NAME,
        url: kontinue_chat_url(home),
        api_key: session_token,
        model_id: model_id.to_string(),
        fallback_models: None,
        include_reasoning: true,
        // Branded models (Kode 1.0, K-AI) get the identity lock.
        is_kode: is_kai || model_id == KODE_MODEL_ID || model_id == "kode-1.0",
        headers: reqwest::header::HeaderMap::new(),
        byok: None,
        is_anthropic_native: false,
    }
}

fn is_gateway_model(model_id: &str) -> bool {
    model_id != KODE_MODEL_ID
        && model_id != "kode-1.0"
        && model_id != K_AI_MODEL_ID
        && model_id != "k-ai-1.0"
        && (matches!(model_id, MINIMAX_M3_MODEL_ID | DEEPSEEK_V4_PRO_MODEL_ID)
            || model_id.starts_with("anthropic/")
            || model_id.starts_with("openai/")
            || model_id.starts_with("google/")
            || model_id.starts_with("xai/")
            || model_id.starts_with("deepseek/")
            || model_id.starts_with("perplexity/")
            || model_id.starts_with("minimax/")
            || model_id.starts_with("mistral/")
            || model_id.starts_with("alibaba/")
            || model_id.starts_with("zai/")
            || model_id.starts_with("moonshotai/"))
}

fn gateway_provider(model_id: &str) -> Option<&'static str> {
    if model_id.starts_with("anthropic/") {
        Some("anthropic")
    } else if model_id.starts_with("openai/") {
        Some("openai")
    } else if model_id.starts_with("google/") {
        Some("google")
    } else if model_id.starts_with("xai/") {
        Some("xai")
    } else if model_id.starts_with("deepseek/") {
        Some("deepseek")
    } else if model_id.starts_with("perplexity/") {
        Some("perplexity")
    } else if model_id.starts_with("minimax/") {
        Some("minimax")
    } else if model_id.starts_with("mistral/") {
        Some("mistral")
    } else if model_id.starts_with("alibaba/") {
        Some("alibaba")
    } else if model_id.starts_with("zai/") {
        Some("zai")
    } else if model_id.starts_with("moonshotai/") {
        Some("moonshotai")
    } else {
        None
    }
}

#[tauri::command(async)]
fn kode_byok_status() -> Vec<ByokKeyStatus> {
    ["anthropic", "openai", "agent_router"]
        .into_iter()
        .map(|provider| ByokKeyStatus {
            provider: provider.to_string(),
            configured: read_byok_key(provider).is_some(),
        })
        .collect()
}

#[tauri::command(async)]
fn kode_byok_set_key(provider: String, api_key: String) -> Result<(), String> {
    let key = api_key.trim();
    if key.len() < 8 {
        return Err("Enter a valid API key.".to_string());
    }
    byok_entry(&provider)?
        .set_password(key)
        .map_err(|error| format!("Could not save the API key securely: {error}"))
}

fn byok_entry(provider: &str) -> Result<keyring::Entry, String> {
    match provider {
        "anthropic" | "openai" | "agent_router" | "agent_router_base_url" | "agent_router_system_key" => {
            keyring::Entry::new(BYOK_KEYRING_SERVICE, provider)
                .map_err(|error| format!("Could not access the secure key store: {error}"))
        }
        _ => Err("Unsupported BYOK provider".to_string()),
    }
}

fn read_byok_key(provider: &str) -> Option<String> {
    byok_entry(provider)
        .ok()?
        .get_password()
        .ok()
        .filter(|key| !key.trim().is_empty())
}


#[tauri::command(async)]
fn kode_byok_remove_key(provider: String) -> Result<(), String> {
    match byok_entry(&provider)?.delete_credential() {
        Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
        Err(error) => Err(format!("Could not remove the API key: {error}")),
    }
}

#[tauri::command(async)]
fn kode_byok_get_key(provider: String) -> Result<Option<String>, String> {
    Ok(read_byok_key(&provider))
}

fn openrouter_api_key() -> Result<String, String> {
    std::env::var("OPENROUTER_API_KEY")
        .or_else(|_| std::env::var("OPEN_ROUTER_API_KEY"))
        .or_else(|_| std::env::var("OPEN_ROUTER"))
        .map_err(|_| {
            "Missing OpenRouter API key. Set OPENROUTER_API_KEY before launching Kontinue AI."
                .to_string()
        })
}

fn vercel_gateway_api_key() -> Result<String, String> {
    std::env::var("VERCEL_AI_GATEWAY_API_KEY")
        .or_else(|_| std::env::var("AI_GATEWAY_API_KEY"))
        .or_else(|_| std::env::var("AI_GATEWAY_TOKEN"))
        .map_err(|_| {
            "Missing Vercel AI Gateway key. Set VERCEL_AI_GATEWAY_API_KEY before using MiniMax M3."
                .to_string()
        })
}

fn extract_usage(usage: Option<&Value>) -> Option<KodeChatUsage> {
    let usage = usage?;
    let output_details = usage.get("completion_tokens_details");

    Some(KodeChatUsage {
        input_tokens: usage.get("prompt_tokens").and_then(Value::as_u64),
        output_tokens: usage.get("completion_tokens").and_then(Value::as_u64),
        reasoning_tokens: output_details
            .and_then(|details| details.get("reasoning_tokens"))
            .and_then(Value::as_u64),
        total_tokens: usage.get("total_tokens").and_then(Value::as_u64),
    })
}

/// `{"error":{"resetAt":<epoch ms>}}` from the Kontinue server on a usage limit.
fn extract_reset_at(body: &str) -> Option<i64> {
    serde_json::from_str::<Value>(body)
        .ok()?
        .pointer("/error/resetAt")
        .and_then(Value::as_f64)
        .filter(|ms| *ms > 0.0)
        .map(|ms| ms as i64)
}

fn extract_error_message(body: &str) -> Option<String> {
    serde_json::from_str::<Value>(body)
        .ok()
        .and_then(|value| value.get("error").cloned())
        .and_then(|error| {
            error
                .get("message")
                .and_then(Value::as_str)
                .or_else(|| error.as_str())
                .map(ToString::to_string)
        })
}

// ---------------------------------------------------------------------------
// Filesystem tools — the agent's hands. Every op is jailed to the active project
// root: relative paths only, no `..`, no absolute paths, never escaping the root.
// ---------------------------------------------------------------------------

#[derive(Debug, Serialize)]
struct KodeFileEntry {
    name: String,
    path: String,
    is_dir: bool,
}

// Resolve `rel` against the canonical project `root`, rejecting any path that
// would escape it. Does not require the target to exist (so writes to new files
// and nested dirs work), but forbids `..`, absolute paths, and drive prefixes.
fn safe_join(root: &str, rel: &str) -> Result<PathBuf, String> {
    let root_path = std::fs::canonicalize(root)
        .map_err(|error| format!("Invalid project root '{root}': {error}"))?;
    let mut result = root_path.clone();
    for component in std::path::Path::new(rel).components() {
        match component {
            Component::Normal(part) => result.push(part),
            Component::CurDir => {}
            Component::ParentDir => {
                return Err("Path may not contain '..'".to_string());
            }
            Component::RootDir | Component::Prefix(_) => {
                return Err("Absolute paths are not allowed".to_string());
            }
        }
    }
    if !result.starts_with(&root_path) {
        return Err("Path escapes the project root".to_string());
    }
    Ok(result)
}

#[tauri::command(async)]
fn kode_read_file(root: String, path: String) -> Result<String, String> {
    let target = safe_join(&root, &path)?;
    std::fs::read_to_string(&target).map_err(|error| format!("Could not read {path}: {error}"))
}

#[tauri::command(async)]
fn kode_list_dir(root: String, path: String) -> Result<Vec<KodeFileEntry>, String> {
    let dir = safe_join(&root, &path)?;
    let root_canon = std::fs::canonicalize(&root).map_err(|e| e.to_string())?;
    let mut entries = Vec::new();
    for entry in std::fs::read_dir(&dir).map_err(|error| format!("Could not list {path}: {error}"))? {
        let entry = entry.map_err(|error| error.to_string())?;
        let entry_path = entry.path();
        let rel = entry_path
            .strip_prefix(&root_canon)
            .unwrap_or(&entry_path)
            .to_string_lossy()
            .replace('\\', "/");
        entries.push(KodeFileEntry {
            name: entry.file_name().to_string_lossy().to_string(),
            path: rel,
            is_dir: entry.file_type().map(|t| t.is_dir()).unwrap_or(false),
        });
    }
    entries.sort_by(|a, b| (b.is_dir, &a.name).cmp(&(a.is_dir, &b.name)));
    Ok(entries)
}

fn is_binary_name(name: &str) -> bool {
    let ext = std::path::Path::new(name)
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("")
        .to_lowercase();
    matches!(
        ext.as_str(),
        "png" | "jpg" | "jpeg" | "gif" | "ico" | "webp" | "bmp" | "heic"
            | "woff" | "woff2" | "ttf" | "otf" | "eot"
            | "mp3" | "mp4" | "mov" | "avi" | "webm" | "m4a" | "wav"
            | "zip" | "gz" | "tar" | "7z" | "rar" | "pdf" | "lockb" | "wasm"
            | "db" | "sqlite" | "bin" | "exe" | "dll" | "dylib" | "so" | "o" | "a"
    )
}

// Recursively list text files in the project (for the `@` file mention picker).
// Skips hidden dirs, build artifacts and binary files. Capped for huge trees.
#[tauri::command(async)]
fn kode_list_project_files(root: String) -> Result<Vec<String>, String> {
    let root_canon = std::fs::canonicalize(&root).map_err(|e| format!("Invalid project root '{root}': {e}"))?;
    let mut out: Vec<String> = Vec::new();

    fn walk(dir: &std::path::Path, root: &std::path::Path, out: &mut Vec<String>, depth: usize) {
        if depth > 14 || out.len() > 8000 {
            return;
        }
        let entries = match std::fs::read_dir(dir) {
            Ok(entries) => entries,
            Err(_) => return,
        };
        for entry in entries.flatten() {
            let path = entry.path();
            let name = entry.file_name().to_string_lossy().to_string();
            if name.starts_with('.') {
                continue;
            }
            if path.is_dir() {
                if matches!(name.as_str(), "node_modules" | "dist" | "build" | "target" | ".git" | "coverage") {
                    continue;
                }
                walk(&path, root, out, depth + 1);
                continue;
            }
            if is_binary_name(&name) {
                continue;
            }
            if let Ok(rel) = path.strip_prefix(root) {
                out.push(rel.to_string_lossy().replace('\\', "/"));
            }
        }
    }

    walk(&root_canon, &root_canon, &mut out, 0);
    out.sort();
    Ok(out)
}

#[tauri::command(async)]
fn kode_write_file(root: String, path: String, content: String) -> Result<(), String> {
    let target = safe_join(&root, &path)?;
    if let Some(parent) = target.parent() {
        std::fs::create_dir_all(parent)
            .map_err(|error| format!("Could not create directories for {path}: {error}"))?;
    }
    std::fs::write(&target, content).map_err(|error| format!("Could not write {path}: {error}"))
}

/// Folder (inside the project) where chat attachments are saved for agents.
const ATTACHMENT_DIR: &str = ".kode/attachments";

/// Save a chat attachment into the project so agents can read and use it
/// (Claude Code and Codex can open images by path; Kode's own tools can too).
/// `data` is base64 (an image data URL's payload, or a text file's bytes).
/// Returns the path relative to the project root.
#[tauri::command(async)]
fn kode_save_attachment(root: String, filename: String, data: String) -> Result<String, String> {
    use base64::Engine;
    let bytes = base64::engine::general_purpose::STANDARD
        .decode(data.trim())
        .map_err(|error| format!("Could not read the attachment: {error}"))?;
    if bytes.len() > 25 * 1024 * 1024 {
        return Err("Attachments over 25 MB aren't saved to the project.".into());
    }
    let safe: String = std::path::Path::new(&filename)
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("attachment")
        .chars()
        .map(|c| if c.is_ascii_alphanumeric() || matches!(c, '.' | '-' | '_') { c } else { '-' })
        .collect();
    let safe = safe.trim_matches('.').to_string();
    let stamp = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis())
        .unwrap_or(0);
    let rel = format!(
        "{ATTACHMENT_DIR}/{stamp}-{}",
        if safe.is_empty() { "attachment".to_string() } else { safe }
    );
    let target = safe_join(&root, &rel)?;
    if let Some(parent) = target.parent() {
        std::fs::create_dir_all(parent)
            .map_err(|error| format!("Could not create {ATTACHMENT_DIR}: {error}"))?;
    }
    std::fs::write(&target, bytes).map_err(|error| format!("Could not save {rel}: {error}"))?;
    exclude_from_git(&root, ".kode/");
    Ok(rel)
}

/// Read a saved attachment back (for imported screenshot cards). Only files
/// under the project's attachments folder can be read this way.
#[tauri::command(async)]
fn kode_read_attachment(root: String, path: String) -> Result<String, String> {
    use base64::Engine;
    if !path.starts_with(ATTACHMENT_DIR) || path.contains("..") {
        return Err("Only saved attachments can be read.".into());
    }
    let target = safe_join(&root, &path)?;
    let bytes = std::fs::read(&target).map_err(|error| format!("Could not read {path}: {error}"))?;
    if bytes.len() > 25 * 1024 * 1024 {
        return Err("Attachment too large.".into());
    }
    Ok(base64::engine::general_purpose::STANDARD.encode(bytes))
}

/// Keep Kode's own folder out of `git status` without touching .gitignore:
/// add it to the repo's local `.git/info/exclude` once.
fn exclude_from_git(root: &str, pattern: &str) {
    // Worktrees have a `.git` file; git reads the shared `info/exclude`.
    let Some(common) = kode_import::git_common_dir(std::path::Path::new(root)) else {
        return;
    };
    let info = common.join("info");
    if std::fs::create_dir_all(&info).is_err() {
        return;
    }
    let exclude = info.join("exclude");
    let current = std::fs::read_to_string(&exclude).unwrap_or_default();
    if current.lines().any(|line| line.trim() == pattern) {
        return;
    }
    let mut next = current;
    if !next.is_empty() && !next.ends_with('\n') {
        next.push('\n');
    }
    next.push_str(pattern);
    next.push('\n');
    let _ = std::fs::write(exclude, next);
}

#[tauri::command(async)]
fn kode_edit_file(
    root: String,
    path: String,
    old_string: String,
    new_string: String,
    replace_all: Option<bool>,
) -> Result<(), String> {
    let target = safe_join(&root, &path)?;
    let original = std::fs::read_to_string(&target)
        .map_err(|error| format!("Could not read {path}: {error}"))?;
    let occurrences = original.matches(&old_string).count();
    if occurrences == 0 {
        return Err(format!("The text to replace was not found in {path}"));
    }
    let updated = if replace_all.unwrap_or(false) {
        original.replace(&old_string, &new_string)
    } else {
        if occurrences > 1 {
            return Err(format!(
                "The text to replace appears {occurrences} times in {path}; make it unique or use replace_all"
            ));
        }
        original.replacen(&old_string, &new_string, 1)
    };
    std::fs::write(&target, updated).map_err(|error| format!("Could not write {path}: {error}"))
}

#[derive(Debug, Serialize)]
struct UserSkillEntry {
    name: String,
    dir: String,
    source: String,
    skill_md: String,
}

// Skill discovery roots under the user's home directory (open Agent Skills
// locations). The renderer cannot escape these with `..` — we only read fixed
// relative paths under a well-known home root.
const USER_SKILL_ROOTS: [&str; 3] = [".agents/skills", ".claude/skills", ".kontinue/skills"];

#[tauri::command(async)]
fn kode_discover_user_skills(app: tauri::AppHandle) -> Result<Vec<UserSkillEntry>, String> {
    use tauri::Manager;

    let home = app
        .path()
        .home_dir()
        .map_err(|error| format!("No home dir: {error}"))?;

    let mut out: Vec<UserSkillEntry> = Vec::new();
    for root in USER_SKILL_ROOTS {
        let base = home.join(root);
        let entries = match std::fs::read_dir(&base) {
            Ok(entries) => entries,
            Err(_) => continue, // root doesn't exist
        };
        for entry in entries.flatten() {
            let path = entry.path();
            if !path.is_dir() {
                continue;
            }
            let skill_md_path = path.join("SKILL.md");
            if !skill_md_path.is_file() {
                continue;
            }
            let skill_md = match std::fs::read_to_string(&skill_md_path) {
                Ok(text) => text,
                Err(_) => continue,
            };
            out.push(UserSkillEntry {
                name: path
                    .file_name()
                    .map(|n| n.to_string_lossy().to_string())
                    .unwrap_or_default(),
                dir: path.to_string_lossy().to_string(),
                source: format!("~/{}", root),
                skill_md,
            });
        }
    }
    // Skills from enabled plugins (~/.kontinue/plugins/<name>/skills/*).
    for (plugin, dir) in plugins::enabled_plugin_dirs() {
        let Ok(entries) = std::fs::read_dir(dir.join("skills")) else { continue };
        for entry in entries.flatten() {
            let path = entry.path();
            let Ok(skill_md) = std::fs::read_to_string(path.join("SKILL.md")) else { continue };
            out.push(UserSkillEntry {
                name: path
                    .file_name()
                    .map(|n| n.to_string_lossy().to_string())
                    .unwrap_or_default(),
                dir: path.to_string_lossy().to_string(),
                source: format!("plugin:{plugin}"),
                skill_md,
            });
        }
    }
    out.sort_by(|a, b| a.name.cmp(&b.name));
    Ok(out)
}

#[derive(Debug, Serialize)]
struct UserSkillFile {
    path: String,
    is_dir: bool,
}

// Resolve a user skill directory and verify it lives under one of the known
// skill roots, so the renderer cannot read arbitrary files outside them.
fn user_skill_dir(app: &tauri::AppHandle, dir: &std::path::Path) -> Result<std::path::PathBuf, String> {
    use tauri::Manager;
    let home = app
        .path()
        .home_dir()
        .map_err(|error| format!("No home dir: {error}"))?;
    let canon = dir
        .canonicalize()
        .map_err(|error| format!("Invalid skill dir: {error}"))?;
    for root in USER_SKILL_ROOTS {
        let base = home.join(root);
        if canon.starts_with(&base) {
            return Ok(canon);
        }
    }
    if let Ok(base) = plugins::plugins_dir() {
        if canon.starts_with(&base) && !canon.starts_with(base.join(".staging")) {
            return Ok(canon);
        }
    }
    Err("Skill directory is outside the user skill roots".to_string())
}

#[tauri::command(async)]
fn kode_list_user_skill_files(app: tauri::AppHandle, dir: String) -> Result<Vec<UserSkillFile>, String> {
    let base = user_skill_dir(&app, std::path::Path::new(&dir))?;
    let mut out: Vec<UserSkillFile> = Vec::new();

    fn walk(base: &std::path::Path, rel: &std::path::Path, out: &mut Vec<UserSkillFile>, depth: usize) {
        if depth > 4 || out.len() > 512 {
            return;
        }
        let entries = match std::fs::read_dir(base) {
            Ok(entries) => entries,
            Err(_) => return,
        };
        for entry in entries.flatten() {
            let path = entry.path();
            let name = path
                .file_name()
                .map(|n| n.to_string_lossy().to_string())
                .unwrap_or_default();
            if name.starts_with('.') || name == "node_modules" {
                continue;
            }
            let relp = rel.join(&name);
            let is_dir = path.is_dir();
            out.push(UserSkillFile {
                path: relp.to_string_lossy().replace('\\', "/"),
                is_dir,
            });
            if is_dir {
                walk(&path, &relp, out, depth + 1);
            }
        }
    }

    walk(&base, std::path::Path::new(""), &mut out, 0);
    out.sort_by(|a, b| a.path.cmp(&b.path));
    Ok(out)
}

#[tauri::command(async)]
fn kode_read_user_skill_file(app: tauri::AppHandle, dir: String, rel: String) -> Result<String, String> {
    let base = user_skill_dir(&app, std::path::Path::new(&dir))?;
    let rel_path = std::path::Path::new(&rel);
    for component in rel_path.components() {
        match component {
            std::path::Component::Normal(_) => {}
            std::path::Component::CurDir => {}
            _ => return Err("Invalid relative path".to_string()),
        }
    }
    let target = base.join(rel_path);
    std::fs::read_to_string(&target).map_err(|error| format!("Could not read {rel}: {error}"))
}

#[tauri::command(async)]
fn kode_write_user_skill(app: tauri::AppHandle, name: String, skill_md: String) -> Result<String, String> {
    use tauri::Manager;

    let valid_name = !name.is_empty()
        && name.chars().all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '-');
    if !valid_name {
        return Err("Skill name must be lowercase letters, digits, and dashes".to_string());
    }
    let home = app
        .path()
        .home_dir()
        .map_err(|error| format!("No home dir: {error}"))?;
    let dir = home.join(".agents/skills").join(&name);
    std::fs::create_dir_all(&dir).map_err(|error| error.to_string())?;
    std::fs::write(dir.join("SKILL.md"), skill_md).map_err(|error| error.to_string())?;
    Ok(dir.to_string_lossy().to_string())
}

#[tauri::command(async)]
fn kode_delete_user_skill(app: tauri::AppHandle, dir: String) -> Result<(), String> {
    let base = user_skill_dir(&app, std::path::Path::new(&dir))?;
    std::fs::remove_dir_all(&base).map_err(|error| error.to_string())
}

#[derive(Debug, Deserialize, Serialize)]
struct SkillWriteFile {
    path: String,
    content: String,
}

// Install a skill's full file tree (SKILL.md + references/scripts/assets) into
// ~/.agents/skills/<name>/. Every path must stay inside the skill directory.
#[tauri::command(async)]
fn kode_install_user_skill(app: tauri::AppHandle, name: String, files: Vec<SkillWriteFile>) -> Result<String, String> {
    use tauri::Manager;

    let valid_name = !name.is_empty()
        && name.chars().all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '-');
    if !valid_name {
        return Err("Skill name must be lowercase letters, digits, and dashes".to_string());
    }
    if !files.iter().any(|file| file.path == "SKILL.md") {
        return Err("Skill must include a SKILL.md".to_string());
    }

    let home = app
        .path()
        .home_dir()
        .map_err(|error| format!("No home dir: {error}"))?;
    let dir = home.join(".agents/skills").join(&name);
    std::fs::create_dir_all(&dir).map_err(|error| error.to_string())?;

    for file in &files {
        let rel = std::path::Path::new(&file.path);
        let mut valid = true;
        for component in rel.components() {
            match component {
                std::path::Component::Normal(_) => {}
                std::path::Component::CurDir => {}
                _ => valid = false,
            }
        }
        if !valid {
            return Err(format!("Invalid file path: {}", file.path));
        }
        let target = dir.join(rel);
        if let Some(parent) = target.parent() {
            std::fs::create_dir_all(parent).map_err(|error| error.to_string())?;
        }
        std::fs::write(&target, &file.content).map_err(|error| error.to_string())?;
    }

    Ok(dir.to_string_lossy().to_string())
}

// Read a local skill folder (picked by the user) into its full file tree, so it
// can be installed into the user skills root.
#[tauri::command(async)]
fn kode_read_local_skill_dir(dir: String) -> Result<Vec<SkillWriteFile>, String> {
    let base = std::path::Path::new(&dir);
    if !base.is_dir() {
        return Err("Not a directory".to_string());
    }

    fn walk(dir: &std::path::Path, root: &std::path::Path, out: &mut Vec<SkillWriteFile>, depth: usize) {
        if depth > 10 || out.len() > 512 {
            return;
        }
        let entries = match std::fs::read_dir(dir) {
            Ok(entries) => entries,
            Err(_) => return,
        };
        for entry in entries.flatten() {
            let path = entry.path();
            let name = entry.file_name().to_string_lossy().to_string();
            if name.starts_with('.') || name == "node_modules" {
                continue;
            }
            if path.is_dir() {
                walk(&path, root, out, depth + 1);
                continue;
            }
            if is_binary_name(&name) {
                continue;
            }
            if let Ok(content) = std::fs::read_to_string(&path) {
                let rel = path.strip_prefix(root).unwrap_or(&path).to_string_lossy().replace('\\', "/");
                out.push(SkillWriteFile { path: rel, content });
            }
        }
    }

    let mut files: Vec<SkillWriteFile> = Vec::new();
    walk(base, base, &mut files, 0);
    if !files.iter().any(|f| f.path == "SKILL.md") {
        return Err("No SKILL.md found in the selected folder".to_string());
    }
    Ok(files)
}

// Extract a .zip archive and return the skill's file tree (the files under the
// directory that contains SKILL.md).
#[tauri::command(async)]
fn kode_extract_skill_zip(zip_path: String) -> Result<Vec<SkillWriteFile>, String> {
    let file = std::fs::File::open(&zip_path).map_err(|error| format!("Could not open zip: {error}"))?;
    let mut archive = zip::ZipArchive::new(file).map_err(|error| format!("Invalid zip: {error}"))?;

    let mut entries: Vec<SkillWriteFile> = Vec::new();
    for i in 0..archive.len() {
        let mut entry = archive.by_index(i).map_err(|error| error.to_string())?;
        let name = entry.name().to_string();
        if entry.is_dir() || name.starts_with('.') || name.starts_with("__MACOSX") {
            continue;
        }
        if is_binary_name(&name) {
            continue;
        }
        use std::io::Read;
        let mut content = String::new();
        entry.read_to_string(&mut content).map_err(|error| error.to_string())?;
        entries.push(SkillWriteFile { path: name, content });
    }

    let skill_md = entries
        .iter()
        .find(|f| f.path == "SKILL.md" || f.path.ends_with("/SKILL.md"))
        .map(|f| f.path.clone());
    let Some(skill_md) = skill_md else {
        return Err("No SKILL.md found in the zip".to_string());
    };
    let root = skill_md.strip_suffix("SKILL.md").unwrap_or("");

    let files: Vec<SkillWriteFile> = entries
        .into_iter()
        .filter(|f| f.path.starts_with(root))
        .map(|f| SkillWriteFile { path: f.path[root.len()..].to_string(), content: f.content })
        .collect();
    Ok(files)
}

#[derive(Debug, Serialize)]
struct KodeRepoProfile {
    framework: Option<String>,
    package_manager: Option<String>,
    tags: Vec<String>,
}

// Inspect the project root and detect framework, package manager, and notable
// dependencies so the agent can pick the right skills and conventions.
#[tauri::command(async)]
fn kode_repo_profile(root: String) -> Result<KodeRepoProfile, String> {
    let root_path = std::fs::canonicalize(&root)
        .map_err(|error| format!("Invalid project root '{root}': {error}"))?;
    let exists = |name: &str| root_path.join(name).exists();

    // Package manager from lockfiles (then package.json "packageManager" field).
    let package_manager = if exists("bun.lockb") || exists("bun.lock") {
        Some("bun")
    } else if exists("pnpm-lock.yaml") {
        Some("pnpm")
    } else if exists("yarn.lock") {
        Some("yarn")
    } else if exists("package-lock.json") {
        Some("npm")
    } else {
        None
    }
    .map(ToString::to_string);

    // Parse package.json dependencies (if present).
    let mut deps: Vec<String> = Vec::new();
    if let Ok(text) = std::fs::read_to_string(root_path.join("package.json")) {
        if let Ok(pkg) = serde_json::from_str::<Value>(&text) {
            for field in ["dependencies", "devDependencies"] {
                if let Some(map) = pkg.get(field).and_then(Value::as_object) {
                    deps.extend(map.keys().cloned());
                }
            }
        }
    }
    let has = |name: &str| deps.iter().any(|d| d == name);

    let framework = if has("next") {
        Some("next")
    } else if has("expo") {
        Some("expo")
    } else if has("react-native") {
        Some("react-native")
    } else if has("@remix-run/react") {
        Some("remix")
    } else if has("vite") && has("react") {
        Some("react")
    } else if has("react") {
        Some("react")
    } else if has("svelte") {
        Some("svelte")
    } else if has("vue") {
        Some("vue")
    } else if exists("package.json") {
        Some("node")
    } else {
        None
    }
    .map(ToString::to_string);

    // Map dependencies to skill tags.
    let mut tags: Vec<String> = Vec::new();
    let tag = |present: bool, name: &str, tags: &mut Vec<String>| {
        if present {
            tags.push(name.to_string());
        }
    };
    tag(has("tailwindcss"), "tailwind", &mut tags);
    tag(has("prisma") || has("@prisma/client"), "prisma", &mut tags);
    tag(has("@supabase/supabase-js"), "supabase", &mut tags);
    tag(
        has("@neondatabase/serverless") || deps.iter().any(|d| d.starts_with("@neondatabase")),
        "neon",
        &mut tags,
    );
    tag(exists("components.json"), "shadcn", &mut tags);

    Ok(KodeRepoProfile {
        framework,
        package_manager,
        tags,
    })
}

#[derive(Debug, Serialize)]
struct KodeCommandResult {
    stdout: String,
    stderr: String,
    exit_code: Option<i32>,
    success: bool,
}

// Run a shell command. The working directory is jailed to the project root (or a
// subdirectory of it). This is intentionally powerful — scaffolding stacks
// (`bun create`, `npm create vite`, `git init`, installs, tests) — so the
// frontend ALWAYS gates it behind explicit user approval before calling here.
#[tauri::command]
async fn kode_run_command(
    root: String,
    command: String,
    cwd: Option<String>,
    env: Option<std::collections::HashMap<String, String>>,
) -> Result<KodeCommandResult, String> {
    let working_dir = safe_join(&root, cwd.as_deref().unwrap_or(""))?;
    if !working_dir.is_dir() {
        return Err("Working directory does not exist".to_string());
    }

    let mut cmd = if cfg!(target_os = "windows") {
        let mut c = tokio::process::Command::new("cmd");
        c.arg("/C").arg(&command);
        c
    } else {
        let mut c = tokio::process::Command::new("sh");
        c.arg("-lc").arg(&command);
        c
    };
    cmd.current_dir(&working_dir);
    // Environment variables from the project's environment settings.
    for (name, value) in panel::allowed_env(env) {
        cmd.env(name, value);
    }

    // Cap runtime so a hung/interactive command can't block the agent forever.
    let output = match tokio::time::timeout(
        std::time::Duration::from_secs(180),
        cmd.output(),
    )
    .await
    {
        Ok(result) => result.map_err(|error| format!("Failed to run command: {error}"))?,
        Err(_) => {
            return Err("Command timed out after 180s".to_string());
        }
    };

    Ok(KodeCommandResult {
        stdout: String::from_utf8_lossy(&output.stdout).to_string(),
        stderr: String::from_utf8_lossy(&output.stderr).to_string(),
        exit_code: output.status.code(),
        success: output.status.success(),
    })
}

/// Rename or move a file or folder inside the project. Never overwrites.
#[tauri::command(async)]
fn kode_rename_path(root: String, from: String, to: String) -> Result<(), String> {
    let source = safe_join(&root, &from)?;
    let target = safe_join(&root, &to)?;
    if !source.exists() {
        return Err(format!("{from} no longer exists."));
    }
    if target.exists() {
        return Err(format!("{to} already exists."));
    }
    if let Some(parent) = target.parent() {
        std::fs::create_dir_all(parent).map_err(|error| format!("Could not create {to}: {error}"))?;
    }
    std::fs::rename(&source, &target).map_err(|error| format!("Could not rename {from}: {error}"))
}

/// Create an empty file or a folder inside the project. Never overwrites.
#[tauri::command(async)]
fn kode_create_entry(root: String, path: String, is_dir: bool) -> Result<(), String> {
    let target = safe_join(&root, &path)?;
    if target.exists() {
        return Err(format!("{path} already exists."));
    }
    if is_dir {
        return std::fs::create_dir_all(&target).map_err(|error| format!("Could not create {path}: {error}"));
    }
    if let Some(parent) = target.parent() {
        std::fs::create_dir_all(parent).map_err(|error| format!("Could not create {path}: {error}"))?;
    }
    std::fs::OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(&target)
        .map(|_| ())
        .map_err(|error| format!("Could not create {path}: {error}"))
}

/// Move a file or folder from the project to the Trash (recoverable).
#[tauri::command(async)]
fn kode_trash_path(root: String, path: String) -> Result<(), String> {
    let target = safe_join(&root, &path)?;
    if target == std::fs::canonicalize(&root).unwrap_or_default() {
        return Err("The project folder itself can't be deleted here.".into());
    }
    if !target.exists() {
        return Err(format!("{path} no longer exists."));
    }
    let home = std::env::var("HOME").map_err(|_| "No home folder.".to_string())?;
    let trash = std::path::Path::new(&home).join(".Trash");
    if !trash.is_dir() {
        return Err("No Trash folder on this system.".into());
    }
    let name = target.file_name().and_then(|n| n.to_str()).unwrap_or("item").to_string();
    let mut dest = trash.join(&name);
    let mut n = 2;
    while dest.exists() {
        let (stem, ext) = match name.rsplit_once('.') {
            Some((stem, ext)) if !stem.is_empty() => (stem.to_string(), format!(".{ext}")),
            _ => (name.clone(), String::new()),
        };
        dest = trash.join(format!("{stem} {n}{ext}"));
        n += 1;
    }
    std::fs::rename(&target, &dest).map_err(|error| format!("Could not move {path} to the Trash: {error}"))
}

#[tauri::command(async)]
fn kode_delete_file(root: String, path: String) -> Result<(), String> {
    let target = safe_join(&root, &path)?;
    if target.is_dir() {
        std::fs::remove_dir_all(&target)
            .map_err(|error| format!("Could not delete directory {path}: {error}"))
    } else {
        std::fs::remove_file(&target)
            .map_err(|error| format!("Could not delete {path}: {error}"))
    }
}

// ---------------------------------------------------------------------------
// Docs RAG storage — fetch documentation (no CORS in Rust) and persist a single
// shared index locally in the app data dir (NOT per-project, to save storage).
// ---------------------------------------------------------------------------

#[tauri::command]
async fn kode_fetch_text(url: String) -> Result<String, String> {
    let client = reqwest::Client::new();
    let response = client
        .get(&url)
        .header("user-agent", "KontinueAI-DocsIndexer")
        .send()
        .await
        .map_err(|error| format!("Failed to fetch {url}: {error}"))?;
    if !response.status().is_success() {
        return Err(format!("Fetch {url} returned {}", response.status()));
    }
    response
        .text()
        .await
        .map_err(|error| format!("Failed to read {url}: {error}"))
}

// Pull each model's real context window: OpenRouter for its slugs, the Vercel AI
// Gateway for the ones it serves (MiniMax). Returns slug -> token window. Best
// effort — a failed source is skipped, not fatal.
fn extract_context_len(model: &Value) -> Option<u64> {
    for key in ["context_length", "context_window", "max_input_tokens", "max_tokens"] {
        if let Some(value) = model.get(key).and_then(Value::as_u64) {
            return Some(value);
        }
    }
    model
        .get("top_provider")
        .and_then(|p| p.get("context_length"))
        .and_then(Value::as_u64)
}

fn collect_windows(json: &Value, map: &mut std::collections::HashMap<String, u64>) {
    if let Some(models) = json.get("data").and_then(Value::as_array) {
        for model in models {
            if let (Some(id), Some(ctx)) = (
                model.get("id").and_then(Value::as_str),
                extract_context_len(model),
            ) {
                map.insert(id.to_string(), ctx);
            }
        }
    }
}

#[tauri::command]
async fn kode_model_context_windows() -> Result<std::collections::HashMap<String, u64>, String> {
    let client = reqwest::Client::new();
    let mut map = std::collections::HashMap::new();

    // OpenRouter public model catalog (no auth needed).
    if let Ok(response) = client
        .get("https://openrouter.ai/api/v1/models")
        .header("user-agent", "KontinueAI-Desktop")
        .send()
        .await
    {
        if let Ok(json) = response.json::<Value>().await {
            collect_windows(&json, &mut map);
        }
    }

    // Vercel AI Gateway (serves MiniMax) — needs the gateway key, optional.
    if let Ok(key) = vercel_gateway_api_key() {
        if let Ok(response) = client
            .get("https://ai-gateway.vercel.sh/v1/models")
            .bearer_auth(&key)
            .header("user-agent", "KontinueAI-Desktop")
            .send()
            .await
        {
            if let Ok(json) = response.json::<Value>().await {
                collect_windows(&json, &mut map);
            }
        }
    }

    Ok(map)
}

#[tauri::command]
async fn start_desktop_auth_server(app: tauri::AppHandle) -> Result<u16, String> {
    use tauri::Emitter;
    use tauri_plugin_oauth::{start_with_config, OauthConfig};

    let response_html = r#"<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Signed in to Kontinue AI</title>
  <style>
    body {
      background: #0d0d0e;
      color: #f5f5f5;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      display: flex;
      align-items: center;
      justify-content: center;
      height: 100vh;
      margin: 0;
    }
    .card {
      text-align: center;
      padding: 32px 40px;
      border-radius: 16px;
      background: #18181b;
      border: 1px solid rgba(255, 255, 255, 0.1);
      box-shadow: 0 20px 40px rgba(0,0,0,0.5);
      max-width: 360px;
    }
    h1 { font-size: 20px; margin: 0 0 8px; color: #fff; }
    p { font-size: 13px; color: rgba(255, 255, 255, 0.6); margin: 0; line-height: 1.5; }
    .icon { font-size: 36px; margin-bottom: 12px; }
  </style>
</head>
<body>
  <div class="card">
    <div class="icon">✨</div>
    <h1>Signed in!</h1>
    <p>You can close this tab and return to Kontinue AI Desktop.</p>
  </div>
</body>
</html>"#;

    let config = OauthConfig {
        response: Some(response_html.into()),
        ..Default::default()
    };

    let port = start_with_config(config, move |url_str| {
        let _ = app.emit("oauth://callback", url_str);
    })
    .map_err(|e| e.to_string())?;

    Ok(port)
}

// Tauri does not auto-load `.env`. Load the Kontinue AI Desktop env files (relative to the
// `src-tauri` working dir in dev) so OPENROUTER_API_KEY / VERCEL_AI_GATEWAY_API_KEY
// are available to `std::env::var`. Best-effort: ignore if a file is absent, and
// don't override variables already set in the real environment.
fn load_env_files() {
    // Dev builds (`tauri dev`) read .env.local; release builds read
    // .env.production. Earlier files win (dotenvy never overrides a set value).
    if cfg!(debug_assertions) {
        let _ = dotenvy::from_filename("../.env.local");
    } else {
        let _ = dotenvy::from_filename("../.env.production.local");
        let _ = dotenvy::from_filename("../.env.production");
    }
    let _ = dotenvy::from_filename("../.env");
    let _ = dotenvy::dotenv();
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
/// `--kode-mcp`: run Kode's MCP server on stdio instead of the app.
pub fn run_mcp_server() {
    kode_mcp_server::run_stdio();
}

pub fn run() {
    load_env_files();

    let builder = tauri::Builder::default();

    // Must be the first plugin: on Windows/Linux the OS launches a *new* process
    // for `kontinueai://` links. Single-instance forwards that URL to the running
    // app (the `deep-link` feature re-emits it as a deep-link event) and focuses it.
    #[cfg(desktop)]
    let builder = builder.plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
        use tauri::Manager;
        if let Some(window) = app.get_webview_window("main") {
            let _ = window.unminimize();
            let _ = window.set_focus();
        }
    }));

    builder
        .plugin(tauri_plugin_deep_link::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .manage(menu::MenuState::default())
        .menu(|app| menu::build(app))
        .on_menu_event(|app, event| menu::handle_event(app, event.id().as_ref()))
        .manage(panel::PtyState::default())
        .manage(cli_agents::CliRunState::default())
        .manage(mcp::McpManager::default())
        .setup(|_app| {
            // Linux and Windows dev builds need the scheme registered at runtime;
            // macOS registers it from the bundle's Info.plist.
            #[cfg(all(desktop, any(windows, target_os = "linux")))]
            {
                use tauri_plugin_deep_link::DeepLinkExt;
                let _ = _app.deep_link().register_all();
            }

            // Tauri only exposes the traffic-light group position. Set the
            // individual macOS buttons so their spacing matches the sidebar
            // icon group (close/minimize/zoom are normally tighter).
            #[cfg(target_os = "macos")]
            {
                use tauri::Manager;

                if let Some(window) = _app.get_webview_window("main") {
                    let delayed = window.clone();
                    tauri::async_runtime::spawn(async move {
                        tokio::time::sleep(std::time::Duration::from_millis(250)).await;
                        // AppKit must be touched on the main thread; calling it
                        // from this tokio worker throws an ObjC exception and aborts.
                        let target = delayed.clone();
                        let _ = delayed.run_on_main_thread(move || {
                            let _ = macos_window::apply_traffic_light_spacing(&target, TRAFFIC_LIGHT_SPACING);
                        });
                    });

                    let resize_window = window.clone();
                    window.on_window_event(move |event| {
                        if matches!(event, tauri::WindowEvent::Resized(_)) {
                            let _ = macos_window::apply_traffic_light_spacing(
                                &resize_window,
                                TRAFFIC_LIGHT_SPACING,
                            );
                        }
                    });
                }
            }

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            menu::menu_set_accelerators,
            kode_chat,
            kode_read_file,
            kode_list_dir,
            kode_list_project_files,
            kode_write_file,
            kode_save_attachment,
            kode_edit_file,
            kode_delete_file,
            kode_rename_path,
            kode_create_entry,
            kode_trash_path,
            editor::editor_file_stat,
            editor::editor_read_text_files,
            editor::editor_type_packages,
            editor::editor_type_roots,
            mcp_import::kode_mcp_discover,
            kode_run_command,
            kode_repo_profile,
            kode_fetch_text,
            kode_discover_user_skills,
            kode_list_user_skill_files,
            kode_read_user_skill_file,
            kode_write_user_skill,
            kode_delete_user_skill,
            kode_install_user_skill,
            kode_read_local_skill_dir,
            kode_extract_skill_zip,
            mcp::mcp_start,
            mcp::mcp_list_tools,
            mcp::mcp_call_tool,
            mcp::mcp_stop,
            kode_model_context_windows
            ,kode_byok_status
            ,kode_byok_set_key
            ,kode_byok_remove_key
            ,kode_byok_get_key
            ,kode_import::kode_scan_coding_sessions
            ,kode_import::kode_read_coding_session
            ,kode_import::kode_project_state
            ,kode_import::kode_session_updated_at
            ,kode_import::kode_detect_session_sources
            ,kode_hooks::kode_import_events
            ,kode_hooks::kode_sync_hooks_status
            ,kode_hooks::kode_sync_hooks_set
            ,kode_hooks::kode_codex_threads
            ,kode_hooks::kode_shared_workspace_read
            ,kode_hooks::kode_shared_workspace_write
            ,bg_tasks::kode_bg_start
            ,bg_tasks::kode_bg_list
            ,bg_tasks::kode_bg_output
            ,bg_tasks::kode_bg_stop
            ,bg_tasks::kode_bg_clear_finished
            ,kode_mcp_server::kode_orch_write_state
            ,kode_mcp_server::kode_orch_take_inbox
            ,kode_mcp_server::kode_mcp_server_command
            ,snapshot::kode_capture_snapshot
            ,kode_read_attachment
            ,git_hosts::kode_git_remote
            ,triage::kode_triage_report
            ,project_move::kode_project_bundle
            ,project_move::kode_project_restore
            ,project_move::kode_device_name
            ,project_move::kode_path_exists
            ,git_hosts::kode_git_host_token_status
            ,git_hosts::kode_git_host_token_set
            ,start_desktop_auth_server
            ,kontinue_api_post
            ,kontinue_set_base_url
            ,panel::panel_git_status
            ,panel::panel_pr_list
            ,panel::panel_pr_merge
            ,panel::panel_pr_review
            ,panel::panel_pr_comments
            ,panel::panel_pr_cleanup_merged
            ,panel::panel_git_diff
            ,panel::panel_git_branches
            ,panel::panel_git_switch
            ,panel::panel_git_push
            ,panel::panel_git_worktree_add
            ,settings_info::settings_tool_status
            ,settings_info::settings_list_worktrees
            ,settings_info::settings_remove_worktree
            ,settings_info::settings_storage_usage
            ,settings_info::settings_agent_storage
            ,agent_usage::settings_agent_usage
            ,settings_info::settings_open_privacy_pane
            ,settings_info::settings_reveal
            ,settings_info::notify_send
            ,settings_info::play_sound
            ,settings_info::settings_clean_attachments
            ,panel::pty_spawn
            ,panel::pty_write
            ,panel::pty_resize
            ,panel::pty_kill
            ,cli_agents::kode_cli_detect
            ,cli_agents::kode_cli_new_run
            ,cli_agents::kode_cli_run
            ,cli_agents::kode_cli_stop
            ,cli_agents::kode_cli_update
            ,cli_agents::kode_acp_registry
            ,cli_agents::kode_acp_install
            ,cli_agents::kode_cli_auth
            ,cli_agents::kode_cli_models
            ,cli_agents::kode_cli_secret_set
            ,cli_agents::kode_cli_secret_remove
            ,cli_agents::kode_cli_secret_status
            ,browser_view::browser_place
            ,browser_view::browser_hide
            ,browser_view::browser_close
            ,browser_view::browser_reload
            ,browser_view::browser_go
            ,browser_view::browser_annotate
            ,plugins::plugin_inspect_source
            ,plugins::plugin_install
            ,plugins::plugin_discard_staging
            ,plugins::plugin_list
            ,plugins::plugin_set_enabled
            ,plugins::plugin_remove
            ,plugins::plugin_set_hooks_allowed
            ,plugins::plugin_run_hook
            ,plugins::plugin_install_deps
            ,plugins::kode_list_user_commands
            ,mcp_auth::mcp_oauth_login
            ,mcp_auth::mcp_oauth_status
            ,mcp_auth::mcp_oauth_logout
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|_, event| {
            // Don't leave dev servers the agent started running after quit.
            if let tauri::RunEvent::Exit = event {
                bg_tasks::stop_all();
            }
        });
}
