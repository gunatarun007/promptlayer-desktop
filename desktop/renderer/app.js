/**
 * PromptLayer Desktop — Renderer
 *
 * All UI logic. Communicates with main process exclusively through
 * window.promptlayer bridge. Zero direct Node/Electron access.
 *
 * API validation is always sourced from main process via getSettings().
 * Renderer NEVER validates based on local UI state alone.
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
    const welcome = $('pl-welcome');
    const settingsHeader = $('pl-settings-header');
    const apikeyError = $('pl-apikey-error');
    const tooltip = $('pl-tooltip');
    const tooltipText = $('pl-tooltip-text');
    const tooltipClose = $('pl-tooltip-close');

    // ─── State ───────────────────────────────────────────────────────────
    let optimizedText = '';
    let isProcessing = false;
    let isFirstRun = false;
    let hasValidKey = false;

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

    // ─── Status (reflects real stored state) ─────────────────────────────
    function setStatus(state, text) {
        statusDot.className = 'pl-status-dot' + (state !== 'ready' ? ` ${state}` : '');
        statusText.textContent = text;
    }

    async function refreshStatus() {
        const s = await window.promptlayer.getSettings();
        hasValidKey = s.apiKey && s.apiKey.length >= 10;
        if (s.shortcut) shortcutHint.textContent = s.shortcut;

        if (hasValidKey) {
            setStatus('ready', 'Connected');
        } else {
            setStatus('error', 'API key missing');
        }

        updateEnhanceButton();
    }

    // ─── Enhance button gate ─────────────────────────────────────────────
    function updateEnhanceButton() {
        const hasText = input.value.length >= 3;
        btnEnhance.disabled = !hasText || !hasValidKey;
    }

    // ─── Input ───────────────────────────────────────────────────────────
    input.addEventListener('input', () => {
        charCount.textContent = input.value.length;
        updateEnhanceButton();
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
        if (!chip || isProcessing || !hasValidKey) return;
        const raw = input.value.trim();
        if (raw.length < 3) return;
        runOptimization(raw, chip.dataset.instruction);
    });

    // ─── Enhance ─────────────────────────────────────────────────────────
    btnEnhance.addEventListener('click', () => {
        if (isProcessing || !hasValidKey) return;
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
                setStatus('ready', 'Connected');
                showToast('Prompt enhanced ✓', 'success');
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

    // ─── View Navigation ─────────────────────────────────────────────────
    function showView(target) {
        viewMain.classList.remove('active');
        viewSettings.classList.remove('active');
        target.classList.add('active');
    }

    function openSettings() {
        loadSettings();
        if (isFirstRun) {
            welcome.style.display = '';
            settingsHeader.style.display = 'none';
        } else {
            welcome.style.display = 'none';
            settingsHeader.style.display = '';
        }
        showView(viewSettings);
    }

    btnSettings.addEventListener('click', openSettings);
    window.promptlayer.onNavigateSettings(openSettings);

    btnBack.addEventListener('click', () => {
        // Prevent going back to main if no key configured (first-run)
        if (isFirstRun && !hasValidKey) return;
        showView(viewMain);
    });

    btnClose.addEventListener('click', () => window.promptlayer.hide());

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

        // Clear validation
        clearKeyError();
    }

    setProvider.addEventListener('change', () => {
        const cfg = PROVIDER_CONFIG[setProvider.value];
        if (cfg) {
            if (cfg.base) setApiBase.value = cfg.base;
            setApiKey.placeholder = cfg.placeholder;
        }
    });

    // ─── Inline validation ───────────────────────────────────────────────
    function showKeyError(msg) {
        apikeyError.textContent = msg;
        apikeyError.style.display = '';
        setApiKey.classList.add('pl-input-error');
    }

    function clearKeyError() {
        apikeyError.textContent = '';
        apikeyError.style.display = 'none';
        setApiKey.classList.remove('pl-input-error');
    }

    setApiKey.addEventListener('input', () => clearKeyError());

    // ─── Save ────────────────────────────────────────────────────────────
    btnSave.addEventListener('click', async () => {
        const key = setApiKey.value.trim();

        // Validate key length
        if (!key) {
            showKeyError('API key is required.');
            setApiKey.focus();
            return;
        }
        if (key.length < 10) {
            showKeyError('API key is too short. Check your key.');
            setApiKey.focus();
            return;
        }

        clearKeyError();

        const result = await window.promptlayer.saveSettings({
            provider: setProvider.value,
            apiKey: key,
            model: setModel.value.trim() || 'gpt-4o-mini',
            apiBase: setApiBase.value.trim() || 'https://api.openai.com/v1',
        });

        if (result.success) {
            showToast('API Key Saved ✓', 'success');

            // Re-check real stored state
            await refreshStatus();

            if (isFirstRun && hasValidKey) {
                isFirstRun = false;

                // Auto-switch to main view
                showView(viewMain);

                // Show shortcut tooltip
                const shortcut = result.shortcut || 'Ctrl+Shift+L';
                tooltipText.innerHTML = `Press <strong>${shortcut}</strong> anytime to enhance prompts.`;
                tooltip.style.display = '';
                setTimeout(() => tooltip.classList.add('visible'), 50);

                // Auto-dismiss tooltip
                setTimeout(() => {
                    tooltip.classList.remove('visible');
                    setTimeout(() => { tooltip.style.display = 'none'; }, 300);
                }, 6000);
            } else {
                showView(viewMain);
            }
        }
    });

    // Tooltip close
    tooltipClose.addEventListener('click', () => {
        tooltip.classList.remove('visible');
        setTimeout(() => { tooltip.style.display = 'none'; }, 300);
    });

    // ─── Keyboard ────────────────────────────────────────────────────────
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            if (viewSettings.classList.contains('active')) {
                if (isFirstRun && !hasValidKey) return; // can't escape first-run
                showView(viewMain);
            } else {
                window.promptlayer.hide();
            }
        }
    });

    // ─── Window Lifecycle ────────────────────────────────────────────────
    window.promptlayer.onShown(async () => {
        if (isFirstRun) {
            openSettings();
            setTimeout(() => setApiKey.focus(), 50);
            return;
        }

        showView(viewMain);
        resultArea.classList.remove('visible');

        // Auto-capture: read clipboard
        try {
            const clip = await window.promptlayer.readClipboard();
            if (clip && clip.trim().length > 0) {
                input.value = clip.trim();
                charCount.textContent = input.value.length;
                updateEnhanceButton();
            }
        } catch (_) { /* no clipboard */ }

        setTimeout(() => { input.focus(); input.select(); }, 30);
    });

    // ─── First-run handler ───────────────────────────────────────────────
    window.promptlayer.onFirstRun(() => {
        isFirstRun = true;
        openSettings();
        setTimeout(() => setApiKey.focus(), 100);
    });

    // ─── Init ────────────────────────────────────────────────────────────
    (async function init() {
        await refreshStatus();

        if (!hasValidKey) {
            isFirstRun = true;
            // Don't auto-switch here; wait for first-run event from main
        }
    })();

})();
