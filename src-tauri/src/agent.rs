use serde::{Deserialize, Serialize};
use serde_json::Value;

use crate::config;

const OPENROUTER_MODELS: &str = "https://openrouter.ai/api/v1/chat/completions";
const OPENROUTER_MODELS_LIST: &str = "https://openrouter.ai/api/v1/models";
const DEFAULT_MODEL: &str = "openrouter/auto";

/// One turn in the agent conversation.
#[derive(Clone, Serialize, Deserialize)]
pub struct ChatMessage {
    pub role: String,
    pub content: String,
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

fn complete_http(
    endpoint: &str,
    api_key: &str,
    model: &str,
    messages: &[ChatMessage],
) -> Result<String, String> {
    let model = if model.is_empty() {
        DEFAULT_MODEL
    } else {
        model
    };
    let body = serde_json::json!({
        "model": model,
        "messages": messages,
    });
    let resp = ureq::post(endpoint)
        .set("Authorization", &format!("Bearer {api_key}"))
        .set("X-Title", "Recurse")
        .send_json(&body)
        .map_err(|e| format!("llm request failed: {e}"))?;
    let value: Value = resp.into_json().map_err(|e| e.to_string())?;
    value["choices"][0]["message"]["content"]
        .as_str()
        .map(|s| s.to_string())
        .ok_or_else(|| "llm returned no content".into())
}

fn echo_reply(user: &str) -> String {
    format!(
        "[echo] Set the OPENROUTER_API_KEY environment variable to enable the \
         real model, then pick a model from the selector above.\n\nYou asked:\n{user}"
    )
}

fn build_system_prompt(path: &str, info: &Value) -> String {
    let arch = info["bin"]["arch"].as_str().unwrap_or("?");
    let bits = info["bin"]["bits"].as_u64().unwrap_or(0);
    let kind = info["bin"]["type"].as_str().unwrap_or("?");
    format!(
        "You are Recurse, an expert reverse-engineering agent embedded in a \
         desktop binary analysis tool.\n\n\
         Current target: {path}\n\
         Binary: arch={arch} bits={bits} type={kind}\n\n\
         Capabilities available to you through the host:\n\
         - disassemble: pdj <count> @ <addr> / pdfj @ <addr>\n\
         - functions: aflj\n\
         - strings: izzj\n\
         - imports: iij\n\
         - xrefs to an address: axtj @ <addr>\n\
         - decompile: pdgj @ <addr>\n\
         - any other analysis command works too.\n\n\
         Reply with focused, concise reverse-engineering analysis. When you \
         want the host to run a command, emit it inside a ```r2 ... ``` block. \
         When you need user input, ask explicitly."
    )
}

/// The agent: holds conversation history. LLM config is supplied per turn.
pub struct Agent {
    messages: Vec<ChatMessage>,
}

impl Agent {
    pub fn new() -> Self {
        Self {
            messages: Vec::new(),
        }
    }

    /// Run one user turn against the LLM with full binary context.
    pub fn chat(
        &mut self,
        config: &LlmConfig,
        path: &str,
        info: &Value,
        user: &str,
    ) -> Result<String, String> {
        let system = build_system_prompt(path, info);
        self.messages.push(ChatMessage {
            role: "user".into(),
            content: user.to_string(),
        });

        let mut full = vec![ChatMessage {
            role: "system".into(),
            content: system,
        }];
        full.extend(self.messages.clone());

        let reply = match &config.api_key {
            Some(key) if !key.is_empty() => {
                complete_http(&config.endpoint, key, &config.model, &full)
            }
            _ => Ok(echo_reply(user)),
        }?;

        self.messages.push(ChatMessage {
            role: "assistant".into(),
            content: reply.clone(),
        });
        Ok(reply)
    }

    pub fn reset(&mut self) {
        self.messages.clear();
    }
}
