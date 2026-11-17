// Direct Anthropic Messages API (BYOK). Kode keeps its history and tools in the
// OpenAI chat-completions shape; this module translates them to the Messages
// API (https://docs.claude.com/en/api/messages) and turns its server-sent
// events back into the text / reasoning / tool-call pieces the shared stream
// loop in lib.rs already handles. No OpenAI-compatible shim: tool use, images
// and thinking all go through the native API.

use serde_json::{json, Map, Value};
use std::collections::HashMap;

/// Kode's model slug to the Anthropic model id ("anthropic/claude-opus-4.8"
/// → "claude-opus-4-8"). Anthropic ids use dashes, never dots or dates added.
pub fn model_id(slug: &str) -> String {
    slug.strip_prefix("anthropic/").unwrap_or(slug).replace('.', "-")
}

/// Output room per request. Current models allow far more; older Claude 3
/// models (still used by the Agent Router route) reject anything above theirs.
pub fn max_output(model: &str) -> u32 {
    if model.starts_with("claude-3-opus") || model.starts_with("claude-3-haiku") {
        4_096
    } else if model.starts_with("claude-3") {
        8_192
    } else {
        32_000
    }
}

/// The Messages API request body.
pub fn payload(
    model: &str,
    system: &str,
    messages: Vec<Value>,
    tools: Option<&Value>,
    max_tokens: u32,
    stream: bool,
) -> Value {
    let mut body = json!({
        "model": model,
        "max_tokens": max_tokens,
        "system": system,
        "messages": convert_messages(messages),
    });
    let tools = tools.map(convert_tools).unwrap_or_default();
    if !tools.is_empty() {
        // `auto` only: forced tool choice is rejected by current models.
        body["tools"] = Value::Array(tools);
        body["tool_choice"] = json!({ "type": "auto" });
    }
    if stream {
        body["stream"] = json!(true);
    }
    body
}

/// OpenAI function tools → Anthropic tools.
fn convert_tools(tools: &Value) -> Vec<Value> {
    tools
        .as_array()
        .into_iter()
        .flatten()
        .filter_map(|tool| {
            let function = tool.get("function")?;
            let name = function.get("name")?.as_str()?;
            Some(json!({
                "name": name,
                "description": function.get("description").and_then(Value::as_str).unwrap_or(""),
                "input_schema": function
                    .get("parameters")
                    .cloned()
                    .unwrap_or_else(|| json!({ "type": "object", "properties": {} })),
            }))
        })
        .collect()
}

/// OpenAI chat messages → Anthropic messages. System messages are carried in
/// the top-level `system` field instead; tool results become `tool_result`
/// blocks, and consecutive results share one user turn (as the API expects
/// for parallel tool calls).
fn convert_messages(messages: Vec<Value>) -> Vec<Value> {
    let mut out: Vec<Value> = Vec::new();
    for message in messages {
        let role = message.get("role").and_then(Value::as_str).unwrap_or("");
        let blocks = match role {
            "user" => user_blocks(message.get("content")),
            "assistant" => assistant_blocks(&message),
            "tool" => vec![json!({
                "type": "tool_result",
                "tool_use_id": message.get("tool_call_id").and_then(Value::as_str).unwrap_or(""),
                "content": text_of(message.get("content")),
            })],
            _ => continue,
        };
        if blocks.is_empty() {
            continue;
        }
        let role = if role == "assistant" { "assistant" } else { "user" };
        // Same role twice in a row: one turn with both sets of blocks.
        if let Some(last) = out.last_mut() {
            if last["role"] == role {
                if let Some(content) = last["content"].as_array_mut() {
                    content.extend(blocks);
                    continue;
                }
            }
        }
        out.push(json!({ "role": role, "content": blocks }));
    }
    out
}

fn user_blocks(content: Option<&Value>) -> Vec<Value> {
    match content {
        Some(Value::String(text)) if !text.is_empty() => vec![json!({ "type": "text", "text": text })],
        Some(Value::Array(parts)) => parts
            .iter()
            .filter_map(|part| match part.get("type").and_then(Value::as_str) {
                Some("text") => part
                    .get("text")
                    .and_then(Value::as_str)
                    .filter(|text| !text.is_empty())
                    .map(|text| json!({ "type": "text", "text": text })),
                Some("image_url") => part
                    .pointer("/image_url/url")
                    .and_then(Value::as_str)
                    .and_then(image_block),
                _ => None,
            })
            .collect(),
        _ => Vec::new(),
    }
}

