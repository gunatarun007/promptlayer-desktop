/**
 * PromptLayer — Content Script
 * 
 * Injected into every webpage. Creates a Shadow DOM host, renders the FAB
 * and overlay panel, and orchestrates all user interactions.
 * 
 * Architecture:
 * - Shadow DOM isolates styles from host page
 * - All API calls go through background.js via chrome.runtime.sendMessage
 * - Injection logic is handled by utils/inject.js (loaded inline)
 * - UI is built by overlay.js (loaded inline)
 * 
 * Guard: Prevents duplicate injection via data attribute check.
 */

(function () {
    'use strict';

    // ─── Duplicate Injection Guard ──────────────────────────────────────────
    // On extension reload, old host element may persist but old script context
    // is dead. Remove stale host and re-inject cleanly.
    if (document.documentElement.dataset.promptlayerInjected === 'true') {
        const staleHost = document.getElementById('promptlayer-host');
        if (staleHost) staleHost.remove();
    }
    document.documentElement.dataset.promptlayerInjected = 'true';

    // ─── SVG Icons (minimal, infrastructure-grade) ──────────────────────────
    const ICONS = {
        layers: `<svg viewBox="0 0 24 24"><path d="m12 2 10 6.5-10 6.5L2 8.5Z"/><path d="m2 15.5 10 6.5 10-6.5"/><path d="m2 12 10 6.5 10-6.5"/></svg>`,
        settings: `<svg viewBox="0 0 24 24"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/></svg>`,
        close: `<svg viewBox="0 0 24 24"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>`,
        sparkle: `<svg viewBox="0 0 24 24"><path d="M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z"/></svg>`,
        inject: `<svg viewBox="0 0 24 24"><path d="M12 5v14"/><path d="m19 12-7 7-7-7"/></svg>`,
        copy: `<svg viewBox="0 0 24 24"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>`,
        check: `<svg viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>`,
        arrowLeft: `<svg viewBox="0 0 24 24"><path d="m15 18-6-6 6-6"/></svg>`,
        save: `<svg viewBox="0 0 24 24"><path d="M15.2 3a2 2 0 0 1 1.4.6l3.8 3.8a2 2 0 0 1 .6 1.4V19a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z"/><path d="M17 21v-7a1 1 0 0 0-1-1H8a1 1 0 0 0-1 1v7"/><path d="M7 3v4a1 1 0 0 0 1 1h7"/></svg>`,
    };

    // ─── Injection Utility (inline) ─────────────────────────────────────────
    const Injector = {
        _lastActiveElement: null,

        captureActiveElement() {
            const el = document.activeElement;
            if (this._isEditable(el)) {
                this._lastActiveElement = el;
                return true;
            }
            // Check accessible iframes
            try {
                const iframes = document.querySelectorAll('iframe');
                for (const iframe of iframes) {
                    try {
                        const doc = iframe.contentDocument || iframe.contentWindow.document;
                        const active = doc.activeElement;
                        if (this._isEditable(active)) {
                            this._lastActiveElement = active;
                            return true;
                        }
                    } catch (e) { /* cross-origin */ }
                }
            } catch (e) { /* skip */ }
            return false;
        },

        _isEditable(el) {
            if (!el) return false;
            if (el.tagName === 'TEXTAREA') return true;
            if (el.tagName === 'INPUT') {
                const t = (el.type || '').toLowerCase();
                return ['text', 'search', 'url', 'email', ''].includes(t);
            }
            if (el.isContentEditable) return true;
            if (el.getAttribute && el.getAttribute('role') === 'textbox') return true;
            return false;
        },

        async inject(text, autoSubmit = false) {
            const el = this._lastActiveElement;
            if (!el || !this._isEditable(el)) {
                return this._clipboardFallback(text);
            }
            try {
                el.focus();
                if (el.tagName === 'TEXTAREA' || el.tagName === 'INPUT') {
                    const setter = Object.getOwnPropertyDescriptor(
                        window.HTMLTextAreaElement.prototype, 'value'
                    )?.set || Object.getOwnPropertyDescriptor(
                        window.HTMLInputElement.prototype, 'value'
                    )?.set;
                    if (setter) setter.call(el, text);
                    else el.value = text;
                } else {
                    el.innerHTML = '';
                    text.split('\n').forEach((line, i) => {
                        if (i > 0) el.appendChild(document.createElement('br'));
                        el.appendChild(document.createTextNode(line));
                    });
                    const sel = window.getSelection();
                    const range = document.createRange();
                    range.selectNodeContents(el);
                    range.collapse(false);
                    sel.removeAllRanges();
                    sel.addRange(range);
                }
                // Fire events
                ['input', 'change'].forEach(t => {
                    el.dispatchEvent(new Event(t, { bubbles: true, cancelable: true }));
                });
                ['keydown', 'keyup'].forEach(t => {
                    el.dispatchEvent(new KeyboardEvent(t, { bubbles: true, cancelable: true }));
                });
                // React compat
                const rk = Object.keys(el).find(k => k.startsWith('__reactProps'));
                if (rk && el[rk]?.onChange) el[rk].onChange({ target: el });

                if (autoSubmit) {
                    await new Promise(r => setTimeout(r, 150));
                    el.dispatchEvent(new KeyboardEvent('keydown', {
                        key: 'Enter', code: 'Enter', keyCode: 13, which: 13,
                        bubbles: true, cancelable: true
                    }));
                    el.dispatchEvent(new KeyboardEvent('keyup', {
                        key: 'Enter', code: 'Enter', keyCode: 13, which: 13,
                        bubbles: true, cancelable: true
                    }));
                    // Try form submit
                    const form = el.closest('form');
                    if (form) {
                        const btn = form.querySelector('button[type="submit"], input[type="submit"]');
                        if (btn) btn.click();
                    }
                    // Common send buttons
                    const parent = el.closest('[class*="composer"], [class*="input"], [class*="chat"], [class*="message"]');
                    if (parent) {
                        const sendBtn = parent.querySelector('button[data-testid*="send"], button[aria-label*="Send"], button[aria-label*="send"]');
                        if (sendBtn) setTimeout(() => sendBtn.click(), 100);
                    }
                }
                return { success: true, method: 'injection' };
            } catch (err) {
                return this._clipboardFallback(text);
            }
        },

        async _clipboardFallback(text) {
            try {
                await navigator.clipboard.writeText(text);
                return { success: true, method: 'clipboard' };
            } catch (e) {
                try {
                    const ta = document.createElement('textarea');
                    ta.value = text;
                    ta.style.cssText = 'position:fixed;left:-9999px;top:-9999px;opacity:0;';
                    document.body.appendChild(ta);
                    ta.select();
                    document.execCommand('copy');
                    document.body.removeChild(ta);
                    return { success: true, method: 'clipboard-legacy' };
                } catch (e2) {
                    return { success: false, method: 'none', error: 'Failed to inject or copy.' };
                }
            }
        }
    };

    // ─── Create Shadow DOM Host ─────────────────────────────────────────────
    const host = document.createElement('div');
    host.id = 'promptlayer-host';
    host.style.cssText = 'all:initial;position:fixed;z-index:2147483646;top:0;left:0;width:0;height:0;';
    document.body.appendChild(host);

    const shadow = host.attachShadow({ mode: 'closed' });

    // ─── Load Styles ────────────────────────────────────────────────────────
    const styleEl = document.createElement('style');
    const _cssReady = fetch(chrome.runtime.getURL('overlay.css'))
        .then(r => r.text())
        .then(css => {
            styleEl.textContent = css;
        })
        .catch(() => {
            styleEl.textContent = `
        .pl-fab { position:fixed;bottom:24px;right:24px;width:40px;height:40px;border-radius:50%;
          background:#111827;border:1px solid #1F2937;cursor:grab;
          z-index:2147483646;display:flex;align-items:center;justify-content:center;
          box-shadow:0 2px 8px rgba(0,0,0,0.3); }
        .pl-fab svg { width:18px;height:18px;fill:none;stroke:#94A3B8;stroke-width:1.5; }
      `;
        });
    shadow.appendChild(styleEl);

    // ─── Google Fonts ───────────────────────────────────────────────────────
    const fontLink = document.createElement('link');
    fontLink.rel = 'stylesheet';
    fontLink.href = 'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap';
    shadow.appendChild(fontLink);

    // ─── Build HTML ─────────────────────────────────────────────────────────
    const container = document.createElement('div');
    container.innerHTML = `
    <!-- FAB -->
    <button class="pl-fab" id="pl-fab" title="PromptLayer">
      ${ICONS.layers}
    </button>

    <!-- Toast -->
    <div class="pl-toast" id="pl-toast">
      <span class="pl-toast-icon" id="pl-toast-icon"></span>
      <span id="pl-toast-text"></span>
    </div>

    <!-- Side Panel -->
    <div class="pl-panel" id="pl-panel">
        
        <!-- Header -->
        <div class="pl-header">
          <div class="pl-logo">
            <div class="pl-logo-icon">${ICONS.layers}</div>
            <div class="pl-logo-text">Prompt<span>Layer</span></div>
          </div>
          <div class="pl-header-actions">
            <button class="pl-icon-btn" id="pl-btn-settings" title="Settings">
              ${ICONS.settings}
            </button>
            <button class="pl-icon-btn" id="pl-btn-close" title="Close">
              ${ICONS.close}
            </button>
          </div>
        </div>

        <!-- Body -->
        <div class="pl-body">
          <!-- Main View -->
          <div class="pl-main-view" id="pl-main-view">
            <div>
              <div class="pl-label"><span class="pl-label-dot"></span> Raw Input</div>
              <textarea class="pl-textarea" id="pl-input" 
                placeholder="Paste your raw prompt here..." 
                spellcheck="false"></textarea>
            </div>
            <div class="pl-actions">
              <button class="pl-btn pl-btn-primary" id="pl-btn-optimize">
                ${ICONS.sparkle} <span>Optimize</span>
              </button>
            </div>
            <div>
              <div class="pl-label"><span class="pl-label-dot"></span> Optimized Prompt</div>
              <div class="pl-output-wrap">
                <div class="pl-output" id="pl-output">
                  <span class="pl-output-placeholder">Your optimized prompt will appear here...</span>
                </div>
                <button class="pl-copy-btn" id="pl-btn-copy" title="Copy to clipboard">
                  ${ICONS.copy}
                </button>
              </div>
            </div>
            <div class="pl-actions">
              <button class="pl-btn pl-btn-secondary" id="pl-btn-inject" disabled>
                ${ICONS.inject} <span>Inject into Textbox</span>
              </button>
            </div>
            <div class="pl-toggles">
              <div class="pl-toggle-item">
                <label class="pl-toggle">
                  <input type="checkbox" id="pl-toggle-autoinject">
                  <span class="pl-toggle-track"></span>
                </label>
                <span class="pl-toggle-label">Auto Inject</span>
              </div>
              <div class="pl-toggle-item">
                <label class="pl-toggle">
                  <input type="checkbox" id="pl-toggle-autosubmit">
                  <span class="pl-toggle-track"></span>
                </label>
                <span class="pl-toggle-label">Auto Submit</span>
              </div>
            </div>
            <div class="pl-toggles">
              <div class="pl-toggle-item">
                <label class="pl-toggle">
                  <input type="checkbox" id="pl-toggle-autoenhance">
                  <span class="pl-toggle-track"></span>
                </label>
                <span class="pl-toggle-label">Auto Enhance</span>
              </div>
            </div>
          </div>

          <!-- Settings View -->
          <div class="pl-settings" id="pl-settings">
            <div style="display:flex;align-items:center;gap:10px;margin-bottom:4px;">
              <button class="pl-icon-btn" id="pl-btn-back" title="Back">
                ${ICONS.arrowLeft}
              </button>
              <div class="pl-label" style="margin-bottom:0;">API Configuration</div>
            </div>
            <div class="pl-settings-row">
              <div class="pl-label"><span class="pl-label-dot"></span> Provider</div>
              <select class="pl-select" id="pl-provider">
                <option value="openai">OpenAI</option>
                <option value="gemini">Google Gemini</option>
                <option value="groq">Groq</option>
                <option value="openrouter">OpenRouter</option>
                <option value="custom">Custom / Self-Hosted</option>
              </select>
            </div>
            <div class="pl-settings-row">
              <div class="pl-label"><span class="pl-label-dot"></span> API Key</div>
              <input type="password" class="pl-input" id="pl-api-key" placeholder="sk-..." autocomplete="off">
            </div>
            <div class="pl-settings-row">
              <div class="pl-label"><span class="pl-label-dot"></span> API Base URL</div>
              <input type="text" class="pl-input" id="pl-api-base" placeholder="https://api.openai.com/v1" autocomplete="off">
            </div>
            <div class="pl-settings-row">
              <div class="pl-label"><span class="pl-label-dot"></span> Model</div>
              <select class="pl-select" id="pl-model">
                <optgroup label="── OpenAI ──">
                  <option value="gpt-4o-mini">GPT-4o Mini (Fast & Cheap)</option>
                  <option value="gpt-4o">GPT-4o</option>
                  <option value="gpt-4.1-mini">GPT-4.1 Mini</option>
                  <option value="gpt-4.1">GPT-4.1</option>
                  <option value="gpt-4-turbo">GPT-4 Turbo</option>
                  <option value="o4-mini">o4-mini (Reasoning)</option>
                </optgroup>
                <optgroup label="── Google Gemini ──">
                  <option value="gemini-2.5-flash">Gemini 2.5 Flash</option>
                  <option value="gemini-2.5-pro">Gemini 2.5 Pro</option>
                  <option value="gemini-2.0-flash">Gemini 2.0 Flash</option>
                  <option value="gemini-2.0-flash-lite">Gemini 2.0 Flash Lite</option>
                </optgroup>
                <optgroup label="── Groq ──">
                  <option value="llama-3.3-70b-versatile">Llama 3.3 70B Versatile</option>
                  <option value="llama-3.1-8b-instant">Llama 3.1 8B Instant</option>
                  <option value="llama-3.1-70b-versatile">Llama 3.1 70B Versatile</option>
                  <option value="mixtral-8x7b-32768">Mixtral 8x7B</option>
                  <option value="gemma2-9b-it">Gemma 2 9B</option>
                  <option value="deepseek-r1-distill-llama-70b">DeepSeek R1 Distill 70B</option>
                </optgroup>
                <optgroup label="── OpenRouter ──">
                  <option value="anthropic/claude-3.5-sonnet">Claude 3.5 Sonnet</option>
                  <option value="anthropic/claude-3-haiku">Claude 3 Haiku</option>
                  <option value="google/gemini-2.5-flash-preview">Gemini 2.5 Flash (OR)</option>
                  <option value="deepseek/deepseek-chat-v3">DeepSeek V3</option>
                  <option value="meta-llama/llama-3.3-70b-instruct">Llama 3.3 70B (OR)</option>
                  <option value="mistralai/mistral-large-latest">Mistral Large</option>
                </optgroup>
                <optgroup label="── Custom ──">
                  <option value="custom">Custom Model...</option>
                </optgroup>
              </select>
            </div>
            <div class="pl-settings-row" id="pl-custom-model-row" style="display:none;">
              <div class="pl-label"><span class="pl-label-dot"></span> Custom Model Name</div>
              <input type="text" class="pl-input" id="pl-custom-model" 
                placeholder="e.g. deepseek-chat, claude-3-haiku..." autocomplete="off">
            </div>
            <div class="pl-settings-footer">
              <button class="pl-btn pl-btn-primary" id="pl-btn-save" style="flex:1;">
                ${ICONS.save} <span>Save Settings</span>
              </button>
            </div>
          </div>
        </div>

        <!-- Status Bar -->
        <div class="pl-status">
          <span class="pl-status-dot ready" id="pl-status-dot"></span>
          <span class="pl-status-text" id="pl-status-text">Ready</span>
        </div>

    </div>
  `;

    shadow.appendChild(container);

    // ─── Element References ─────────────────────────────────────────────────
    const $ = (id) => shadow.getElementById(id);

    const fab = $('pl-fab');
    const panel = $('pl-panel');
    const mainView = $('pl-main-view');
    const settingsView = $('pl-settings');
    const input = $('pl-input');
    const output = $('pl-output');
    const btnOptimize = $('pl-btn-optimize');
    const btnInject = $('pl-btn-inject');
    const btnCopy = $('pl-btn-copy');
    const btnSettings = $('pl-btn-settings');
    const btnClose = $('pl-btn-close');
    const btnBack = $('pl-btn-back');
    const btnSave = $('pl-btn-save');
    const providerSelect = $('pl-provider');
    const apiKeyInput = $('pl-api-key');
    const apiBaseInput = $('pl-api-base');
    const modelSelect = $('pl-model');
    const customModelRow = $('pl-custom-model-row');
    const customModelInput = $('pl-custom-model');
    const toggleAutoInject = $('pl-toggle-autoinject');
    const toggleAutoSubmit = $('pl-toggle-autosubmit');
    const toggleAutoEnhance = $('pl-toggle-autoenhance');
    const statusDot = $('pl-status-dot');
    const statusText = $('pl-status-text');
    const toast = $('pl-toast');
    const toastIcon = $('pl-toast-icon');
    const toastText = $('pl-toast-text');

    // ─── State ──────────────────────────────────────────────────────────────
    let optimizedPrompt = '';
    let isProcessing = false;
    let panelOpen = false;

    // ─── FAB Click → Toggle Panel ──────────────────────────────────────────
    fab.addEventListener('click', () => {
        Injector.captureActiveElement();
        togglePanel(!panelOpen);
    });

    // ─── Panel Toggle ──────────────────────────────────────────────────────
    function togglePanel(show) {
        panelOpen = show;
        if (show) {
            panel.classList.add('active');
            fab.classList.add('hidden');
            setTimeout(() => input.focus(), 200);
        } else {
            panel.classList.remove('active');
            fab.classList.remove('hidden');
            showMainView();
        }
    }

    btnClose.addEventListener('click', () => togglePanel(false));

    // ─── Escape key ─────────────────────────────────────────────────────────
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && panelOpen) {
            togglePanel(false);
        }
    });

    // ─── Settings Navigation ───────────────────────────────────────────────
    function showSettings() {
        mainView.classList.add('hidden');
        settingsView.classList.add('active');
        loadSettings();
    }

    function showMainView() {
        settingsView.classList.remove('active');
        mainView.classList.remove('hidden');
    }

    btnSettings.addEventListener('click', showSettings);
    btnBack.addEventListener('click', showMainView);

    // ─── Provider Presets ─────────────────────────────────────────────────
    const PROVIDER_CONFIG = {
        openai: { base: 'https://api.openai.com/v1', placeholder: 'sk-...' },
        gemini: { base: 'https://generativelanguage.googleapis.com/v1beta/openai', placeholder: 'AIza...' },
        groq: { base: 'https://api.groq.com/openai/v1', placeholder: 'gsk_...' },
        openrouter: { base: 'https://openrouter.ai/api/v1', placeholder: 'sk-or-...' },
        custom: { base: '', placeholder: 'Your API key...' }
    };

    providerSelect.addEventListener('change', () => {
        const cfg = PROVIDER_CONFIG[providerSelect.value];
        if (cfg) {
            apiBaseInput.value = cfg.base;
            apiKeyInput.placeholder = cfg.placeholder;
        }
    });

    // ─── Model Select ──────────────────────────────────────────────────────
    modelSelect.addEventListener('change', () => {
        customModelRow.style.display = modelSelect.value === 'custom' ? 'flex' : 'none';
    });

    // ─── Load / Save Settings ──────────────────────────────────────────────
    function loadSettings() {
        chrome.storage.local.get([
            'promptlayer_provider',
            'promptlayer_api_key',
            'promptlayer_api_base',
            'promptlayer_model',
            'promptlayer_custom_model',
            'promptlayer_auto_inject',
            'promptlayer_auto_submit',
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
                customModelRow.style.display = 'none';
            } else {
                modelSelect.value = 'custom';
                customModelInput.value = model;
                customModelRow.style.display = 'flex';
            }

            toggleAutoInject.checked = result.promptlayer_auto_inject || false;
            toggleAutoSubmit.checked = result.promptlayer_auto_submit || false;
            toggleAutoEnhance.checked = result.promptlayer_auto_enhance || false;
        });
    }

    btnSave.addEventListener('click', () => {
        const apiKey = apiKeyInput.value.trim();
        const apiBase = apiBaseInput.value.trim() || 'https://api.openai.com/v1';
        let model = modelSelect.value;
        if (model === 'custom') {
            model = customModelInput.value.trim() || 'gpt-4o-mini';
        }

        if (!apiKey) {
            showToast('Please enter your API key.', 'error');
            return;
        }

        chrome.storage.local.set({
            promptlayer_provider: providerSelect.value,
            promptlayer_api_key: apiKey,
            promptlayer_api_base: apiBase,
            promptlayer_model: model,
            promptlayer_auto_inject: toggleAutoInject.checked,
            promptlayer_auto_submit: toggleAutoSubmit.checked,
            promptlayer_auto_enhance: toggleAutoEnhance.checked
        }, () => {
            showToast('Settings saved ✓', 'success');
            showMainView();
        });
    });

    // ─── Load toggle state on init ─────────────────────────────────────────
    chrome.storage.local.get(['promptlayer_auto_inject', 'promptlayer_auto_submit'], (result) => {
        toggleAutoInject.checked = result.promptlayer_auto_inject || false;
        toggleAutoSubmit.checked = result.promptlayer_auto_submit || false;
    });

    // ─── Toggle change persistence ─────────────────────────────────────────
    toggleAutoInject.addEventListener('change', () => {
        chrome.storage.local.set({ promptlayer_auto_inject: toggleAutoInject.checked });
    });

    toggleAutoSubmit.addEventListener('change', () => {
        chrome.storage.local.set({ promptlayer_auto_submit: toggleAutoSubmit.checked });
    });

    // ─── Optimize Button ───────────────────────────────────────────────────
    btnOptimize.addEventListener('click', async () => {
        if (isProcessing) return;

        const rawText = input.value.trim();
        if (!rawText) {
            showToast('Enter some text to optimize.', 'error');
            return;
        }

        setProcessing(true);
        setStatus('working', 'Optimizing your prompt...');

        try {
            const response = await chrome.runtime.sendMessage({
                type: 'OPTIMIZE_PROMPT',
                payload: { rawPrompt: rawText }
            });

            if (response.success) {
                optimizedPrompt = response.data;
                output.textContent = optimizedPrompt;
                output.querySelector('.pl-output-placeholder')?.remove();
                btnInject.disabled = false;
                setStatus('ready', 'Prompt optimized ✓');
                showToast('Prompt optimized!', 'success');

                // Auto-inject if enabled
                if (toggleAutoInject.checked) {
                    await handleInject();
                }
            } else {
                setStatus('error', response.error || 'Optimization failed');
                showToast(response.error || 'Optimization failed.', 'error');
            }
        } catch (err) {
            setStatus('error', 'Connection error');
            showToast('Failed to reach background script.', 'error');
        }

        setProcessing(false);
    });

    // ─── Inject Button ─────────────────────────────────────────────────────
    btnInject.addEventListener('click', handleInject);

    async function handleInject() {
        if (!optimizedPrompt) {
            showToast('Nothing to inject. Optimize first.', 'error');
            return;
        }

        togglePanel(false);

        // Small delay to let panel close and focus return
        await new Promise(r => setTimeout(r, 200));

        const result = await Injector.inject(optimizedPrompt, toggleAutoSubmit.checked);

        if (result.success) {
            if (result.method === 'injection') {
                showToast('Prompt injected ✓', 'success');
            } else {
                showToast('Copied to clipboard (paste with Ctrl+V)', 'success');
            }
        } else {
            showToast(result.error || 'Injection failed.', 'error');
        }
    }

    // ─── Copy Button ───────────────────────────────────────────────────────
    btnCopy.addEventListener('click', async () => {
        if (!optimizedPrompt) return;
        try {
            await navigator.clipboard.writeText(optimizedPrompt);
            btnCopy.innerHTML = ICONS.check;
            showToast('Copied to clipboard ✓', 'success');
            setTimeout(() => { btnCopy.innerHTML = ICONS.copy; }, 2000);
        } catch (e) {
            showToast('Failed to copy.', 'error');
        }
    });

    // ─── Ctrl+Enter shortcut ───────────────────────────────────────────────
    input.addEventListener('keydown', (e) => {
        if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
            e.preventDefault();
            btnOptimize.click();
        }
    });

    // ─── Status Helpers ─────────────────────────────────────────────────────
    function setStatus(type, text) {
        statusDot.className = `pl-status-dot ${type}`;
        statusText.textContent = text;
    }

    function setProcessing(active) {
        isProcessing = active;
        btnOptimize.disabled = active;
        if (active) {
            btnOptimize.innerHTML = `<span class="pl-spinner"></span> <span>Optimizing...</span>`;
        } else {
            btnOptimize.innerHTML = `${ICONS.sparkle} <span>Optimize</span>`;
        }
    }

    // ─── Toast Notification ─────────────────────────────────────────────────
    let toastTimeout;
    function showToast(message, type = 'success') {
        clearTimeout(toastTimeout);
        toastText.textContent = message;
        toastIcon.className = `pl-toast-icon ${type}`;
        toastIcon.innerHTML = type === 'success' ? ICONS.check : ICONS.close;
        toast.classList.add('show');
        toastTimeout = setTimeout(() => {
            toast.classList.remove('show');
        }, 3500);
    }

    // ─── Keyboard Shortcut: Alt+P to toggle panel ────────────────────────
    document.addEventListener('keydown', (e) => {
        if (e.altKey && e.key === 'p') {
            e.preventDefault();
            if (panelOpen) {
                togglePanel(false);
            } else {
                Injector.captureActiveElement();
                togglePanel(true);
            }
        }
    });

    // ═══════════════════════════════════════════════════════════════════════
    // ─── INLINE INTELLIGENCE ENGINE ─────────────────────────────────────
    // ═══════════════════════════════════════════════════════════════════════
    // Grammarly-style contextual layer. Loaded from inlineEngine.js.
    // No Enter interception. No submit blocking. Embedded in the writing flow.
    // Waits for CSS to load before initializing the inline engine.

    if (typeof window.__PromptLayerInline !== 'undefined' && window.__PromptLayerInline) {
        _cssReady.then(() => {
            window.__PromptLayerInline.init(shadow);
        });
    } else {
        console.warn('[PromptLayer] Inline engine not found. Verify inlineEngine.js loads before content.js in manifest.json.');
    }

    console.log('[PromptLayer] Extension loaded.');
})();

