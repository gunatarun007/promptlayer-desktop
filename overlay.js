/**
 * PromptLayer — Overlay Panel Builder
 * 
 * Creates the entire overlay UI as HTML string for Shadow DOM injection.
 * Separated from content.js for maintainability.
 */

const OverlayBuilder = {
    /**
     * SVG icon definitions used throughout the UI
     */
    icons: {
        zap: `<svg viewBox="0 0 24 24"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>`,
        settings: `<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>`,
        close: `<svg viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`,
        send: `<svg viewBox="0 0 24 24"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>`,
        inject: `<svg viewBox="0 0 24 24"><path d="M12 5v14"/><path d="m19 12-7 7-7-7"/></svg>`,
        copy: `<svg viewBox="0 0 24 24"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>`,
        check: `<svg viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>`,
        arrowLeft: `<svg viewBox="0 0 24 24"><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></svg>`,
        save: `<svg viewBox="0 0 24 24"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>`,
        key: `<svg viewBox="0 0 24 24"><path d="m21 2-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0 3 3L22 7l-3-3m-3.5 3.5L19 4"/></svg>`,
    },

    /**
     * Build the FAB button HTML
     */
    buildFAB() {
        return `
      <button class="pl-fab" id="pl-fab" title="PromptLayer — Optimize your prompt">
        ${this.icons.zap}
      </button>
    `;
    },

    /**
     * Build the toast notification
     */
    buildToast() {
        return `<div class="pl-toast" id="pl-toast"><span class="pl-toast-icon" id="pl-toast-icon"></span><span id="pl-toast-text"></span></div>`;
    },

    /**
     * Build the full overlay panel HTML
     */
    buildOverlay() {
        return `
      <div class="pl-overlay" id="pl-overlay">
        <div class="pl-panel">
          
          <!-- Header -->
          <div class="pl-header">
            <div class="pl-logo">
              <div class="pl-logo-icon">${this.icons.zap}</div>
              <div class="pl-logo-text">Prompt<span>Layer</span></div>
            </div>
            <div class="pl-header-actions">
              <button class="pl-icon-btn" id="pl-btn-settings" title="Settings">
                ${this.icons.settings}
              </button>
              <button class="pl-icon-btn" id="pl-btn-close" title="Close">
                ${this.icons.close}
              </button>
            </div>
          </div>

          <!-- Body -->
          <div class="pl-body">

            <!-- Main View -->
            <div class="pl-main-view" id="pl-main-view">
              
              <!-- Raw Input -->
              <div>
                <div class="pl-label"><span class="pl-label-dot"></span> Raw Input</div>
                <textarea 
                  class="pl-textarea" 
                  id="pl-input" 
                  placeholder="Paste your raw prompt here... e.g. 'write me a landing page'"
                  spellcheck="false"
                ></textarea>
              </div>

              <!-- Optimize Button -->
              <div class="pl-actions">
                <button class="pl-btn pl-btn-primary" id="pl-btn-optimize">
                  ${this.icons.zap}
                  <span>Optimize</span>
                </button>
              </div>

              <!-- Output -->
              <div>
                <div class="pl-label"><span class="pl-label-dot"></span> Optimized Prompt</div>
                <div class="pl-output-wrap">
                  <div class="pl-output" id="pl-output">
                    <span class="pl-output-placeholder">Your optimized prompt will appear here...</span>
                  </div>
                  <button class="pl-copy-btn" id="pl-btn-copy" title="Copy to clipboard">
                    ${this.icons.copy}
                  </button>
                </div>
              </div>

              <!-- Inject Button -->
              <div class="pl-actions">
                <button class="pl-btn pl-btn-secondary" id="pl-btn-inject" disabled>
                  ${this.icons.inject}
                  <span>Inject into Textbox</span>
                </button>
              </div>

              <!-- Toggles -->
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

            </div>

            <!-- Settings View -->
            <div class="pl-settings" id="pl-settings">
              <div style="display:flex;align-items:center;gap:10px;margin-bottom:4px;">
                <button class="pl-icon-btn" id="pl-btn-back" title="Back">
                  ${this.icons.arrowLeft}
                </button>
                <div class="pl-label" style="margin-bottom:0;">${this.icons.key} API Configuration</div>
              </div>

              <div class="pl-settings-row">
                <div class="pl-label"><span class="pl-label-dot"></span> OpenAI API Key</div>
                <input 
                  type="password" 
                  class="pl-input" 
                  id="pl-api-key" 
                  placeholder="sk-..."
                  autocomplete="off"
                >
              </div>

              <div class="pl-settings-row">
                <div class="pl-label"><span class="pl-label-dot"></span> API Base URL</div>
                <input 
                  type="text" 
                  class="pl-input" 
                  id="pl-api-base" 
                  placeholder="https://api.openai.com/v1"
                  autocomplete="off"
                >
              </div>

              <div class="pl-settings-row">
                <div class="pl-label"><span class="pl-label-dot"></span> Model</div>
                <select class="pl-select" id="pl-model">
                  <option value="gpt-4o-mini">GPT-4o Mini (Fast & Cheap)</option>
                  <option value="gpt-4o">GPT-4o (Balanced)</option>
                  <option value="gpt-4-turbo">GPT-4 Turbo</option>
                  <option value="gpt-3.5-turbo">GPT-3.5 Turbo</option>
                  <option value="custom">Custom Model...</option>
                </select>
              </div>

              <div class="pl-settings-row" id="pl-custom-model-row" style="display:none;">
                <div class="pl-label"><span class="pl-label-dot"></span> Custom Model Name</div>
                <input 
                  type="text" 
                  class="pl-input" 
                  id="pl-custom-model" 
                  placeholder="e.g. deepseek-chat, claude-3-haiku..."
                  autocomplete="off"
                >
              </div>

              <div class="pl-settings-footer">
                <button class="pl-btn pl-btn-primary" id="pl-btn-save" style="flex:1;">
                  ${this.icons.save}
                  <span>Save Settings</span>
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
      </div>
    `;
    }
};

// Make available
if (typeof window !== 'undefined') {
    window.OverlayBuilder = OverlayBuilder;
}
