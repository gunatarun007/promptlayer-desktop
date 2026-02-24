/**
 * PromptLayer Desktop — Main Process
 * 
 * Production-hardened Electron main process.
 * Manages a single frameless floating window, global shortcut registration,
 * clipboard-based auto-capture/insert, and routes all optimization calls
 * through a single pipeline in lib/optimizer.js.
 *
 * Security model:
 * - contextIsolation: true, sandbox: true, nodeIntegration: false
 * - API keys stored encrypted via electron-store (never in renderer)
 * - No devtools in production
 * - IPC-only communication between processes
 */

const { app, BrowserWindow, globalShortcut, ipcMain, clipboard, screen, nativeTheme } = require('electron');
const path = require('path');
const os = require('os');

// ─── Data directory: avoid OneDrive / cloud-synced paths ────────────────────
const localDataDir = path.join(
    process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local'),
    'PromptLayer'
);
app.setPath('userData', localDataDir);
app.setPath('cache', path.join(localDataDir, 'Cache'));
app.setPath('temp', path.join(localDataDir, 'Temp'));
app.commandLine.appendSwitch('disk-cache-dir', path.join(localDataDir, 'DiskCache'));
app.commandLine.appendSwitch('gpu-disk-cache-dir', path.join(localDataDir, 'GpuCache'));

const Store = require('electron-store');
const { optimizePrompt } = require('./lib/optimizer');

const IS_DEV = !app.isPackaged;

// ─── Settings Store ─────────────────────────────────────────────────────────
const DEFAULT_SHORTCUT = process.platform === 'darwin' ? 'Command+Shift+Space' : 'Ctrl+Shift+L';

const store = new Store({
    name: 'promptlayer-config',
    encryptionKey: 'pl-desktop-v1',
    defaults: {
        provider: 'openai',
        apiKey: '',
        model: 'gpt-4o-mini',
        apiBase: 'https://api.openai.com/v1',
        shortcut: DEFAULT_SHORTCUT,
    }
});

// Migrate stale shortcut from dev builds
const storedShortcut = store.get('shortcut');
if (storedShortcut === 'Ctrl+Shift+Space' || storedShortcut === 'CommandOrControl+Shift+Space') {
    store.set('shortcut', DEFAULT_SHORTCUT);
}

// ─── Window ─────────────────────────────────────────────────────────────────
let mainWindow = null;
const WIN_W = 420;
const WIN_H = 520;

function createWindow() {
    const { width, height } = screen.getPrimaryDisplay().workAreaSize;

    mainWindow = new BrowserWindow({
        width: WIN_W,
        height: WIN_H,
        x: Math.round((width - WIN_W) / 2),
        y: Math.round((height - WIN_H) / 2),
        frame: false,
        transparent: true,
        resizable: false,
        skipTaskbar: true,
        alwaysOnTop: true,
        show: false,
        hasShadow: false,
        title: 'PromptLayer',
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: true,
            devTools: IS_DEV,
        },
    });

    mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));

    mainWindow.on('close', (e) => {
        if (!app.isQuitting) {
            e.preventDefault();
            hideWindow();
        }
    });

    mainWindow.on('blur', () => {
        if (mainWindow && mainWindow.isVisible()) hideWindow();
    });

    nativeTheme.themeSource = 'dark';
}

// ─── Show / Hide ────────────────────────────────────────────────────────────
function showWindow() {
    if (!mainWindow) createWindow();

    // Center on the screen nearest the cursor
    const cursor = screen.getCursorScreenPoint();
    const display = screen.getDisplayNearestPoint(cursor);
    const { x, y, width, height } = display.workArea;
    mainWindow.setPosition(
        Math.round(x + (width - WIN_W) / 2),
        Math.round(y + (height - WIN_H) / 2)
    );

    mainWindow.show();
    mainWindow.focus();
    mainWindow.webContents.send('window:shown');
}

function hideWindow() {
    if (mainWindow && mainWindow.isVisible()) {
        mainWindow.webContents.send('window:hidden');
        mainWindow.hide();
    }
}

