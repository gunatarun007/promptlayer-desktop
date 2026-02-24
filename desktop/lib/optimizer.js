/**
 * PromptLayer Desktop — Optimization Pipeline
 *
 * Single source of truth for all prompt optimization.
 * Supports multiple providers via OpenAI-compatible chat/completions format.
 * No hardcoded API keys. Config is always injected by the caller.
 */

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

const INSTRUCTION_MAP = {
    expand: 'Expand this input into a detailed, comprehensive prompt. Add specificity, context, and structure. Keep the original intent.',
    clarify: 'Improve the clarity of this prompt. Fix grammar, add punctuation, remove ambiguity, and make it more precise.',
    advance: 'Elevate this question into an advanced, expert-level query. Add depth, specify constraints, and request detailed analysis.',
    edge_cases: 'This prompt involves code or technical content. Add edge cases, error handling considerations, and best practices to the request.',
    enhance: 'Optimize this prompt for maximum clarity, structure, and effectiveness. Preserve the original intent while improving quality.',
};

const PROVIDER_DEFAULTS = {
    openai: { base: 'https://api.openai.com/v1' },
    gemini: { base: 'https://generativelanguage.googleapis.com/v1beta/openai' },
    groq: { base: 'https://api.groq.com/openai/v1' },
    openrouter: { base: 'https://openrouter.ai/api/v1' },
};

async function optimizePrompt(rawPrompt, instruction, config) {
    const { provider, apiKey, model, apiBase } = config;

    if (!apiKey) throw new Error('API key not configured. Open settings to add your key.');
    if (!rawPrompt || !rawPrompt.trim()) throw new Error('Please enter some text to optimize.');

    let userMessage = rawPrompt;
    if (instruction && INSTRUCTION_MAP[instruction]) {
        userMessage = INSTRUCTION_MAP[instruction] + '\n\nOriginal input:\n' + rawPrompt;
    }

    const base = apiBase || PROVIDER_DEFAULTS[provider]?.base || 'https://api.openai.com/v1';

    const headers = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
    };
    if (provider === 'openrouter') {
        headers['HTTP-Referer'] = 'https://promptlayer.app';
        headers['X-Title'] = 'PromptLayer Desktop';
    }

    const res = await fetch(`${base}/chat/completions`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
            model: model || 'gpt-4o-mini',
            messages: [
                { role: 'system', content: SYSTEM_PROMPT },
                { role: 'user', content: userMessage },
            ],
            temperature: 0.7,
            max_tokens: 2048,
        }),
    });

    if (!res.ok) {
        const body = await res.text().catch(() => '');
        if (res.status === 401) throw new Error('Invalid API key. Check your key in settings.');
        if (res.status === 429) throw new Error('Rate limited. Wait a moment and try again.');
        if (res.status === 402) throw new Error('Insufficient credits. Check your account balance.');
        throw new Error(`API error (${res.status}): ${body}`);
    }

    const data = await res.json();
    if (!data.choices?.length) throw new Error('No response received from the model.');

    return data.choices[0].message.content.trim();
}

module.exports = { optimizePrompt, INSTRUCTION_MAP, PROVIDER_DEFAULTS };
