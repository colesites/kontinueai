// Tool calls that a model wrote into its text instead of the API's tool_calls
// field. DeepSeek (Kode 1.0's chain) sometimes does this:
//
//   <｜DSML｜function_calls>
//   <｜DSML｜invoke name="update_todos">
//   <｜DSML｜parameter name="todos" string="false">[…]</｜DSML｜parameter>
//   </｜DSML｜invoke>
//   </｜DSML｜function_calls>
//
// and Qwen/Hermes-style models write `<tool_call>{"name":…,"arguments":…}</tool_call>`.
// `extract` turns either into OpenAI-style tool calls and returns the text
// without the markup. `safe_prefix_len` says how much streamed text can be
// shown before possible markup starts.

use regex::Regex;
use serde_json::{json, Map, Value};
use std::sync::OnceLock;

// `｜` (U+FF5C) or `|`, with optional spaces.
const BAR: &str = r"\s*[｜|]\s*";

fn re(pattern: &str) -> Regex {
    Regex::new(pattern).expect("valid regex")
}

fn invoke_re() -> &'static Regex {
    static R: OnceLock<Regex> = OnceLock::new();
    R.get_or_init(|| {
        re(&format!(
            r#"(?s)<{BAR}DSML{BAR}invoke\s+name\s*=\s*"([^"]+)"\s*>(.*?)<\s*/{BAR}DSML{BAR}invoke\s*>"#
        ))
    })
}

fn param_re() -> &'static Regex {
    static R: OnceLock<Regex> = OnceLock::new();
    R.get_or_init(|| {
        re(&format!(
            r#"(?s)<{BAR}DSML{BAR}parameter\s+name\s*=\s*"([^"]+)"(?:\s+string\s*=\s*"(true|false)")?\s*>(.*?)<\s*/{BAR}DSML{BAR}parameter\s*>"#
        ))
    })
}

fn block_re() -> &'static Regex {
    static R: OnceLock<Regex> = OnceLock::new();
    R.get_or_init(|| {
        re(&format!(
            r#"(?s)<{BAR}DSML{BAR}function_calls\s*>.*?(?:<\s*/{BAR}DSML{BAR}function_calls\s*>|$)"#
        ))
    })
}

fn hermes_re() -> &'static Regex {
    static R: OnceLock<Regex> = OnceLock::new();
    R.get_or_init(|| re(r"(?s)<tool_call>\s*(\{.*?\})\s*</tool_call>"))
}

fn start_re() -> &'static Regex {
    static R: OnceLock<Regex> = OnceLock::new();
    R.get_or_init(|| re(&format!(r"<{BAR}DSML|<tool_call>")))
}

fn call(index: usize, name: &str, arguments: Value) -> Value {
    json!({
        "id": format!("call_text_{index}"),
        "type": "function",
        "function": { "name": name, "arguments": arguments.to_string() },
    })
}

/// (text without the markup, tool calls), or None when there is no markup.
pub fn extract(content: &str) -> Option<(String, Vec<Value>)> {
    let mut calls = Vec::new();
    for invoke in invoke_re().captures_iter(content) {
        let name = invoke[1].trim().to_string();
        let mut args = Map::new();
        for param in param_re().captures_iter(&invoke[2]) {
            let raw = param[3].trim();
            let as_string = param.get(2).map(|m| m.as_str() == "true").unwrap_or(false);
            let value = if as_string {
                Value::String(raw.to_string())
            } else {
                serde_json::from_str(raw).unwrap_or_else(|_| Value::String(raw.to_string()))
            };
            args.insert(param[1].trim().to_string(), value);
        }
        calls.push(call(calls.len(), &name, Value::Object(args)));
    }
    for hermes in hermes_re().captures_iter(content) {
        let Ok(value) = serde_json::from_str::<Value>(&hermes[1]) else { continue };
        let Some(name) = value.get("name").and_then(Value::as_str) else { continue };
        let arguments = match value.get("arguments").or_else(|| value.get("parameters")) {
            Some(Value::String(text)) => serde_json::from_str(text).unwrap_or(json!({})),
            Some(other) => other.clone(),
            None => json!({}),
        };
        calls.push(call(calls.len(), name, arguments));
    }
    if calls.is_empty() {
        return None;
    }
    let mut clean = block_re().replace_all(content, "").to_string();
    clean = invoke_re().replace_all(&clean, "").to_string();
    clean = hermes_re().replace_all(&clean, "").to_string();
    Some((clean.trim().to_string(), calls))
}

/// Bytes of `content` that can be shown while streaming: everything before
/// any markup, holding back a trailing `<…` that might still become markup.
pub fn safe_prefix_len(content: &str) -> usize {
    if let Some(found) = start_re().find(content) {
        return found.start();
    }
    match content.rfind('<') {
        // A short unfinished tag at the end: wait for more text.
        Some(at) if content.len() - at < 16 && !content[at..].contains('>') => at,
        _ => content.len(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_deepseek_markup() {
        let text = "I'll start by inspecting the project.\n<｜DSML｜function_calls>\n<｜DSML｜invoke name=\"update_todos\">\n<｜DSML｜parameter name=\"todos\" string=\"false\">[{\"id\":\"1\",\"title\":\"Inspect\",\"status\":\"in_progress\"}]</｜DSML｜parameter>\n</｜DSML｜invoke>\n<｜DSML｜invoke name=\"read_file\">\n<｜DSML｜parameter name=\"path\" string=\"true\">src/todos.ts</｜DSML｜parameter>\n</｜DSML｜invoke>\n</｜DSML｜function_calls>";
        let (clean, calls) = extract(text).unwrap();
        assert_eq!(clean, "I'll start by inspecting the project.");
        assert_eq!(calls.len(), 2);
        assert_eq!(calls[0]["function"]["name"], "update_todos");
        let args: Value = serde_json::from_str(calls[0]["function"]["arguments"].as_str().unwrap()).unwrap();
        assert_eq!(args["todos"][0]["title"], "Inspect");
        let args: Value = serde_json::from_str(calls[1]["function"]["arguments"].as_str().unwrap()).unwrap();
        assert_eq!(args["path"], "src/todos.ts");
    }

    #[test]
    fn parses_ascii_bars_with_spaces_and_hermes() {
        let text = "< | DSML | invoke name=\"run_command\"><|DSML|parameter name=\"command\" string=\"true\">bun test</|DSML|parameter></|DSML|invoke>";
        let (_, calls) = extract(text).unwrap();
        assert_eq!(calls[0]["function"]["name"], "run_command");
        let hermes = "ok <tool_call>{\"name\": \"list_dir\", \"arguments\": {\"path\": \".\"}}</tool_call>";
        let (clean, calls) = extract(hermes).unwrap();
        assert_eq!(clean, "ok");
        assert_eq!(calls[0]["function"]["name"], "list_dir");
        assert!(extract("plain answer with a < b comparison").is_none());
    }

    #[test]
    fn streams_only_text_before_markup() {
        assert_eq!(safe_prefix_len("Hello <｜DSML｜function_calls>"), 6);
        assert_eq!(safe_prefix_len("Hello <｜DS"), 6);
        assert_eq!(safe_prefix_len("a < b and c > d"), "a < b and c > d".len());
        assert_eq!(safe_prefix_len("plain"), 5);
    }
}