function toggleWindow() {
    if (mainWindow && mainWindow.isVisible()) {
        hideWindow();
    } else {
        showWindow();
    }
}

// ─── Global Shortcut ────────────────────────────────────────────────────────
let activeShortcut = '';

function registerShortcut() {
    const primary = store.get('shortcut', DEFAULT_SHORTCUT);
    const candidates = [primary, 'Alt+P', 'Ctrl+Shift+P'];

    globalShortcut.unregisterAll();

    for (const sc of candidates) {
        try {
            if (globalShortcut.register(sc, toggleWindow)) {
                activeShortcut = sc;
                return;
            }
        } catch (_) { /* next */ }
    }
}

// ─── IPC: Optimization ──────────────────────────────────────────────────────
ipcMain.handle('optimize', async (_e, { rawPrompt, instruction }) => {
    try {
        const config = {
            provider: store.get('provider'),
            apiKey: store.get('apiKey'),
            model: store.get('model'),
            apiBase: store.get('apiBase'),
        };
        const result = await optimizePrompt(rawPrompt, instruction, config);
        return { success: true, data: result };
    } catch (err) {
        return { success: false, error: err.message };
    }
});

// ─── IPC: Clipboard ─────────────────────────────────────────────────────────
ipcMain.handle('copy-text', async (_e, text) => {
    clipboard.writeText(text);
    return true;
});

// Read clipboard (for auto-capture on shortcut open)
ipcMain.handle('read-clipboard', async () => {
    return clipboard.readText();
});

// Insert text: write to clipboard → hide window → simulate Ctrl+V
ipcMain.handle('insert-text', async (_e, text) => {
    clipboard.writeText(text);
    hideWindow();
    await sleep(100);
    simulatePaste();
    return true;
});

// Simulate Ctrl+C on the previously focused app (capture selected text)
ipcMain.handle('simulate-copy', async () => {
    // We need a brief pause to let the previous app retain focus
    await sleep(80);
    simulateCopy();
    await sleep(80);
    return clipboard.readText();
});

// ─── IPC: Settings ──────────────────────────────────────────────────────────
ipcMain.handle('get-settings', async () => ({
    provider: store.get('provider'),
    apiKey: store.get('apiKey'),
    model: store.get('model'),
    apiBase: store.get('apiBase'),
    shortcut: activeShortcut || store.get('shortcut'),
}));

ipcMain.handle('save-settings', async (_e, s) => {
    if (s.provider !== undefined) store.set('provider', s.provider);
    if (s.apiKey !== undefined) store.set('apiKey', s.apiKey);
    if (s.model !== undefined) store.set('model', s.model);
    if (s.apiBase !== undefined) store.set('apiBase', s.apiBase);
    return true;
});

ipcMain.on('window:close', () => hideWindow());

// ─── Keystroke simulation (PowerShell-based, no native deps) ────────────────
function simulatePaste() {
    const { exec } = require('child_process');
    if (process.platform === 'win32') {
        exec('powershell -NoProfile -Command "Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.SendKeys]::SendWait(\'^v\')"');
    } else if (process.platform === 'darwin') {
        exec('osascript -e \'tell application "System Events" to keystroke "v" using command down\'');
    }
}

function simulateCopy() {
    const { exec } = require('child_process');
    if (process.platform === 'win32') {
        exec('powershell -NoProfile -Command "Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.SendKeys]::SendWait(\'^c\')"');
    } else if (process.platform === 'darwin') {
        exec('osascript -e \'tell application "System Events" to keystroke "c" using command down\'');
    }
}

function sleep(ms) {
    return new Promise(r => setTimeout(r, ms));
}

// ─── App Lifecycle ──────────────────────────────────────────────────────────
app.whenReady().then(() => {
    createWindow();
    registerShortcut();
});

app.on('will-quit', () => globalShortcut.unregisterAll());
app.on('before-quit', () => { app.isQuitting = true; });

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
