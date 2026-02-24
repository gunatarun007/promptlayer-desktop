/**
 * PromptLayer — Contextual Inline Intelligence Engine
 *
 * Grammarly-style floating assistant with dynamic suggestion chips.
 * Detects active textboxes, analyzes text, shows contextual actions,
 * and delivers optimized prompts inline.
 *
 * Architecture:
 * - MutationObserver scans for textboxes (debounced 300ms)
 * - Focus/input listeners drive chip bar visibility
 * - Position tracks via requestAnimationFrame
 * - Zero submission interception. Zero Enter override.
 * - Communicates with background.js for optimization
 *
 * Exposed as window.__PromptLayerInline for content.js to init.
 */

window.__PromptLayerInline = (() => {
    'use strict';

    // ═══════════════════════════════════════════════════════════════════════
    // ─── STATE ──────────────────────────────────────────────────────────
    // ═══════════════════════════════════════════════════════════════════════

    let _shadow = null;
    let _activeEl = null;
    let _barEl = null;        // chip bar container
    let _previewEl = null;    // result preview bubble
    let _toastEl = null;
    let _posRAF = null;
    let _enhancing = false;
    let _lastOptimized = '';
    const _attached = new WeakSet();

    // ═══════════════════════════════════════════════════════════════════════
    // ─── SELECTORS ──────────────────────────────────────────────────────
    // ═══════════════════════════════════════════════════════════════════════

    const INPUT_SELECTORS = [
        '#prompt-textarea',
        'div[contenteditable="true"][data-placeholder]',
        'div.ProseMirror[contenteditable="true"]',
        '[role="textbox"]',
        'div[contenteditable="true"]',
        'textarea',
        'div[aria-label*="compose" i]',
        'div[g_editable="true"]',
    ];

    // ═══════════════════════════════════════════════════════════════════════
    // ─── SVG ICONS ──────────────────────────────────────────────────────
    // ═══════════════════════════════════════════════════════════════════════

    const SVG = {
        sparkle: `<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z"/></svg>`,
        inject: `<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14"/><path d="m19 12-7 7-7-7"/></svg>`,
        copy: `<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>`,
        check: `<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`,
        close: `<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>`,
        refresh: `<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M8 16H3v5"/></svg>`,
    };

    // ═══════════════════════════════════════════════════════════════════════
    // ─── TEXT UTILITIES ─────────────────────────────────────────────────
    // ═══════════════════════════════════════════════════════════════════════

    function getText(el) {
        if (!el) return '';
        if (el.tagName === 'TEXTAREA' || el.tagName === 'INPUT') return el.value;
        return el.innerText || el.textContent || '';
    }

    function setText(el, text) {
        if (!el) return;
        el.focus();

        if (el.tagName === 'TEXTAREA' || el.tagName === 'INPUT') {
            const nativeSetter =
                Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value')?.set ||
                Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
            if (nativeSetter) nativeSetter.call(el, text);
            else el.value = text;
        } else {
            el.innerHTML = '';
            const lines = text.split('\n');
            lines.forEach((line, i) => {
                if (el.closest('.ProseMirror')) {
                    const p = document.createElement('p');
                    p.textContent = line || '\u200B';
                    el.appendChild(p);
                } else {
                    if (i > 0) el.appendChild(document.createElement('br'));
                    el.appendChild(document.createTextNode(line));
                }
            });
            const sel = window.getSelection();
            const range = document.createRange();
            range.selectNodeContents(el);
            range.collapse(false);
            sel.removeAllRanges();
            sel.addRange(range);
        }

        el.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
        el.dispatchEvent(new Event('change', { bubbles: true, cancelable: true }));
        el.dispatchEvent(new InputEvent('input', {
            bubbles: true, cancelable: true,
            inputType: 'insertText', data: text,
        }));

        const rk = Object.keys(el).find(k => k.startsWith('__reactProps'));
        if (rk && el[rk]?.onChange) {
            try { el[rk].onChange({ target: el }); } catch (_) { }
        }
    }

    function escapeHtml(str) {
        const d = document.createElement('div');
        d.textContent = str;
        return d.innerHTML.replace(/\n/g, '<br>');
    }

    // ═══════════════════════════════════════════════════════════════════════
    // ─── CHIP ANALYSIS ENGINE ───────────────────────────────────────────
    // ═══════════════════════════════════════════════════════════════════════

    const CODE_KEYWORDS = /\b(function|const|let|var|if|else|return|class|import|export|async|await|def|for|while|try|catch|console|print|int|string|boolean)\b/i;
    const QUESTION_PATTERN = /\?|^(how|what|why|when|where|who|which|can|could|would|should|is|are|do|does|will|explain|describe|tell|show)\b/i;
    const HAS_PUNCTUATION = /[.!;:,]$/;

    function analyzeText(text) {
        const chips = [];
        const trimmed = text.trim();
        const len = trimmed.length;

        if (len < 30) {
            chips.push({ label: 'Expand', instruction: 'expand', icon: '↗' });
        }

        if (!HAS_PUNCTUATION.test(trimmed)) {
            chips.push({ label: 'Improve clarity', instruction: 'clarify', icon: '✦' });
        }

        if (QUESTION_PATTERN.test(trimmed)) {
            chips.push({ label: 'Make advanced', instruction: 'advance', icon: '◆' });
        }

        if (CODE_KEYWORDS.test(trimmed)) {
            chips.push({ label: 'Add edge cases', instruction: 'edge_cases', icon: '⚡' });
        }

        // Always show generic enhance
        chips.push({ label: 'Enhance', instruction: 'enhance', icon: '✧' });

        // Cap at 4 chips max
        return chips.slice(0, 4);
    }

    // ═══════════════════════════════════════════════════════════════════════
    // ─── CHIP BAR ───────────────────────────────────────────────────────
    // ═══════════════════════════════════════════════════════════════════════

    function createBar() {
        if (_barEl) return;
        const el = document.createElement('div');
        el.className = 'pli-bar';
        el.innerHTML = `<div class="pli-bar-chips" id="pli-chips"></div>`;
        _shadow.appendChild(el);
        _barEl = el;

        // Prevent blur on the host textbox when clicking chips
        el.addEventListener('mousedown', (e) => {
            e.preventDefault();
        });
    }

    function updateChips(text) {
        if (!_barEl) createBar();
        const chips = analyzeText(text);
        const container = _barEl.querySelector('#pli-chips');

        container.innerHTML = chips.map(c =>
            `<button class="pli-chip" data-instruction="${c.instruction}" title="${c.label}">
                <span class="pli-chip-icon">${c.icon}</span>
                <span class="pli-chip-label">${c.label}</span>
            </button>`
        ).join('');

        // Attach click handlers
        container.querySelectorAll('.pli-chip').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                const instruction = btn.dataset.instruction;
                handleChipClick(instruction);
            });
        });
    }

    function showBar(rect) {
        if (!_barEl) createBar();

        const barWidth = 320;
        let left = rect.left;
        let top = rect.bottom + 6;

        // Viewport bounds
        const vw = window.innerWidth;
        const vh = window.innerHeight;
        if (left + barWidth > vw - 8) left = vw - barWidth - 8;
        if (left < 8) left = 8;
        if (top + 40 > vh) top = rect.top - 44;

        _barEl.style.top = top + 'px';
        _barEl.style.left = left + 'px';
        _barEl.classList.add('visible');
    }

    function hideBar() {
        if (_barEl) _barEl.classList.remove('visible');
    }

    // ═══════════════════════════════════════════════════════════════════════
    // ─── PREVIEW BUBBLE ─────────────────────────────────────────────────
    // ═══════════════════════════════════════════════════════════════════════

    function createPreview() {
        if (_previewEl) return;
        const el = document.createElement('div');
        el.className = 'pli-preview';
        el.innerHTML = `
            <div class="pli-preview-header">
                <span class="pli-preview-title">${SVG.sparkle} Enhanced</span>
                <button class="pli-preview-close" id="pli-pclose">${SVG.close}</button>
            </div>
            <div class="pli-preview-body" id="pli-pbody">
                <div class="pli-preview-placeholder">Processing…</div>
            </div>
            <div class="pli-preview-actions" id="pli-pactions" style="display:none;">
                <button class="pli-btn pli-btn-primary" id="pli-insert">
                    ${SVG.inject} Insert
                </button>
                <button class="pli-btn pli-btn-secondary" id="pli-copy">
                    ${SVG.copy} Copy
                </button>
                <button class="pli-btn pli-btn-secondary" id="pli-again">
                    ${SVG.refresh} Improve
                </button>
            </div>
        `;
        _shadow.appendChild(el);
        _previewEl = el;

        // Close
        _previewEl.querySelector('#pli-pclose').addEventListener('click', (e) => {
            e.stopPropagation();
            closePreview();
        });

        // Insert
        _previewEl.querySelector('#pli-insert').addEventListener('click', (e) => {
            e.stopPropagation();
            if (_lastOptimized && _activeEl) {
                setText(_activeEl, _lastOptimized);
                closePreview();
                showToast('Inserted ✓');
            }
        });

        // Copy
        _previewEl.querySelector('#pli-copy').addEventListener('click', async (e) => {
            e.stopPropagation();
            if (!_lastOptimized) return;
            try {
                await navigator.clipboard.writeText(_lastOptimized);
                const btn = _previewEl.querySelector('#pli-copy');
                btn.innerHTML = `${SVG.check} Copied`;
                setTimeout(() => { btn.innerHTML = `${SVG.copy} Copy`; }, 1500);
            } catch (_) { }
        });

        // Improve Again
        _previewEl.querySelector('#pli-again').addEventListener('click', (e) => {
            e.stopPropagation();
            if (_lastOptimized) runOptimization(_lastOptimized, 'enhance');
        });

        // Prevent blur
        el.addEventListener('mousedown', (e) => e.preventDefault());
    }

    function showPreview() {
        if (!_previewEl) createPreview();
        if (!_activeEl) return;

        const rect = _activeEl.getBoundingClientRect();
        const previewWidth = 340;
        let left = rect.left;
        let top = rect.bottom + 48;

        const vw = window.innerWidth;
        const vh = window.innerHeight;
        if (left + previewWidth > vw - 8) left = vw - previewWidth - 8;
        if (left < 8) left = 8;
        if (top + 200 > vh) top = rect.top - 260;

        _previewEl.style.top = top + 'px';
        _previewEl.style.left = left + 'px';
        _previewEl.classList.add('visible');
    }

    function closePreview() {
        if (_previewEl) _previewEl.classList.remove('visible');
    }

    function isPreviewVisible() {
        return _previewEl && _previewEl.classList.contains('visible');
    }

    // ═══════════════════════════════════════════════════════════════════════
    // ─── TOAST ──────────────────────────────────────────────────────────
    // ═══════════════════════════════════════════════════════════════════════

    let _toastTimer = null;
    function showToast(msg) {
        if (!_toastEl) {
            _toastEl = document.createElement('div');
            _toastEl.className = 'pli-toast';
            _shadow.appendChild(_toastEl);
        }
        clearTimeout(_toastTimer);
        _toastEl.textContent = msg;
        _toastEl.classList.add('visible');
        _toastTimer = setTimeout(() => _toastEl.classList.remove('visible'), 2500);
    }

    // ═══════════════════════════════════════════════════════════════════════
    // ─── OPTIMIZATION ───────────────────────────────────────────────────
    // ═══════════════════════════════════════════════════════════════════════

    // Chip instruction keys — the actual instruction text lives in background.js
    // (single source of truth). We only send the key.
    const VALID_INSTRUCTIONS = ['expand', 'clarify', 'advance', 'edge_cases', 'enhance'];

    function handleChipClick(instruction) {
        if (!_activeEl || _enhancing) return;
        const raw = getText(_activeEl).trim();
        if (raw.length < 8) return;
        showPreview();
        runOptimization(raw, instruction);
    }

    async function runOptimization(text, instruction = 'enhance') {
        if (_enhancing) return;
        _enhancing = true;

        if (!_previewEl) createPreview();
        const body = _previewEl.querySelector('#pli-pbody');
        const actions = _previewEl.querySelector('#pli-pactions');

        body.innerHTML = `
            <div class="pli-loading">
                <div class="pli-spinner"></div>
                <span>Enhancing…</span>
            </div>
        `;
        actions.style.display = 'none';

        try {
            // Use the exact same message format as the side panel.
            // background.js reads payload.rawPrompt + payload.instruction
            const result = await new Promise((resolve, reject) => {
                chrome.runtime.sendMessage(
                    {
                        type: 'OPTIMIZE_PROMPT',
                        payload: {
                            rawPrompt: text,
                            instruction: VALID_INSTRUCTIONS.includes(instruction) ? instruction : 'enhance'
                        }
                    },
                    (response) => {
                        if (chrome.runtime.lastError) reject(chrome.runtime.lastError);
                        else resolve(response);
                    }
                );
            });

            // background.js returns { success: true, data: "..." }
            if (result && result.success && result.data) {
                _lastOptimized = result.data;
                body.innerHTML = `<div class="pli-result">${escapeHtml(result.data)}</div>`;
                actions.style.display = 'flex';
            } else {
                const errMsg = result?.error || 'Optimization failed. Check API key in settings.';
                body.innerHTML = `<div class="pli-error">${escapeHtml(errMsg)}</div>`;
                actions.style.display = 'none';
            }
        } catch (err) {
            body.innerHTML = `<div class="pli-error">Connection error. Please try again.</div>`;
            actions.style.display = 'none';
        }

        _enhancing = false;
    }

    // ═══════════════════════════════════════════════════════════════════════
    // ─── POSITION TRACKING ──────────────────────────────────────────────
    // ═══════════════════════════════════════════════════════════════════════

    function startTracking() {
        stopTracking();
        let lastText = '';
        function tick() {
            if (_activeEl && document.body.contains(_activeEl)) {
                const rect = _activeEl.getBoundingClientRect();
                const text = getText(_activeEl).trim();

                if (text.length >= 8 && rect.width > 0 && rect.height > 0) {
                    // Update chips only when text changes
                    if (text !== lastText) {
                        lastText = text;
                        updateChips(text);
                    }
                    showBar(rect);
                } else {
                    hideBar();
                    lastText = '';
                }
            } else {
                hideBar();
                _activeEl = null;
                lastText = '';
            }
            _posRAF = requestAnimationFrame(tick);
        }
        _posRAF = requestAnimationFrame(tick);
    }

    function stopTracking() {
        if (_posRAF) {
            cancelAnimationFrame(_posRAF);
            _posRAF = null;
        }
    }

    // ═══════════════════════════════════════════════════════════════════════
    // ─── TEXTBOX ATTACHMENT ─────────────────────────────────────────────
    // ═══════════════════════════════════════════════════════════════════════

    function attach(el) {
        if (_attached.has(el)) return;
        _attached.add(el);

        el.addEventListener('focus', () => {
            _activeEl = el;
            startTracking();
        }, true);

        el.addEventListener('blur', () => {
            setTimeout(() => {
                // Check if focus moved to our UI elements
                if (_barEl && _barEl.matches(':hover')) return;
                if (_previewEl && _previewEl.matches(':hover')) return;
                if (isPreviewVisible()) return;

                if (_activeEl === el) {
                    _activeEl = null;
                    hideBar();
                    stopTracking();
                }
            }, 200);
        }, true);
    }

    // ═══════════════════════════════════════════════════════════════════════
    // ─── DOM SCANNING ───────────────────────────────────────────────────
    // ═══════════════════════════════════════════════════════════════════════

    function scan() {
        for (const sel of INPUT_SELECTORS) {
            try {
                document.querySelectorAll(sel).forEach(el => {
                    if (el.closest('#promptlayer-host')) return;
                    if (el.offsetWidth < 50 || el.offsetHeight < 20) return;
                    attach(el);
                });
            } catch (_) { }
        }
    }

    let _scanTimer = null;
    const observer = new MutationObserver(() => {
        if (_scanTimer) clearTimeout(_scanTimer);
        _scanTimer = setTimeout(scan, 300);
    });

    // ═══════════════════════════════════════════════════════════════════════
    // ─── GLOBAL LISTENERS ───────────────────────────────────────────────
    // ═══════════════════════════════════════════════════════════════════════

    function setupGlobalListeners() {
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                if (isPreviewVisible()) closePreview();
                else { hideBar(); stopTracking(); }
            }
        });

        document.addEventListener('mousedown', (e) => {
            if (!isPreviewVisible()) return;
            const pr = _previewEl?.getBoundingClientRect();
            const br = _barEl?.getBoundingClientRect();
            const x = e.clientX, y = e.clientY;
            if (pr && x >= pr.left && x <= pr.right && y >= pr.top && y <= pr.bottom) return;
            if (br && x >= br.left && x <= br.right && y >= br.top && y <= br.bottom) return;
            closePreview();
        });
    }

    // ═══════════════════════════════════════════════════════════════════════
    // ─── INIT ───────────────────────────────────────────────────────────
    // ═══════════════════════════════════════════════════════════════════════

    function init(shadowRoot) {
        _shadow = shadowRoot;
        scan();
        observer.observe(document.body, { childList: true, subtree: true });
        setupGlobalListeners();
        console.log('[PromptLayer] Inline contextual assistant active.');
    }

    return { init };
})();
