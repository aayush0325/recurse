use std::io::BufRead;

use serde::{Deserialize, Serialize};
use serde_json::Value;

use crate::config;

const OPENROUTER_MODELS: &str = "https://openrouter.ai/api/v1/chat/completions";
const OPENROUTER_MODELS_LIST: &str = "https://openrouter.ai/api/v1/models";
const DEFAULT_MODEL: &str = "openrouter/auto";
const MAX_TOOL_ITERATIONS: usize = 16;

/// One tool call emitted by the model.
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct ToolCall {
    pub id: String,
    #[serde(rename = "type")]
    pub call_type: String,
    pub function: ToolCallFn,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct ToolCallFn {
    pub name: String,
    pub arguments: String,
}

/// One turn in the agent conversation. Compatible with the OpenAI chat
/// format: `tool_calls` marks an assistant request to run tools; `tool_call_id`
/// marks a `role: "tool"` result message.
///
/// `reasoning` holds the model's thinking trace for the turn. It is persisted
/// with the conversation history but is never sent back to the model.
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct ChatMessage {
    pub role: String,
    pub content: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tool_calls: Option<Vec<ToolCall>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tool_call_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub reasoning: Option<String>,
}

impl ChatMessage {
    fn user(content: &str) -> Self {
        Self {
            role: "user".into(),
            content: Some(content.to_string()),
            tool_calls: None,
            tool_call_id: None,
            reasoning: None,
        }
    }

    fn system(content: &str) -> Self {
        Self {
            role: "system".into(),
            content: Some(content.to_string()),
            tool_calls: None,
            tool_call_id: None,
            reasoning: None,
        }
    }

    fn assistant(content: Option<String>, tool_calls: Option<Vec<ToolCall>>) -> Self {
        Self {
            role: "assistant".into(),
            content,
            tool_calls,
            tool_call_id: None,
            reasoning: None,
        }
    }

    fn tool(tool_call_id: String, content: String) -> Self {
        Self {
            role: "tool".into(),
            content: Some(content),
            tool_calls: None,
            tool_call_id: Some(tool_call_id),
            reasoning: None,
        }
    }

    fn with_reasoning(mut self, reasoning: Option<String>) -> Self {
        if reasoning.as_ref().map(|s| !s.is_empty()).unwrap_or(false) {
            self.reasoning = reasoning;
        }
        self
    }

    /// Clone without the reasoning trace, for the wire format sent to the model.
    fn without_reasoning(&self) -> Self {
        let mut c = self.clone();
        c.reasoning = None;
        c
    }
}

/// Runtime LLM configuration. The model is selectable from the UI; the endpoint
/// defaults to OpenRouter and the API key is read from the environment.
#[derive(Clone)]
pub struct LlmConfig {
    pub endpoint: String,
    pub api_key: Option<String>,
    pub model: String,
}

impl Default for LlmConfig {
    fn default() -> Self {
        // Precedence: config file > env > defaults.
        let file = config::load();
        let api_key = file
            .openrouter_api_key
            .or_else(|| std::env::var("OPENROUTER_API_KEY").ok())
            .or_else(|| std::env::var("RECURSE_LLM_API_KEY").ok());
        let endpoint = file
            .endpoint
            .or_else(|| std::env::var("RECURSE_LLM_ENDPOINT").ok())
            .unwrap_or_else(|| OPENROUTER_MODELS.to_string());
        let model = file
            .model
            .or_else(|| std::env::var("RECURSE_LLM_MODEL").ok())
            .unwrap_or_else(|| DEFAULT_MODEL.to_string());
        Self {
            endpoint,
            api_key,
            model,
        }
    }
}

/// A model entry returned by OpenRouter's `/models` endpoint.
#[derive(Clone, Serialize)]
pub struct ModelInfo {
    pub id: String,
    pub name: String,
    pub context_length: u64,
    pub prompt_price: String,
    pub free: bool,
}

#[derive(Deserialize)]
struct OrResponse {
    data: Vec<OrModel>,
}

#[derive(Deserialize)]
struct OrModel {
    id: String,
    name: String,
    #[serde(default)]
    context_length: Option<u64>,
    #[serde(default)]
    pricing: Option<OrPricing>,
    #[serde(default)]
    architecture: Option<OrArchitecture>,
}

#[derive(Deserialize, Default)]
struct OrArchitecture {
    #[serde(default)]
    input_modalities: Vec<String>,
    #[serde(default)]
    output_modalities: Vec<String>,
}

#[derive(Deserialize, Default)]
struct OrPricing {
    #[serde(default)]
    prompt: String,
}

/// Text-only models: accept text on input (may also accept other modalities)
/// but produce text-only output. This drops image/video/audio output models
/// (VLMs, TTS, etc.).
fn is_text_model(m: &OrModel) -> bool {
    match m.architecture.as_ref() {
        Some(a) => {
            let input_has_text = a.input_modalities.iter().any(|x| x == "text");
            let output_text_only =
                a.output_modalities.len() == 1 && a.output_modalities[0] == "text";
            input_has_text && output_text_only
        }
        None => true,
    }
}

/// Fetch the full OpenRouter model catalog (public, unauthenticated).
pub fn fetch_models() -> Result<Vec<ModelInfo>, String> {
    let resp: OrResponse = ureq::get(OPENROUTER_MODELS_LIST)
        .call()
        .map_err(|e| format!("models request failed: {e}"))?
        .into_json()
        .map_err(|e| format!("models parse failed: {e}"))?;

    let models = resp
        .data
        .into_iter()
        .filter(is_text_model)
        .map(|m| {
            let prompt_price = m
                .pricing
                .as_ref()
                .map(|p| p.prompt.clone())
                .unwrap_or_default();
            ModelInfo {
                id: m.id,
                name: m.name,
                context_length: m.context_length.unwrap_or(0),
                free: prompt_price == "0",
                prompt_price,
            }
        })
        .collect();
    Ok(models)
}

/// Events streamed from the agent worker to the frontend over a single
/// `agent-event` channel, discriminated by `kind`.
#[derive(Clone, Debug, Serialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum AgentEvent {
    Reasoning {
        run_id: String,
        delta: String,
    },
    Token {
        run_id: String,
        delta: String,
    },
    ToolCall {
        run_id: String,
        id: String,
        name: String,
        arguments: String,
    },
    ToolResult {
        run_id: String,
        id: String,
        name: String,
        result: String,
    },
    Done {
        run_id: String,
        content: String,
    },
    Error {
        run_id: String,
        message: String,
    },
}

