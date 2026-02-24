/**
 * PromptLayer — Background Service Worker
 * 
 * Handles all LLM API communication. The content script sends messages here
 * to keep the API key usage isolated and secure. This follows the principle
 * of least privilege — content scripts never directly access the API key.
 */

// ─── Master System Prompt ───────────────────────────────────────────────────
const SYSTEM_PROMPT = `You are an expert AI Prompt Optimization Agent.

Your job is to improve raw user input into a highly structured, clear, and powerful prompt without changing the user's original intent.

Rules:

1. Preserve the original meaning.
2. Expand vague requests into specific, actionable instructions.
3. Add structure when useful (context, constraints, output format).
4. Add clarity, precision, and completeness.
5. Remove ambiguity.
6. If the input is already strong, lightly refine it.
7. Do NOT explain what you changed.
8. Output ONLY the improved prompt.
9. Do not add commentary, markdown, or explanations.

Enhancement Strategy:

- Identify the goal.
- Identify missing context.
- Add role framing if helpful (e.g., "Act as an expert…").
- Add constraints (length, tone, format).
- Add structure (bullet points, steps, examples).
- Keep it concise but powerful.

Return only the optimized version.`;

// ─── Message Listener ───────────────────────────────────────────────────────
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === 'OPTIMIZE_PROMPT') {
    handleOptimize(request.payload)
      .then(result => sendResponse({ success: true, data: result }))
      .catch(error => sendResponse({ success: false, error: error.message }));
    // Return true to indicate async response
    return true;
  }

  if (request.type === 'GET_API_KEY') {
    chrome.storage.local.get(['promptlayer_api_key', 'promptlayer_model'], (result) => {
      sendResponse({
        apiKey: result.promptlayer_api_key || '',
        model: result.promptlayer_model || 'gpt-4o-mini'
      });
    });
    return true;
  }

  if (request.type === 'SAVE_API_KEY') {
    chrome.storage.local.set({
      promptlayer_api_key: request.payload.apiKey,
      promptlayer_model: request.payload.model || 'gpt-4o-mini'
    }, () => {
      sendResponse({ success: true });
    });
    return true;
  }
});

// ─── Chip Instruction Presets (used by inline contextual engine) ────────────
const INSTRUCTION_MAP = {
  expand: 'Expand this input into a detailed, comprehensive prompt. Add specificity, context, and structure. Keep the original intent.',
  clarify: 'Improve the clarity of this prompt. Fix grammar, add punctuation, remove ambiguity, and make it more precise.',
  advance: 'Elevate this question into an advanced, expert-level query. Add depth, specify constraints, and request detailed analysis.',
  edge_cases: 'This prompt involves code or technical content. Add edge cases, error handling considerations, and best practices to the request.',
  enhance: 'Optimize this prompt for maximum clarity, structure, and effectiveness. Preserve the original intent while improving quality.',
};

// ─── API Call Handler ───────────────────────────────────────────────────────
async function handleOptimize(payload) {
  const { rawPrompt, instruction } = payload;

  // Retrieve stored config
  const config = await new Promise((resolve) => {
    chrome.storage.local.get([
      'promptlayer_provider',
      'promptlayer_api_key',
      'promptlayer_model',
      'promptlayer_api_base'
    ], (result) => {
      resolve({
        provider: result.promptlayer_provider || 'openai',
        apiKey: result.promptlayer_api_key || '',
        model: result.promptlayer_model || 'gpt-4o-mini',
        apiBase: result.promptlayer_api_base || 'https://api.openai.com/v1'
      });
    });
  });

  if (!config.apiKey) {
    throw new Error('API key not configured. Click the settings icon to add your key.');
  }

  if (!rawPrompt || rawPrompt.trim().length === 0) {
    throw new Error('Please enter some text to optimize.');
  }

  // If a chip instruction is provided, prefix it to the user message
  let userMessage = rawPrompt;
  if (instruction && INSTRUCTION_MAP[instruction]) {
    userMessage = INSTRUCTION_MAP[instruction] + '\n\nOriginal input:\n' + rawPrompt;
  }

  // Build provider-aware headers
  const headers = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${config.apiKey}`
  };

  // OpenRouter requires HTTP-Referer and X-Title headers
  if (config.provider === 'openrouter') {
    headers['HTTP-Referer'] = 'https://promptlayer.app';
    headers['X-Title'] = 'PromptLayer';
  }

  // OpenAI-compatible chat completion request (works with all providers)
  const response = await fetch(`${config.apiBase}/chat/completions`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      model: config.model,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: userMessage }
      ],
      temperature: 0.7,
      max_tokens: 2048
    })
  });

  if (!response.ok) {
    const errBody = await response.text();
    if (response.status === 401) {
      throw new Error('Invalid API key. Please check your key in settings.');
    }
    if (response.status === 429) {
      throw new Error('Rate limited. Please wait a moment and try again.');
    }
    if (response.status === 402) {
      throw new Error('Insufficient credits. Please check your account balance.');
    }
    throw new Error(`API Error (${response.status}): ${errBody}`);
  }

  const data = await response.json();

  if (!data.choices || data.choices.length === 0) {
    throw new Error('No response received from the model.');
  }

  return data.choices[0].message.content.trim();
}

// ─── Installation Handler ───────────────────────────────────────────────────
chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    // Set default values on first install
    chrome.storage.local.set({
      promptlayer_model: 'gpt-4o-mini',
      promptlayer_api_base: 'https://api.openai.com/v1',
      promptlayer_auto_inject: false,
      promptlayer_auto_submit: false
    });
  }
});
