use futures_util::StreamExt;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::path::{Component, PathBuf};
use tauri::ipc::Channel;
use tauri::Manager;

const OPENROUTER_CHAT_COMPLETIONS_URL: &str = "https://openrouter.ai/api/v1/chat/completions";
const VERCEL_AI_GATEWAY_CHAT_COMPLETIONS_URL: &str =
    "https://ai-gateway.vercel.sh/v1/chat/completions";
const KODE_MODEL_ID: &str = "kontinue/kode-1.0";
// Kode 1.0 runs on Nex N2 Pro (free, tool-capable, 262K ctx) via OpenRouter. The
// identity lock below keeps it presenting as "Kode 1.0 by Kontinue AI".
const KODE_OPENROUTER_MODEL_ID: &str = "nex-agi/nex-n2-pro:free";
const MINIMAX_M3_MODEL_ID: &str = "minimax/minimax-m3";
const DEEPSEEK_V4_PRO_MODEL_ID: &str = "deepseek/deepseek-v4-pro";
const BYOK_KEYRING_SERVICE: &str = "com.kontinue.kode-ide.byok";

// Identity lock — applied ONLY to the branded Kode 1.0 model. The underlying open
// model would otherwise reveal its real name when asked; this overrides that so
// Kode 1.0 always presents as "Kode 1.0 by Kontinue AI". It is NOT applied to the
// premium models (MiniMax M3, DeepSeek V4 Pro, …) — those are shown under their
// real names in the picker and should identify as themselves, not as Kode 1.0.
const KODE_IDENTITY_PROMPT: &str = "You are Kontinue AI, the intelligent AI assistant and desktop workspace created by Kontinue AI. You help users with general reasoning, writing, design, and software engineering.";