/// Accumulates streamed tool-call fragments (OpenAI streams `tool_calls` as
/// several deltas across an `index`).
#[derive(Default)]
struct ToolCallAccumulator {
    calls: Vec<ToolCall>,
}

impl ToolCallAccumulator {
    fn ensure(&mut self, index: usize) -> &mut ToolCall {
        while self.calls.len() <= index {
            self.calls.push(ToolCall {
                id: String::new(),
                call_type: "function".into(),
                function: ToolCallFn {
                    name: String::new(),
                    arguments: String::new(),
                },
            });
        }
        &mut self.calls[index]
    }

    fn set_id(&mut self, index: usize, id: &str) {
        self.ensure(index).id = id.to_string();
    }

    fn set_name(&mut self, index: usize, name: &str) {
        self.ensure(index).function.name = name.to_string();
    }

    fn append_args(&mut self, index: usize, args: &str) {
        self.ensure(index).function.arguments.push_str(args);
    }
}

/// Result of a single streamed completion.
struct StreamOutcome {
    content: String,
    reasoning: String,
    tool_calls: Vec<ToolCall>,
}

fn echo_reply(user: &str) -> String {
    format!(
        "[echo] Set the OPENROUTER_API_KEY environment variable to enable the \
         real model, then pick a model from the selector above.\n\nYou asked:\n{user}"
    )
}

