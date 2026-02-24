/**
 * PromptLayer Desktop — Main Process
 *
 * Production-hardened Electron main process.
 * Manages a single floating prompt window, system tray,
 * global shortcut, clipboard-based auto-capture/insert,
 * and routes all optimization through lib/optimizer.js.
 *
 * First-run: window opens immediately into Settings view.
 * Returning user: window stays hidden, activated via global shortcut.
 *
 * Security: contextIsolation + sandbox + encrypted store + no devtools (prod)
 */

const { app, BrowserWindow, globalShortcut, ipcMain, clipboard, screen, nativeTheme, Tray, Menu, nativeImage } = require('electron');
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

// ─── Windows App Identity ───────────────────────────────────────────────────
app.setAppUserModelId('in.vike.promptlayer');

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

// ─── State ──────────────────────────────────────────────────────────────────
let mainWindow = null;
let tray = null;
let activeShortcut = '';

const WIN_W = 420;
const WIN_H = 520;

// ─── First-run detection ────────────────────────────────────────────────────
function isFirstRun() {
    const key = store.get('apiKey');
    return !key || key.length < 10;
}

// ─── Main Window ────────────────────────────────────────────────────────────
function createWindow() {
    if (mainWindow) return;

    const { width, height } = screen.getPrimaryDisplay().workAreaSize;

    mainWindow = new BrowserWindow({
        width: WIN_W,
        height: WIN_H,
        x: Math.round((width - WIN_W) / 2),
        y: Math.round((height - WIN_H) / 2),
        frame: false,
        transparent: true,
        resizable: false,
        skipTaskbar: false,
        alwaysOnTop: true,
        show: false,
        hasShadow: false,
        title: 'PromptLayer',
        icon: path.join(__dirname, 'assets', 'icon.ico'),
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

    mainWindow.on('closed', () => { mainWindow = null; });

    nativeTheme.themeSource = 'dark';
}

// ─── System Tray ────────────────────────────────────────────────────────────
function createTray() {
    if (tray) return;

    const iconPath = path.join(__dirname, 'assets', 'icon.png');
    let trayImage = nativeImage.createFromPath(iconPath);
    trayImage = trayImage.resize({ width: 16, height: 16 });

    tray = new Tray(trayImage);
    tray.setToolTip('PromptLayer');

    const contextMenu = Menu.buildFromTemplate([
        {
            label: 'Open PromptLayer',
            click: () => showWindow(),
        },
        {
            label: 'Settings',
            click: () => {
                showWindow();
                if (mainWindow) {
                    mainWindow.webContents.send('navigate:settings');
                }
            },
        },
        { type: 'separator' },
        {
            label: 'Quit',
            click: () => {
                app.isQuitting = true;
                app.quit();
            },
        },
    ]);

    tray.setContextMenu(contextMenu);
    tray.on('click', () => toggleWindow());
}

// ─── Show / Hide ────────────────────────────────────────────────────────────
function showWindow() {
    if (!mainWindow) createWindow();

    const cursor = screen.getCursorScreenPoint();
    const display = screen.getDisplayNearestPoint(cursor);
    const { x, y, width, height } = display.workArea;
    mainWindow.setPosition(
        Math.round(x + (width - WIN_W) / 2),
        Math.round(y + (height - WIN_H) / 2)
    );

    // Appear above everything, then settle to normal stacking
    mainWindow.setAlwaysOnTop(true, 'screen-saver');
    mainWindow.show();
    mainWindow.setSkipTaskbar(false); // Fixes Windows transparent window bug
    mainWindow.focus();
    mainWindow.webContents.send('window:shown');

    setTimeout(() => {
        if (mainWindow) mainWindow.setAlwaysOnTop(false);
    }, 2000);
}

function hideWindow() {
    if (mainWindow && mainWindow.isVisible()) {
        mainWindow.webContents.send('window:hidden');
        mainWindow.hide();
    }
}

function toggleWindow() {
    if (mainWindow && mainWindow.isVisible()) {
        if (mainWindow.isFocused()) {
            hideWindow();
        } else {
            showWindow();
        }
    } else {
        showWindow();
    }
}

// ─── Global Shortcut ────────────────────────────────────────────────────────
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

// ─── IPC: Optimization ─────────────────────────────────────────────────────
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

ipcMain.handle('read-clipboard', async () => clipboard.readText());

ipcMain.handle('insert-text', async (_e, text) => {
    clipboard.writeText(text);
    hideWindow();
    await sleep(100);
    simulatePaste();
    return true;
});

ipcMain.handle('simulate-copy', async () => {
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
    if (s.shortcut !== undefined) {
        store.set('shortcut', s.shortcut);
    }

    // If API key was just saved and shortcut isn't registered, register it now
    if (s.apiKey && s.apiKey.length >= 10 && !activeShortcut) {
        registerShortcut();
    }

    return { success: true, shortcut: activeShortcut || store.get('shortcut') };
});

ipcMain.on('window:close', () => hideWindow());
ipcMain.on('window:hide', () => hideWindow());

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
    createTray();

    if (isFirstRun()) {
        // First launch: show window immediately into settings
        mainWindow.webContents.once('did-finish-load', () => {
            mainWindow.show();
            mainWindow.focus();
            mainWindow.webContents.send('first-run');
        });
    } else {
        // Returning user: register shortcut, stay hidden
        registerShortcut();
    }
});

app.on('will-quit', () => globalShortcut.unregisterAll());
app.on('before-quit', () => { app.isQuitting = true; });

app.on('window-all-closed', () => {
    if (!tray) app.quit();
});

app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
