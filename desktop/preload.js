/**
 * PromptLayer Desktop — Preload Bridge
 *
 * Minimal API surface exposed to the renderer via contextBridge.
 * The renderer never gets direct access to Node.js or Electron APIs.
 */

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('promptlayer', {
    optimize: (rawPrompt, instruction) => ipcRenderer.invoke('optimize', { rawPrompt, instruction }),
    copyText: (text) => ipcRenderer.invoke('copy-text', text),
    insertText: (text) => ipcRenderer.invoke('insert-text', text),
    readClipboard: () => ipcRenderer.invoke('read-clipboard'),
    simulateCopy: () => ipcRenderer.invoke('simulate-copy'),
    getSettings: () => ipcRenderer.invoke('get-settings'),
    saveSettings: (s) => ipcRenderer.invoke('save-settings', s),
    closeWindow: () => ipcRenderer.send('window:close'),
    hide: () => ipcRenderer.send('window:hide'),

    onShown: (cb) => { ipcRenderer.on('window:shown', cb); return () => ipcRenderer.removeListener('window:shown', cb); },
    onHidden: (cb) => { ipcRenderer.on('window:hidden', cb); return () => ipcRenderer.removeListener('window:hidden', cb); },
    onFirstRun: (cb) => { ipcRenderer.on('first-run', cb); return () => ipcRenderer.removeListener('first-run', cb); },
    onNavigateSettings: (cb) => { ipcRenderer.on('navigate:settings', cb); return () => ipcRenderer.removeListener('navigate:settings', cb); },
});
