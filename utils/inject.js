/**
 * PromptLayer — Injection Utility
 * 
 * Handles injecting optimized prompts into the currently focused textbox.
 * Supports: <textarea>, <input>, contenteditable elements.
 * Includes clipboard fallback and auto-submit via Enter keypress simulation.
 */

const PromptInjector = {
    /** 
     * Store reference to the last focused editable element
     * This is critical because opening the overlay changes focus 
     */
    _lastActiveElement: null,
    _lastActiveFrame: null,

    /**
     * Track the active element before overlay opens
     */
    captureActiveElement() {
        const el = document.activeElement;
        if (this._isEditable(el)) {
            this._lastActiveElement = el;
            this._lastActiveFrame = null;
            return true;
        }

        // Check iframes for active elements
        try {
            const iframes = document.querySelectorAll('iframe');
            for (const iframe of iframes) {
                try {
                    const iframeDoc = iframe.contentDocument || iframe.contentWindow.document;
                    const iframeActive = iframeDoc.activeElement;
                    if (this._isEditable(iframeActive)) {
                        this._lastActiveElement = iframeActive;
                        this._lastActiveFrame = iframe;
                        return true;
                    }
                } catch (e) {
                    // Cross-origin iframe — skip silently
                }
            }
        } catch (e) {
            // Iframe access error — continue
        }

        return false;
    },

    /**
     * Check if an element is an editable text input
     */
    _isEditable(el) {
        if (!el) return false;

        // Standard textarea
        if (el.tagName === 'TEXTAREA') return true;

        // Text-type inputs
        if (el.tagName === 'INPUT') {
            const type = (el.type || '').toLowerCase();
            return ['text', 'search', 'url', 'email', ''].includes(type);
        }

        // ContentEditable (used by ChatGPT, Claude, etc.)
        if (el.isContentEditable) return true;

        // Role-based detection (some apps use custom roles)
        if (el.getAttribute('role') === 'textbox') return true;

        return false;
    },

    /**
     * Inject text into the captured element
     * @returns {{ success: boolean, method: string, error?: string }}
     */
    async inject(text, autoSubmit = false) {
        const el = this._lastActiveElement;

        if (!el || !this._isEditable(el)) {
            // Fallback: copy to clipboard
            return this._clipboardFallback(text);
        }

        try {
            // Focus the element first
            el.focus();

            if (el.tagName === 'TEXTAREA' || el.tagName === 'INPUT') {
                this._injectToInput(el, text);
            } else if (el.isContentEditable || el.getAttribute('role') === 'textbox') {
                this._injectToContentEditable(el, text);
            }

            // Fire synthetic events to notify frameworks (React, Vue, etc.)
            this._dispatchEvents(el);

            // Auto-submit if enabled
            if (autoSubmit) {
                // Small delay to let frameworks process the input event
                await this._delay(150);
                this._simulateSubmit(el);
            }

            return { success: true, method: 'injection' };
        } catch (err) {
            console.warn('[PromptLayer] Direct injection failed, using clipboard:', err);
            return this._clipboardFallback(text);
        }
    },

    /**
     * Inject text into <textarea> or <input>
     */
    _injectToInput(el, text) {
        // Use native setter to bypass React's synthetic event system
        const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
            window.HTMLTextAreaElement.prototype, 'value'
        )?.set || Object.getOwnPropertyDescriptor(
            window.HTMLInputElement.prototype, 'value'
        )?.set;

        if (nativeInputValueSetter) {
            nativeInputValueSetter.call(el, text);
        } else {
            el.value = text;
        }
    },

    /**
     * Inject text into contentEditable elements (ChatGPT, Claude, etc.)
     */
    _injectToContentEditable(el, text) {
        // Clear existing content
        el.innerHTML = '';

        // Create a text node (preserves whitespace and newlines correctly)
        const lines = text.split('\n');
        lines.forEach((line, i) => {
            if (i > 0) el.appendChild(document.createElement('br'));
            el.appendChild(document.createTextNode(line));
        });

        // Move cursor to end
        const selection = window.getSelection();
        const range = document.createRange();
        range.selectNodeContents(el);
        range.collapse(false);
        selection.removeAllRanges();
        selection.addRange(range);
    },

    /**
     * Dispatch events to notify frameworks of the change
     * React, Vue, Angular all listen for different events
     */
    _dispatchEvents(el) {
        const events = ['input', 'change', 'keyup', 'keydown'];
        events.forEach(eventType => {
            // Use Event for 'input' and 'change', KeyboardEvent for 'keyup'/'keydown'
            let event;
            if (eventType === 'keyup' || eventType === 'keydown') {
                event = new KeyboardEvent(eventType, { bubbles: true, cancelable: true });
            } else {
                event = new Event(eventType, { bubbles: true, cancelable: true });
            }
            el.dispatchEvent(event);
        });

        // React-specific: trigger React's onChange handler
        const reactPropsKey = Object.keys(el).find(k => k.startsWith('__reactProps'));
        if (reactPropsKey && el[reactPropsKey]?.onChange) {
            el[reactPropsKey].onChange({ target: el });
        }
    },

    /**
     * Simulate Enter keypress for auto-submit
     */
    _simulateSubmit(el) {
        // Try Enter key
        const enterEvent = new KeyboardEvent('keydown', {
            key: 'Enter',
            code: 'Enter',
            keyCode: 13,
            which: 13,
            bubbles: true,
            cancelable: true
        });
        el.dispatchEvent(enterEvent);

        // Also fire keyup
        const enterUp = new KeyboardEvent('keyup', {
            key: 'Enter',
            code: 'Enter',
            keyCode: 13,
            which: 13,
            bubbles: true,
            cancelable: true
        });
        el.dispatchEvent(enterUp);

        // Fallback: try to find and click a submit button nearby
        const form = el.closest('form');
        if (form) {
            const submitBtn = form.querySelector('button[type="submit"], input[type="submit"]');
            if (submitBtn) submitBtn.click();
        }

        // Also look for common submit button patterns (ChatGPT, Claude, etc.)
        const parent = el.closest('[class*="composer"], [class*="input"], [class*="chat"], [class*="message"]');
        if (parent) {
            const sendBtn = parent.querySelector('button[data-testid*="send"], button[aria-label*="Send"], button[aria-label*="send"]');
            if (sendBtn) {
                setTimeout(() => sendBtn.click(), 100);
            }
        }
    },

    /**
     * Clipboard fallback when direct injection fails
     */
    async _clipboardFallback(text) {
        try {
            await navigator.clipboard.writeText(text);
            return { success: true, method: 'clipboard' };
        } catch (err) {
            // Final fallback using execCommand
            try {
                const textarea = document.createElement('textarea');
                textarea.value = text;
                textarea.style.cssText = 'position:fixed;left:-9999px;top:-9999px;opacity:0;';
                document.body.appendChild(textarea);
                textarea.select();
                document.execCommand('copy');
                document.body.removeChild(textarea);
                return { success: true, method: 'clipboard-legacy' };
            } catch (e) {
                return { success: false, method: 'none', error: 'Could not inject or copy to clipboard.' };
            }
        }
    },

    /**
     * Utility delay
     */
    _delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
};

// Make available to content script
if (typeof window !== 'undefined') {
    window.PromptInjector = PromptInjector;
}
