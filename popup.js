/**
 * PromptLayer — Popup Settings Script
 * 
 * Handles loading and saving settings from the extension popup.
 * Includes provider presets for auto-filling API base URLs.
 */

document.addEventListener('DOMContentLoaded', () => {
    const providerSelect = document.getElementById('provider-select');
    const apiKeyInput = document.getElementById('api-key');
    const apiBaseInput = document.getElementById('api-base');
    const modelSelect = document.getElementById('model-select');
    const customModelRow = document.getElementById('custom-model-row');
    const customModelInput = document.getElementById('custom-model');
    const autoEnhanceToggle = document.getElementById('auto-enhance');
    const btnSave = document.getElementById('btn-save');
    const status = document.getElementById('status');

    // ─── Provider Presets ─────────────────────────────────────────────────
    const PROVIDER_CONFIG = {
        openai: { base: 'https://api.openai.com/v1', placeholder: 'sk-...' },
        gemini: { base: 'https://generativelanguage.googleapis.com/v1beta/openai', placeholder: 'AIza...' },
        groq: { base: 'https://api.groq.com/openai/v1', placeholder: 'gsk_...' },
        openrouter: { base: 'https://openrouter.ai/api/v1', placeholder: 'sk-or-...' },
        custom: { base: '', placeholder: 'Your API key...' }
    };

    // ─── Provider change — auto-fill base URL ─────────────────────────────
    providerSelect.addEventListener('change', () => {
        const cfg = PROVIDER_CONFIG[providerSelect.value];
        if (cfg) {
            apiBaseInput.value = cfg.base;
            apiKeyInput.placeholder = cfg.placeholder;
        }
    });

    // ─── Load saved settings ──────────────────────────────────────────────
    chrome.storage.local.get([
        'promptlayer_provider',
        'promptlayer_api_key',
        'promptlayer_api_base',
        'promptlayer_model',
        'promptlayer_auto_enhance'
    ], (result) => {
        // Provider
        providerSelect.value = result.promptlayer_provider || 'openai';
        const cfg = PROVIDER_CONFIG[providerSelect.value];
        if (cfg) apiKeyInput.placeholder = cfg.placeholder;

        apiKeyInput.value = result.promptlayer_api_key || '';
        apiBaseInput.value = result.promptlayer_api_base || 'https://api.openai.com/v1';

        const model = result.promptlayer_model || 'gpt-4o-mini';
        const optionExists = Array.from(modelSelect.options).some(o => o.value === model);

        if (optionExists && model !== 'custom') {
            modelSelect.value = model;
        } else {
            modelSelect.value = 'custom';
            customModelInput.value = model;
            customModelRow.style.display = 'flex';
        }

        autoEnhanceToggle.checked = result.promptlayer_auto_enhance || false;
    });

    // ─── Model select change ──────────────────────────────────────────────
    modelSelect.addEventListener('change', () => {
        customModelRow.style.display = modelSelect.value === 'custom' ? 'flex' : 'none';
    });

    // ─── Save settings ───────────────────────────────────────────────────
    btnSave.addEventListener('click', () => {
        const apiKey = apiKeyInput.value.trim();
        const apiBase = apiBaseInput.value.trim() || 'https://api.openai.com/v1';
        let model = modelSelect.value;

        if (model === 'custom') {
            model = customModelInput.value.trim() || 'gpt-4o-mini';
        }

        if (!apiKey) {
            showStatus('Please enter your API key.', true);
            return;
        }

        chrome.storage.local.set({
            promptlayer_provider: providerSelect.value,
            promptlayer_api_key: apiKey,
            promptlayer_api_base: apiBase,
            promptlayer_model: model,
            promptlayer_auto_enhance: autoEnhanceToggle.checked
        }, () => {
            showStatus('Settings saved successfully! ✓');
        });
    });

    // ─── Status helper ────────────────────────────────────────────────────
    function showStatus(message, isError = false) {
        status.textContent = message;
        status.className = 'status show' + (isError ? ' error' : '');
        setTimeout(() => {
            status.classList.remove('show');
        }, 3000);
    }
});