fn build_system_prompt(path: &str, info: &Value, memory: &str) -> String {
    let arch = info["bin"]["arch"].as_str().unwrap_or("?");
    let bits = info["bin"]["bits"].as_u64().unwrap_or(0);
    let kind = info["bin"]["type"].as_str().unwrap_or("?");
    let mut prompt = format!(
        "You are Recurse, an expert reverse-engineering agent embedded in a \
         desktop binary analysis tool. Your goal is to analyze and crack \
         targets (crackmes): locate the validation logic and recover keys, \
         flags, or passwords.\n\n\
         Current target: {path}\n\
         Binary: arch={arch} bits={bits} type={kind}\n\n\
         You act through tools. Prefer the analysis tools to read the binary, \
         the debug tools to run and inspect it at runtime, and the memory \
         tools to record findings so they survive between sessions. After \
         each tool result, reason about what you learned and decide the next \
         step. Be concise and focused on the task."
    );
    if !memory.is_empty() {
        prompt.push_str("\n\nPreviously saved memory (from earlier sessions):\n");
        prompt.push_str(memory);
    }
    prompt
}

/// Extracted content from one SSE `data:` payload.
struct DeltaChunk {
    content: String,
    reasoning: Vec<String>,
}

/// Parse one SSE `data:` payload, extracting content/reasoning and
/// accumulating tool-call fragments into `acc`.
fn parse_delta(data: &str, acc: &mut ToolCallAccumulator) -> DeltaChunk {
    let mut chunk = DeltaChunk {
        content: String::new(),
        reasoning: Vec::new(),
    };
    let value: Value = match serde_json::from_str(data) {
        Ok(v) => v,
        Err(_) => return chunk,
    };
    let Some(choices) = value["choices"].as_array() else {
        return chunk;
    };
    let Some(choice) = choices.first() else {
        return chunk;
    };
    let delta = &choice["delta"];

    if let Some(s) = delta["content"].as_str() {
        chunk.content = s.to_string();
    }
    // OpenRouter uses `reasoning`; DeepSeek-style endpoints use `reasoning_content`.
    for key in ["reasoning", "reasoning_content"] {
        if let Some(s) = delta[key].as_str() {
            if !s.is_empty() {
                chunk.reasoning.push(s.to_string());
            }
        }
    }
    if let Some(arr) = delta["tool_calls"].as_array() {
        for tc in arr {
            let index = tc["index"].as_u64().unwrap_or(0) as usize;
            if let Some(id) = tc["id"].as_str() {
                acc.set_id(index, id);
            }
            if let Some(name) = tc["function"]["name"].as_str() {
                acc.set_name(index, name);
            }
            if let Some(args) = tc["function"]["arguments"].as_str() {
                acc.append_args(index, args);
            }
        }
    }
    chunk
}

/// Stream a chat completion, emitting tokens and returning the accumulated
/// content + any requested tool calls.
fn stream_http(
    run_id: &str,
    config: &LlmConfig,
    messages: &[ChatMessage],
    tools: &[Value],
    emit: &mut dyn FnMut(AgentEvent),
) -> Result<StreamOutcome, String> {
    let model = if config.model.is_empty() {
        DEFAULT_MODEL
    } else {
        &config.model
    };
    let mut body = serde_json::json!({
        "model": model,
        "messages": messages,
        "stream": true,
    });
    if !tools.is_empty() {
        body["tools"] = Value::Array(tools.to_vec());
    }

    let key = config.api_key.as_deref().unwrap_or("");
    let resp = ureq::post(&config.endpoint)
        .set("Authorization", &format!("Bearer {key}"))
        .set("X-Title", "Recurse")
        .send_json(&body)
        .map_err(|e| map_http_error(e))?;

    let reader = resp.into_reader();
    let mut buf = std::io::BufReader::new(reader);
    let mut line = String::new();
    let mut acc = ToolCallAccumulator::default();
    let mut content = String::new();
    let mut reasoning = String::new();

    loop {
        line.clear();
        match buf.read_line(&mut line) {
            Ok(0) | Err(_) => break,
            Ok(_) => {}
        }
        let l = line.trim();
        let Some(data) = l.strip_prefix("data:") else {
            continue;
        };
        let data = data.trim();
        if data == "[DONE]" {
            break;
        }
        if data.is_empty() {
            continue;
        }
        let chunk = parse_delta(data, &mut acc);
        for r in chunk.reasoning {
            reasoning.push_str(&r);
            emit(AgentEvent::Reasoning {
                run_id: run_id.to_string(),
                delta: r,
            });
        }
        if !chunk.content.is_empty() {
            emit(AgentEvent::Token {
                run_id: run_id.to_string(),
                delta: chunk.content.clone(),
            });
            content.push_str(&chunk.content);
        }
    }

    Ok(StreamOutcome {
        content,
        reasoning,
        tool_calls: acc.calls,
    })
}