const KODE_AGENT_PROMPT: &str = "You are a professional, careful, repo-aware AI assistant inside Kontinue AI desktop application. Prefer concrete, modern, correct code. Explain decisions briefly. Never expose secrets or run destructive actions without confirmation.\n\nYou have tools available to navigate, inspect, and modify the project environment. Always verify tool call results before declaring success.";

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
    let route = resolve_model_route(
        &request.model_id,
        request.byok_key.as_deref(),
        request.byok_provider.as_deref(),
    )?;
    let payload = route.payload(
        request.messages,
        request.tools.as_ref(),
        request.tool_choice.as_ref(),
        request.system_context.as_deref(),
        true,
    );
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
                    let message = extract_error_message(&body).unwrap_or(body);
                    let hint = if status.is_server_error() {
                        " (the free provider is temporarily overloaded — try again or switch models)"
                    } else {
                        ""
                    };
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

    while let Some(chunk) = stream.next().await {
        let bytes =
            chunk.map_err(|error| format!("{} stream interrupted: {error}", route.name))?;
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
                if data.is_empty() || data == "[DONE]" {
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
                            let _ = on_event.send(KodeStreamEvent::Content {
                                delta: text.to_string(),
                            });
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

    let serialized_tool_calls: Option<Value> = if tool_calls.is_empty() {
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
    let content = if content.trim().is_empty() && serialized_tool_calls.is_none() {
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
        let system_content = match system_context {
            Some(extra) if !extra.trim().is_empty() => {
                format!("{base_prompt}{extra}")
            }
            _ => base_prompt,
        };

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

        if let Some(tools) = tools {
            if tools.as_array().map(|t| !t.is_empty()).unwrap_or(false) {
                payload["tools"] = tools.clone();
                payload["tool_choice"] = tool_choice.cloned().unwrap_or_else(|| json!("auto"));
            }
        }

        if self.include_reasoning {
            payload["reasoning"] = json!({ "enabled": true });
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
        reqwest::header::HeaderValue::from_static("Kontinue Kode IDE"),
    );

    let is_kode = model_id == KODE_MODEL_ID;
    Ok(ModelRoute {
        name: "OpenRouter",
        url: OPENROUTER_CHAT_COMPLETIONS_URL,
        api_key: openrouter_api_key()?,
        model_id: if is_kode {
            KODE_OPENROUTER_MODEL_ID.to_string()
        } else {
            model_id.to_string()
        },
        include_reasoning: true,
        is_kode,
        headers,
        byok: None,
        is_anthropic_native: false,
    })
}

fn is_gateway_model(model_id: &str) -> bool {
    matches!(model_id, MINIMAX_M3_MODEL_ID | DEEPSEEK_V4_PRO_MODEL_ID)
        || model_id.starts_with("anthropic/")
        || model_id.starts_with("openai/")
}

fn gateway_provider(model_id: &str) -> Option<&'static str> {
    if model_id.starts_with("anthropic/") {
        Some("anthropic")
    } else if model_id.starts_with("openai/") {
        Some("openai")
    } else {
        None
    }
}

#[tauri::command]
fn kode_byok_status() -> Vec<ByokKeyStatus> {
    ["anthropic", "openai", "agent_router"]
        .into_iter()
        .map(|provider| ByokKeyStatus {
            provider: provider.to_string(),
            configured: read_byok_key(provider).is_some(),
        })
        .collect()
}

#[tauri::command]
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


#[tauri::command]
fn kode_byok_remove_key(provider: String) -> Result<(), String> {
    match byok_entry(&provider)?.delete_credential() {
        Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
        Err(error) => Err(format!("Could not remove the API key: {error}")),
    }
}

#[tauri::command]
fn kode_byok_get_key(provider: String) -> Result<Option<String>, String> {
    Ok(read_byok_key(&provider))
}

fn openrouter_api_key() -> Result<String, String> {
    std::env::var("OPENROUTER_API_KEY")
        .or_else(|_| std::env::var("OPEN_ROUTER_API_KEY"))
        .or_else(|_| std::env::var("OPEN_ROUTER"))
        .map_err(|_| {
            "Missing OpenRouter API key. Set OPENROUTER_API_KEY before launching Kode IDE."
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

#[tauri::command]
fn kode_read_file(root: String, path: String) -> Result<String, String> {
    let target = safe_join(&root, &path)?;
    std::fs::read_to_string(&target).map_err(|error| format!("Could not read {path}: {error}"))
}

#[tauri::command]
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

#[tauri::command]
fn kode_write_file(root: String, path: String, content: String) -> Result<(), String> {
    let target = safe_join(&root, &path)?;
    if let Some(parent) = target.parent() {
        std::fs::create_dir_all(parent)
            .map_err(|error| format!("Could not create directories for {path}: {error}"))?;
    }
    std::fs::write(&target, content).map_err(|error| format!("Could not write {path}: {error}"))
}

#[tauri::command]
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
struct KodeRepoProfile {
    framework: Option<String>,
    package_manager: Option<String>,
    tags: Vec<String>,
}

// Inspect the project root and detect framework, package manager, and notable
// dependencies so the agent can pick the right skills and conventions.
#[tauri::command]
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

#[tauri::command]
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
        .header("user-agent", "KodeIDE-DocsIndexer")
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
        .header("user-agent", "KodeIDE")
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
            .header("user-agent", "KodeIDE")
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

fn docs_index_file(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|error| format!("No app data dir: {error}"))?;
    std::fs::create_dir_all(&dir).map_err(|error| error.to_string())?;
    Ok(dir.join("kode-docs-index.json"))
}

#[tauri::command]
fn kode_docs_load(app: tauri::AppHandle) -> Result<String, String> {
    let file = docs_index_file(&app)?;
    if !file.exists() {
        return Ok(String::new());
    }
    std::fs::read_to_string(file).map_err(|error| error.to_string())
}

#[tauri::command]
fn kode_docs_save(app: tauri::AppHandle, contents: String) -> Result<(), String> {
    let file = docs_index_file(&app)?;
    std::fs::write(file, contents).map_err(|error| error.to_string())
}

// Tauri does not auto-load `.env`. Load the kode-ide env files (relative to the
// `src-tauri` working dir in dev) so OPENROUTER_API_KEY / VERCEL_AI_GATEWAY_API_KEY
// are available to `std::env::var`. Best-effort: ignore if a file is absent, and
// don't override variables already set in the real environment.
fn load_env_files() {
    let _ = dotenvy::from_filename("../.env.local");
    let _ = dotenvy::from_filename("../.env");
    let _ = dotenvy::dotenv();
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    load_env_files();

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            kode_chat,
            kode_read_file,
            kode_list_dir,
            kode_write_file,
            kode_edit_file,
            kode_delete_file,
            kode_run_command,
            kode_repo_profile,
            kode_fetch_text,
            kode_docs_load,
            kode_docs_save,
            kode_model_context_windows
            ,kode_byok_status
            ,kode_byok_set_key
            ,kode_byok_remove_key
            ,kode_byok_get_key
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