/// `data:image/png;base64,…` → a base64 image block; a plain URL → a URL image.
fn image_block(url: &str) -> Option<Value> {
    if let Some(rest) = url.strip_prefix("data:") {
        let (media_type, data) = rest.split_once(";base64,")?;
        return Some(json!({
            "type": "image",
            "source": { "type": "base64", "media_type": media_type, "data": data },
        }));
    }
    Some(json!({ "type": "image", "source": { "type": "url", "url": url } }))
}

fn assistant_blocks(message: &Value) -> Vec<Value> {
    let mut blocks = Vec::new();
    let text = text_of(message.get("content"));
    if !text.trim().is_empty() {
        blocks.push(json!({ "type": "text", "text": text }));
    }
    for call in message.get("tool_calls").and_then(Value::as_array).into_iter().flatten() {
        let Some(name) = call.pointer("/function/name").and_then(Value::as_str) else { continue };
        let arguments = call.pointer("/function/arguments").and_then(Value::as_str).unwrap_or("{}");
        let input = serde_json::from_str::<Value>(arguments)
            .ok()
            .filter(Value::is_object)
            .unwrap_or_else(|| Value::Object(Map::new()));
        blocks.push(json!({
            "type": "tool_use",
            "id": call.get("id").and_then(Value::as_str).unwrap_or(""),
            "name": name,
            "input": input,
        }));
    }
    blocks
}

fn text_of(content: Option<&Value>) -> String {
    match content {
        Some(Value::String(text)) => text.clone(),
        Some(Value::Array(parts)) => parts
            .iter()
            .filter_map(|part| part.get("text").and_then(Value::as_str))
            .collect::<Vec<_>>()
            .join("\n"),
        _ => String::new(),
    }
}

/// One piece of a streamed reply, in the terms of lib.rs's stream loop.
#[derive(Debug, PartialEq)]
pub enum Piece {
    Text(String),
    Reasoning(String),
    /// A tool call starts: its slot in the reply's tool-call list.
    ToolStart { slot: usize, id: String, name: String },
    ToolArguments { slot: usize, json: String },
    /// The reply ended, with the OpenAI-style finish reason.
    Finish(String),
    Usage { input: Option<u64>, output: Option<u64> },
    Error(String),
}

/// Tracks which content block holds which tool call while a reply streams.
#[derive(Default)]
pub struct Stream {
    tool_slots: HashMap<u64, usize>,
    next_slot: usize,
    input_tokens: Option<u64>,
}

impl Stream {
    /// The pieces in one server-sent event's `data` payload.
    pub fn event(&mut self, event: &Value) -> Vec<Piece> {
        let index = event.get("index").and_then(Value::as_u64).unwrap_or(0);
        match event.get("type").and_then(Value::as_str) {
            Some("message_start") => {
                let usage = event.pointer("/message/usage");
                let input = usage.map(|u| {
                    ["input_tokens", "cache_read_input_tokens", "cache_creation_input_tokens"]
                        .iter()
                        .filter_map(|key| u.get(*key).and_then(Value::as_u64))
                        .sum::<u64>()
                });
                self.input_tokens = input;
                vec![Piece::Usage { input, output: None }]
            }
            Some("content_block_start") => {
                let block = event.get("content_block").cloned().unwrap_or(Value::Null);
                if block.get("type").and_then(Value::as_str) != Some("tool_use") {
                    return Vec::new();
                }
                let slot = self.next_slot;
                self.next_slot += 1;
                self.tool_slots.insert(index, slot);
                vec![Piece::ToolStart {
                    slot,
                    id: block.get("id").and_then(Value::as_str).unwrap_or("").to_string(),
                    name: block.get("name").and_then(Value::as_str).unwrap_or("").to_string(),
                }]
            }
            Some("content_block_delta") => {
                let delta = event.get("delta").cloned().unwrap_or(Value::Null);
                let text = |key: &str| delta.get(key).and_then(Value::as_str).unwrap_or("").to_string();
                match delta.get("type").and_then(Value::as_str) {
                    Some("text_delta") => vec![Piece::Text(text("text"))],
                    Some("thinking_delta") => vec![Piece::Reasoning(text("thinking"))],
                    Some("input_json_delta") => match self.tool_slots.get(&index) {
                        Some(slot) => vec![Piece::ToolArguments { slot: *slot, json: text("partial_json") }],
                        None => Vec::new(),
                    },
                    _ => Vec::new(),
                }
            }
            Some("message_delta") => {
                let mut pieces = Vec::new();
                if let Some(output) = event.pointer("/usage/output_tokens").and_then(Value::as_u64) {
                    pieces.push(Piece::Usage { input: self.input_tokens, output: Some(output) });
                }
                if let Some(reason) = event.pointer("/delta/stop_reason").and_then(Value::as_str) {
                    pieces.push(Piece::Finish(finish_reason(reason).to_string()));
                }
                pieces
            }
            Some("error") => vec![Piece::Error(
                event
                    .pointer("/error/message")
                    .and_then(Value::as_str)
                    .unwrap_or("Anthropic returned an error.")
                    .to_string(),
            )],
            _ => Vec::new(),
        }
    }
}

