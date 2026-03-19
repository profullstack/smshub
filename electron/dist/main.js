"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const electron_1 = require("electron");
const path_1 = __importDefault(require("path"));
const config_1 = require("./config");
const notifications_1 = require("./notifications");
const updater_1 = require("./updater");
let mainWindow = null;
let tray = null;
// ─── Deep link / single instance ──────────────────────────────
// Register smshub:// protocol for deep links
if (process.defaultApp) {
    // Dev mode — register with full path
    if (process.argv.length >= 2) {
        electron_1.app.setAsDefaultProtocolClient("smshub", process.execPath, [
            path_1.default.resolve(process.argv[1]),
        ]);
    }
}
else {
    electron_1.app.setAsDefaultProtocolClient("smshub");
}
// Single instance lock — second instances pass their argv to the first
const gotTheLock = electron_1.app.requestSingleInstanceLock();
if (!gotTheLock) {
    electron_1.app.quit();
}
else {
    electron_1.app.on("second-instance", (_event, commandLine) => {
        // Windows/Linux: deep link URL is in commandLine
        const url = commandLine.find((arg) => arg.startsWith("smshub://"));
        if (url)
            handleDeepLink(url);
        // Focus existing window
        if (mainWindow) {
            if (mainWindow.isMinimized())
                mainWindow.restore();
            mainWindow.show();
            mainWindow.focus();
        }
    });
}
/**
 * Parse and handle smshub:// deep links.
 *
 * Supported:
 *   smshub://chat/{conversationId}
 *   smshub://compose?to={phone}
 */
function handleDeepLink(url) {
    try {
        const parsed = new URL(url);
        // URL: smshub://chat/abc123 → hostname="chat", pathname="/abc123"
        // URL: smshub://compose?to=+1234 → hostname="compose", search="?to=+1234"
        const host = parsed.hostname;
        const pathPart = parsed.pathname.replace(/^\//, "");
        if (host === "chat" && pathPart) {
            navigateRenderer(`/chat/${pathPart}`);
        }
        else if (host === "compose") {
            const to = parsed.searchParams.get("to");
            if (to) {
                navigateRenderer(`/?composeTo=${encodeURIComponent(to)}`);
            }
            else {
                navigateRenderer("/");
            }
        }
    }
    catch (err) {
        console.error("[deep-link] Failed to parse URL:", url, err);
    }
}
/**
 * Send a navigation event to the renderer process.
 */
function navigateRenderer(path) {
    if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.show();
        mainWindow.focus();
        mainWindow.webContents.send("navigate", path);
    }
}
// ─── Icon helpers ─────────────────────────────────────────────
function getAppIcon() {
    const iconPath = process.platform === "win32"
        ? path_1.default.join(__dirname, "..", "resources", "icon.ico")
        : process.platform === "darwin"
            ? path_1.default.join(__dirname, "..", "resources", "icon.icns")
            : path_1.default.join(__dirname, "..", "resources", "icons", "256x256.png");
    try {
        return electron_1.nativeImage.createFromPath(iconPath);
    }
    catch {
        return electron_1.nativeImage.createEmpty();
    }
}
function getTrayIcon() {
    // On macOS, use a template image (monochrome, system handles light/dark)
    const trayIconName = process.platform === "darwin" ? "tray-iconTemplate.png" : "tray-icon.png";
    const trayPath = path_1.default.join(__dirname, "..", "resources", trayIconName);
    try {
        const icon = electron_1.nativeImage.createFromPath(trayPath);
        if (process.platform === "darwin") {
            icon.setTemplateImage(true);
        }
        return icon;
    }
    catch {
        return getAppIcon().resize({ width: 22, height: 22 });
    }
}
// ─── Window creation ──────────────────────────────────────────
function createWindow() {
    const config = (0, config_1.getConfig)();
    mainWindow = new electron_1.BrowserWindow({
        width: 1200,
        height: 800,
        minWidth: 800,
        minHeight: 600,
        title: "SMSHub",
        icon: getAppIcon(),
        backgroundColor: "#030712", // gray-950
        webPreferences: {
            preload: path_1.default.join(__dirname, "preload.js"),
            contextIsolation: true,
            nodeIntegration: false,
        },
    });
    mainWindow.loadURL(config.appUrl);
    mainWindow.on("close", (event) => {
        // Minimize to tray instead of quitting
        if (tray) {
            event.preventDefault();
            mainWindow?.hide();
        }
    });
    mainWindow.on("closed", () => {
        mainWindow = null;
    });
}
function createTray() {
    const icon = getTrayIcon();
    tray = new electron_1.Tray(icon);
    const contextMenu = electron_1.Menu.buildFromTemplate([
        {
            label: "Show SMSHub",
            click: () => mainWindow?.show(),
        },
        { type: "separator" },
        {
            label: "Quit",
            click: () => {
                tray = null;
                electron_1.app.quit();
            },
        },
    ]);
    tray.setToolTip("SMSHub");
    tray.setContextMenu(contextMenu);
    tray.on("click", () => {
        mainWindow?.show();
    });
}
function registerIpcHandlers() {
    // Window controls
    electron_1.ipcMain.on("window-minimize", () => {
        mainWindow?.minimize();
    });
    electron_1.ipcMain.on("window-maximize", () => {
        if (mainWindow?.isMaximized()) {
            mainWindow.unmaximize();
        }
        else {
            mainWindow?.maximize();
        }
    });
    electron_1.ipcMain.on("window-close", () => {
        mainWindow?.close();
    });
    // App version
    electron_1.ipcMain.handle("get-version", () => {
        return electron_1.app.getVersion();
    });
    // Manual notification from renderer
    electron_1.ipcMain.on("notification", (_event, { title, body }) => {
        if (electron_1.Notification.isSupported()) {
            const notification = new electron_1.Notification({ title, body });
            notification.on("click", () => {
                mainWindow?.show();
                mainWindow?.focus();
            });
            notification.show();
        }
    });
}
// ─── App lifecycle ────────────────────────────────────────────
electron_1.app.whenReady().then(() => {
    registerIpcHandlers();
    createWindow();
    createTray();
    // Init realtime notifications
    if (mainWindow) {
        (0, notifications_1.initNotifications)(mainWindow);
        (0, updater_1.initAutoUpdater)(mainWindow);
    }
    electron_1.app.on("activate", () => {
        if (electron_1.BrowserWindow.getAllWindows().length === 0) {
            createWindow();
        }
    });
});
// macOS: handle deep link when app is already running
electron_1.app.on("open-url", (event, url) => {
    event.preventDefault();
    handleDeepLink(url);
});
electron_1.app.on("before-quit", () => {
    (0, notifications_1.cleanupNotifications)();
    // Allow window to actually close when quitting
    tray = null;
});
electron_1.app.on("window-all-closed", () => {
    if (process.platform !== "darwin") {
        electron_1.app.quit();
    }
});
