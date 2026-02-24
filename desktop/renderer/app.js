/**
 * PromptLayer Desktop — Renderer
 *
 * All UI logic. Communicates with main process exclusively through
 * window.promptlayer bridge. Zero direct Node/Electron access.
 */

(function () {
    'use strict';

    // ─── DOM ─────────────────────────────────────────────────────────────
    const $ = (id) => document.getElementById(id);

    const input = $('pl-input');
    const charCount = $('pl-charcount');
    const chipsContainer = $('pl-chips');
    const btnEnhance = $('btn-enhance');
    const btnEnhanceText = $('btn-enhance-text');
    const resultArea = $('pl-result-area');
    const resultBody = $('pl-result-body');
    const btnInsert = $('btn-insert');
    const btnCopy = $('btn-copy');
    const btnImprove = $('btn-improve');
    const btnSettings = $('btn-settings');
    const btnClose = $('btn-close');
    const btnBack = $('btn-back');
    const btnSave = $('btn-save');
    const viewMain = $('view-main');
    const viewSettings = $('view-settings');
    const statusDot = $('pl-status-dot');
    const statusText = $('pl-status-text');
    const shortcutHint = $('pl-shortcut-hint');
    const setProvider = $('set-provider');
    const setApiKey = $('set-apikey');
    const setModel = $('set-model');
    const setApiBase = $('set-apibase');

    // ─── State ───────────────────────────────────────────────────────────
    let optimizedText = '';
    let isProcessing = false;

    const PROVIDER_CONFIG = {
        openai: { base: 'https://api.openai.com/v1', placeholder: 'sk-...' },
        gemini: { base: 'https://generativelanguage.googleapis.com/v1beta/openai', placeholder: 'AIza...' },
        groq: { base: 'https://api.groq.com/openai/v1', placeholder: 'gsk_...' },
        openrouter: { base: 'https://openrouter.ai/api/v1', placeholder: 'sk-or-...' },
        custom: { base: '', placeholder: 'Your API key...' },
    };

    // ─── Toast ───────────────────────────────────────────────────────────
    let toastEl = null;
    let toastTimer = null;

    function showToast(msg, type) {
        if (!toastEl) {
            toastEl = document.createElement('div');
            toastEl.className = 'pl-toast';
            document.body.appendChild(toastEl);
        }
        clearTimeout(toastTimer);
        toastEl.textContent = msg;
        toastEl.className = 'pl-toast visible' + (type ? ` ${type}` : '');
        toastTimer = setTimeout(() => toastEl.classList.remove('visible'), 2500);
    }

    // ─── Status ──────────────────────────────────────────────────────────
    function setStatus(state, text) {
        statusDot.className = 'pl-status-dot' + (state !== 'ready' ? ` ${state}` : '');
        statusText.textContent = text;
    }

    // ─── Input ───────────────────────────────────────────────────────────
    input.addEventListener('input', () => {
        const len = input.value.length;
        charCount.textContent = len;
        btnEnhance.disabled = len < 3;
    });

    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
            e.preventDefault();
            if (!btnEnhance.disabled) btnEnhance.click();
        }
    });

    // ─── Chips ───────────────────────────────────────────────────────────
    chipsContainer.addEventListener('click', (e) => {
        const chip = e.target.closest('.pl-chip');
        if (!chip || isProcessing) return;
        const raw = input.value.trim();
        if (raw.length < 3) return;
        runOptimization(raw, chip.dataset.instruction);
    });

    // ─── Enhance ─────────────────────────────────────────────────────────
    btnEnhance.addEventListener('click', () => {
        if (isProcessing) return;
        const raw = input.value.trim();
        if (raw.length < 3) return;
        runOptimization(raw, 'enhance');
    });

    // ─── Optimization ────────────────────────────────────────────────────
    async function runOptimization(text, instruction) {
        if (isProcessing) return;
        isProcessing = true;

        btnEnhance.classList.add('loading');
        btnEnhanceText.textContent = 'Enhancing…';
        btnEnhance.querySelector('.pl-btn-icon').style.display = 'none';
        setStatus('working', 'Processing…');
        resultArea.classList.remove('visible');

        try {
            const result = await window.promptlayer.optimize(text, instruction);

            if (result.success && result.data) {
                optimizedText = result.data;
                resultBody.textContent = optimizedText;
                resultArea.classList.add('visible');
                setStatus('ready', 'Enhanced ✓');
                showToast('Prompt enhanced', 'success');
            } else {
                setStatus('error', result.error || 'Failed');
                showToast(result.error || 'Optimization failed', 'error');
            }
        } catch (_) {
            setStatus('error', 'Connection error');
            showToast('Failed to reach optimization engine', 'error');
        }

        btnEnhanceText.textContent = 'Enhance';
        btnEnhance.querySelector('.pl-btn-icon').style.display = '';
        btnEnhance.classList.remove('loading');
        isProcessing = false;
    }

    // ─── Result Actions ──────────────────────────────────────────────────
    btnCopy.addEventListener('click', async () => {
        if (!optimizedText) return;
        await window.promptlayer.copyText(optimizedText);
        showToast('Copied to clipboard ✓', 'success');

        const orig = btnCopy.innerHTML;
        btnCopy.innerHTML = `
            <svg class="pl-btn-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                <polyline points="20 6 9 17 4 12"/>
            </svg>
            Copied`;
        setTimeout(() => { btnCopy.innerHTML = orig; }, 1500);
    });

    btnInsert.addEventListener('click', async () => {
        if (!optimizedText) return;
        await window.promptlayer.insertText(optimizedText);
    });

    btnImprove.addEventListener('click', () => {
        if (!optimizedText || isProcessing) return;
        runOptimization(optimizedText, 'enhance');
    });

    // ─── Navigation ──────────────────────────────────────────────────────
    function showView(target) {
        viewMain.classList.remove('active');
        viewSettings.classList.remove('active');
        target.classList.add('active');
    }

    btnSettings.addEventListener('click', () => { loadSettings(); showView(viewSettings); });
    btnBack.addEventListener('click', () => showView(viewMain));
    btnClose.addEventListener('click', () => window.promptlayer.closeWindow());

    // ─── Settings ────────────────────────────────────────────────────────
    async function loadSettings() {
        const s = await window.promptlayer.getSettings();
        setProvider.value = s.provider || 'openai';
        setApiKey.value = s.apiKey || '';
        setModel.value = s.model || 'gpt-4o-mini';
        setApiBase.value = s.apiBase || 'https://api.openai.com/v1';
        if (s.shortcut) shortcutHint.textContent = s.shortcut;

        const cfg = PROVIDER_CONFIG[setProvider.value];
        if (cfg) setApiKey.placeholder = cfg.placeholder;
    }

    setProvider.addEventListener('change', () => {
        const cfg = PROVIDER_CONFIG[setProvider.value];
        if (cfg) {
            if (cfg.base) setApiBase.value = cfg.base;
            setApiKey.placeholder = cfg.placeholder;
        }
    });

    btnSave.addEventListener('click', async () => {
        const key = setApiKey.value.trim();
        if (!key) { showToast('API key is required', 'error'); return; }

        await window.promptlayer.saveSettings({
            provider: setProvider.value,
            apiKey: key,
            model: setModel.value.trim() || 'gpt-4o-mini',
            apiBase: setApiBase.value.trim() || 'https://api.openai.com/v1',
        });

        showToast('Settings saved ✓', 'success');
        showView(viewMain);
    });

    // ─── Keyboard ────────────────────────────────────────────────────────
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            if (viewSettings.classList.contains('active')) {
                showView(viewMain);
            } else {
                window.promptlayer.closeWindow();
            }
        }
    });

    // ─── Window Lifecycle ────────────────────────────────────────────────
    window.promptlayer.onShown(async () => {
        showView(viewMain);
        resultArea.classList.remove('visible');

        // Auto-capture: read clipboard (may contain text user just selected)
        try {
            const clip = await window.promptlayer.readClipboard();
            if (clip && clip.trim().length > 0) {
                input.value = clip.trim();
                charCount.textContent = input.value.length;
                btnEnhance.disabled = input.value.length < 3;
            }
        } catch (_) { /* no clipboard content */ }

        setTimeout(() => { input.focus(); input.select(); }, 30);
    });

    // ─── Init ────────────────────────────────────────────────────────────
    (async function init() {
        try {
            const s = await window.promptlayer.getSettings();
            if (!s.apiKey) {
                setStatus('error', 'API key needed');
                showToast('Set your API key in Settings', 'error');
            } else {
                setStatus('ready', 'Ready');
            }
            if (s.shortcut) shortcutHint.textContent = s.shortcut;
        } catch (_) {
            setStatus('ready', 'Ready');
        }
    })();

})();