fn map_http_error(e: ureq::Error) -> String {
    match e {
        ureq::Error::Status(code, resp) => {
            let body = resp.into_string().unwrap_or_default();
            let snippet: String = body.chars().take(300).collect();
            format!("llm request failed with status {code}: {snippet}")
        }
        other => format!("llm request failed: {other}"),
    }
}

/// The agent: holds conversation history. LLM config and tool execution are
/// supplied per run so the caller controls session/project access.
pub struct Agent {
    messages: Vec<ChatMessage>,
}

impl Agent {
    pub fn new() -> Self {
        Self {
            messages: Vec::new(),
        }
    }

    /// Replace history (used to restore a persisted conversation).
    pub fn load(&mut self, messages: Vec<ChatMessage>) {
        self.messages = messages;
    }

    pub fn messages(&self) -> &[ChatMessage] {
        &self.messages
    }

    pub fn reset(&mut self) {
        self.messages.clear();
    }

    /// Run one user turn to completion: stream the reply, execute any tool
    /// calls the model requests, feed results back, and loop until the model
    /// produces a final answer (or the iteration budget is exhausted).
    ///
    /// `exec` runs a tool call (name + JSON arguments) against the live r2 /
    /// debug / memory backends and returns its result text.
    pub fn run(
        &mut self,
        run_id: &str,
        config: &LlmConfig,
        path: &str,
        info: &Value,
        memory: &str,
        user: &str,
        tools: &[Value],
        exec: &mut dyn FnMut(&ToolCall) -> Result<String, String>,
        emit: &mut dyn FnMut(AgentEvent),
    ) -> Result<(), String> {
        let system = build_system_prompt(path, info, memory);
        self.messages.push(ChatMessage::user(user));

        let configured = config
            .api_key
            .as_ref()
            .map(|k| !k.is_empty())
            .unwrap_or(false);

        if !configured {
            let reply = echo_reply(user);
            emit(AgentEvent::Token {
                run_id: run_id.to_string(),
                delta: reply.clone(),
            });
            emit(AgentEvent::Done {
                run_id: run_id.to_string(),
                content: reply.clone(),
            });
            self.messages
                .push(ChatMessage::assistant(Some(reply), None));
            return Ok(());
        }

        for _ in 0..MAX_TOOL_ITERATIONS {
            let mut full = vec![ChatMessage::system(&system)];
            full.extend(self.messages.iter().map(ChatMessage::without_reasoning));

            let outcome = stream_http(run_id, config, &full, tools, emit)?;

            if !outcome.tool_calls.is_empty() {
                // Persist the assistant's tool request, then run each tool.
                let content = if outcome.content.is_empty() {
                    None
                } else {
                    Some(outcome.content.clone())
                };
                self.messages.push(
                    ChatMessage::assistant(content, Some(outcome.tool_calls.clone()))
                        .with_reasoning(Some(outcome.reasoning.clone())),
                );

                for tc in &outcome.tool_calls {
                    emit(AgentEvent::ToolCall {
                        run_id: run_id.to_string(),
                        id: tc.id.clone(),
                        name: tc.function.name.clone(),
                        arguments: tc.function.arguments.clone(),
                    });
                    let result = exec(tc).unwrap_or_else(|e| format!("tool error: {e}"));
                    emit(AgentEvent::ToolResult {
                        run_id: run_id.to_string(),
                        id: tc.id.clone(),
                        name: tc.function.name.clone(),
                        result: result.clone(),
                    });
                    self.messages.push(ChatMessage::tool(tc.id.clone(), result));
                }
                continue;
            }

            // Final answer.
            emit(AgentEvent::Done {
                run_id: run_id.to_string(),
                content: outcome.content.clone(),
            });
            self.messages.push(
                ChatMessage::assistant(Some(outcome.content.clone()), None)
                    .with_reasoning(Some(outcome.reasoning.clone())),
            );
            return Ok(());
        }

        Err("agent exceeded the maximum number of tool iterations".into())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::{BufRead, Read, Write};
    use std::net::TcpListener;
    use std::sync::{Arc, Mutex};

    /// Tiny in-process SSE server that serves one queued body per connection.
    struct MockSse {
        addr: String,
        _bodies: Arc<Mutex<Vec<String>>>,
    }

    impl MockSse {
        fn new(bodies: Vec<String>) -> Self {
            let listener = TcpListener::bind("127.0.0.1:0").unwrap();
            let addr = format!("http://{}", listener.local_addr().unwrap());
            let bodies = Arc::new(Mutex::new(bodies));
            let shared = bodies.clone();
            std::thread::spawn(move || {
                for conn in listener.incoming() {
                    let Ok(mut sock) = conn else { break };
                    let mut line = String::new();
                    let mut reader = std::io::BufReader::new(sock.try_clone().unwrap());
                    let mut content_length = 0usize;
                    loop {
                        line.clear();
                        if reader.read_line(&mut line).unwrap_or(0) == 0 {
                            break;
                        }
                        let l = line.trim_end();
                        if l.is_empty() {
                            break;
                        }
                        if let Some(v) = l.to_ascii_lowercase().strip_prefix("content-length:") {
                            content_length = v.trim().parse().unwrap_or(0);
                        }
                    }
                    // Drain the request body: closing a socket with unread data
                    // sends RST (not FIN), which can wipe the response before the
                    // client reads it.
                    if content_length > 0 {
                        let mut body = vec![0u8; content_length];
                        let _ = reader.read_exact(&mut body);
                    }
                    let body = {
                        let mut q = shared.lock().unwrap();
                        if q.is_empty() {
                            break;
                        }
                        q.remove(0)
                    };
                    let header = format!(
                        "HTTP/1.1 200 OK\r\nContent-Type: text/event-stream\r\nContent-Length: {}\r\nConnection: close\r\n\r\n",
                        body.len()
                    );
                    sock.write_all(header.as_bytes()).unwrap();
                    sock.write_all(body.as_bytes()).unwrap();
                    sock.flush().unwrap();
                }
            });
            MockSse {
                addr,
                _bodies: bodies,
            }
        }
    }

    fn content_body(text: &str) -> String {
        let obj = serde_json::json!({
            "id": "x",
            "choices": [{ "delta": { "content": text } }]
        });
        format!("data: {obj}\n\ndata: [DONE]\n\n")
    }

    fn tool_body(name: &str, args: &str) -> String {
        let obj = serde_json::json!({
            "id": "x",
            "choices": [{
                "delta": {
                    "tool_calls": [{
                        "index": 0,
                        "id": "call_1",
                        "type": "function",
                        "function": { "name": name, "arguments": args }
                    }]
                }
            }]
        });
        format!("data: {obj}\n\ndata: [DONE]\n\n")
    }

    fn reasoned_body(text: &str, reasoning: &str) -> String {
        let obj = serde_json::json!({
            "id": "x",
            "choices": [{
                "delta": { "reasoning": reasoning, "content": text }
            }]
        });
        format!("data: {obj}\n\ndata: [DONE]\n\n")
    }

    fn run_with(
        bodies: Vec<String>,
    ) -> (
        Result<(), String>,
        Vec<AgentEvent>,
        Vec<String>,
        Vec<ChatMessage>,
    ) {
        let mock = MockSse::new(bodies);
        let config = LlmConfig {
            endpoint: mock.addr,
            api_key: Some("k".into()),
            model: "m".into(),
        };
        let mut agent = Agent::new();
        let info = serde_json::json!({"bin":{"arch":"x86","bits":64,"type":"elf"}});
        let mut events: Vec<AgentEvent> = Vec::new();
        let mut exec = |_tc: &ToolCall| -> Result<String, String> { Ok("rip=0x1234".into()) };
        let mut emit = |ev: AgentEvent| events.push(ev);
        let res = agent.run(
            "run-1",
            &config,
            "/tmp/b",
            &info,
            "",
            "hello",
            &[],
            &mut exec,
            &mut emit,
        );
        let content: String = events
            .iter()
            .filter_map(|e| match e {
                AgentEvent::Token { delta, .. } => Some(delta.clone()),
                _ => None,
            })
            .collect();
        (res, events, vec![content], agent.messages().to_vec())
    }

    #[test]
    fn streams_content_and_emits_done() {
        let (res, events, content, _) = run_with(vec![content_body("Hello, world!")]);
        assert!(res.is_ok(), "run failed: {res:?}");
        assert_eq!(content[0], "Hello, world!");
        assert!(events.iter().any(|e| matches!(e, AgentEvent::Done { .. })));
    }

    #[test]
    fn executes_tool_loop_then_final_answer() {
        let (res, events, content, _) = run_with(vec![
            tool_body("debug_registers", "{}"),
            content_body("registers dumped."),
        ]);
        assert!(res.is_ok(), "run failed: {res:?}");
        assert!(events
            .iter()
            .any(|e| matches!(e, AgentEvent::ToolCall { name, .. } if name == "debug_registers")));
        assert!(events
            .iter()
            .any(|e| matches!(e, AgentEvent::ToolResult { result, .. } if result == "rip=0x1234")));
        assert!(events.iter().any(|e| matches!(e, AgentEvent::Done { .. })));
        assert_eq!(content[0], "registers dumped.");
    }

    #[test]
    fn reasoning_is_streamed_and_persisted() {
        let (res, events, _, messages) = run_with(vec![reasoned_body(
            "Answer.",
            "Let me think about this carefully.",
        )]);
        assert!(res.is_ok(), "run failed: {res:?}");
        assert!(events.iter().any(
            |e| matches!(e, AgentEvent::Reasoning { delta, .. } if delta == "Let me think about this carefully.")
        ));
        assert!(events.iter().any(|e| matches!(e, AgentEvent::Done { .. })));
        // The assistant message persists the reasoning trace.
        let assistant = messages
            .iter()
            .find(|m| m.role == "assistant")
            .expect("assistant message present");
        assert_eq!(
            assistant.reasoning.as_deref(),
            Some("Let me think about this carefully.")
        );
    }

    #[test]
    fn echo_path_when_no_key() {
        let config = LlmConfig {
            endpoint: "http://127.0.0.1:1".into(),
            api_key: None,
            model: "m".into(),
        };
        let mut agent = Agent::new();
        let info = serde_json::json!({"bin":{"arch":"x86","bits":64,"type":"elf"}});
        let mut events: Vec<AgentEvent> = Vec::new();
        let mut exec = |_tc: &ToolCall| -> Result<String, String> { Ok(String::new()) };
        let mut emit = |ev: AgentEvent| events.push(ev);
        let res = agent.run(
            "run-e",
            &config,
            "/tmp/b",
            &info,
            "",
            "hello",
            &[],
            &mut exec,
            &mut emit,
        );
        assert!(res.is_ok(), "echo run failed: {res:?}");
        assert!(events.iter().any(|e| matches!(e, AgentEvent::Token { .. })));
        assert!(events.iter().any(|e| matches!(e, AgentEvent::Done { .. })));
    }
}