/// Anthropic stop reasons in the chat-completions terms the agent loop uses.
fn finish_reason(reason: &str) -> &'static str {
    match reason {
        "tool_use" => "tool_calls",
        "max_tokens" => "length",
        "refusal" => "content_filter",
        _ => "stop",
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn maps_model_ids() {
        assert_eq!(model_id("anthropic/claude-opus-4.8"), "claude-opus-4-8");
        assert_eq!(model_id("anthropic/claude-opus-5"), "claude-opus-5");
    }

    #[test]
    fn converts_history_tools_and_results() {
        let messages = vec![
            json!({"role":"system","content":"ignored here"}),
            json!({"role":"user","content":[{"type":"text","text":"Look"},{"type":"image_url","image_url":{"url":"data:image/png;base64,AAAA"}}]}),
            json!({"role":"assistant","content":"","tool_calls":[
                {"id":"t1","type":"function","function":{"name":"read_file","arguments":"{\"path\":\"a.ts\"}"}},
                {"id":"t2","type":"function","function":{"name":"read_file","arguments":"{\"path\":\"b.ts\"}"}}]}),
            json!({"role":"tool","tool_call_id":"t1","content":"A"}),
            json!({"role":"tool","tool_call_id":"t2","content":"B"}),
        ];
        let tools = json!([{"type":"function","function":{"name":"read_file","description":"Read","parameters":{"type":"object"}}}]);
        let body = payload("claude-opus-5", "sys", messages, Some(&tools), 32000, true);
        let msgs = body["messages"].as_array().unwrap();
        assert_eq!(msgs.len(), 3);
        assert_eq!(msgs[0]["content"][1]["source"]["media_type"], "image/png");
        assert_eq!(msgs[1]["content"][0]["input"]["path"], "a.ts");
        // Both results in one user turn.
        assert_eq!(msgs[2]["content"].as_array().unwrap().len(), 2);
        assert_eq!(body["tools"][0]["input_schema"]["type"], "object");
        assert_eq!(body["tool_choice"]["type"], "auto");
    }

    #[test]
    fn streams_text_tools_and_finish() {
        let mut stream = Stream::default();
        let events = [
            json!({"type":"message_start","message":{"usage":{"input_tokens":10,"cache_read_input_tokens":90}}}),
            json!({"type":"content_block_start","index":0,"content_block":{"type":"text","text":""}}),
            json!({"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"Hi"}}),
            json!({"type":"content_block_start","index":1,"content_block":{"type":"tool_use","id":"t1","name":"run"}}),
            json!({"type":"content_block_delta","index":1,"delta":{"type":"input_json_delta","partial_json":"{\"a\":"}}),
            json!({"type":"content_block_delta","index":1,"delta":{"type":"input_json_delta","partial_json":"1}"}}),
            json!({"type":"message_delta","delta":{"stop_reason":"tool_use"},"usage":{"output_tokens":7}}),
        ];
        let pieces: Vec<Piece> = events.iter().flat_map(|e| stream.event(e)).collect();
        assert!(pieces.contains(&Piece::Usage { input: Some(100), output: None }));
        assert!(pieces.contains(&Piece::Text("Hi".into())));
        assert!(pieces.contains(&Piece::ToolStart { slot: 0, id: "t1".into(), name: "run".into() }));
        assert!(pieces.contains(&Piece::ToolArguments { slot: 0, json: "1}".into() }));
        assert!(pieces.contains(&Piece::Usage { input: Some(100), output: Some(7) }));
        assert_eq!(pieces.last(), Some(&Piece::Finish("tool_calls".into())));
    }
}
