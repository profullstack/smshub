import { app, BrowserWindow, Tray, Menu, nativeImage, ipcMain, Notification } from "electron";
import path from "path";
import { getConfig } from "./config";
import { initNotifications, cleanupNotifications } from "./notifications";
import { initAutoUpdater } from "./updater";

let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;

// ─── Deep link / single instance ──────────────────────────────

// Register smshub:// protocol for deep links
if (process.defaultApp) {
  // Dev mode — register with full path
  if (process.argv.length >= 2) {
    app.setAsDefaultProtocolClient("smshub", process.execPath, [
      path.resolve(process.argv[1]),
    ]);
  }
} else {
  app.setAsDefaultProtocolClient("smshub");
}

// Single instance lock — second instances pass their argv to the first
const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  app.quit();
} else {
  app.on("second-instance", (_event, commandLine) => {
    // Windows/Linux: deep link URL is in commandLine
    const url = commandLine.find((arg) => arg.startsWith("smshub://"));
    if (url) handleDeepLink(url);

    // Focus existing window
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
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
function handleDeepLink(url: string) {
  try {
    const parsed = new URL(url);
    // URL: smshub://chat/abc123 → hostname="chat", pathname="/abc123"
    // URL: smshub://compose?to=+1234 → hostname="compose", search="?to=+1234"

    const host = parsed.hostname;
    const pathPart = parsed.pathname.replace(/^\//, "");

    if (host === "chat" && pathPart) {
      navigateRenderer(`/chat/${pathPart}`);
    } else if (host === "compose") {
      const to = parsed.searchParams.get("to");
      if (to) {
        navigateRenderer(`/?composeTo=${encodeURIComponent(to)}`);
      } else {
        navigateRenderer("/");
      }
    }
  } catch (err) {
    console.error("[deep-link] Failed to parse URL:", url, err);
  }
}

/**
 * Send a navigation event to the renderer process.
 */
function navigateRenderer(path: string) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.show();
    mainWindow.focus();
    mainWindow.webContents.send("navigate", path);
  }
}

// ─── Icon helpers ─────────────────────────────────────────────

function getAppIcon(): Electron.NativeImage {
  const iconPath =
    process.platform === "win32"
      ? path.join(__dirname, "..", "resources", "icon.ico")
      : process.platform === "darwin"
        ? path.join(__dirname, "..", "resources", "icon.icns")
        : path.join(__dirname, "..", "resources", "icons", "256x256.png");

  try {
    return nativeImage.createFromPath(iconPath);
  } catch {
    return nativeImage.createEmpty();
  }
}

function getTrayIcon(): Electron.NativeImage {
  // On macOS, use a template image (monochrome, system handles light/dark)
  const trayIconName =
    process.platform === "darwin" ? "tray-iconTemplate.png" : "tray-icon.png";
  const trayPath = path.join(__dirname, "..", "resources", trayIconName);

  try {
    const icon = nativeImage.createFromPath(trayPath);
    if (process.platform === "darwin") {
      icon.setTemplateImage(true);
    }
    return icon;
  } catch {
    return getAppIcon().resize({ width: 22, height: 22 });
  }
}

// ─── Window creation ──────────────────────────────────────────

function createWindow() {
  const config = getConfig();

  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    title: "SMSHub",
    icon: getAppIcon(),
    backgroundColor: "#030712", // gray-950
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
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
  tray = new Tray(icon);

  const contextMenu = Menu.buildFromTemplate([
    {
      label: "Show SMSHub",
      click: () => mainWindow?.show(),
    },
    { type: "separator" },
    {
      label: "Quit",
      click: () => {
        tray = null;
        app.quit();
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
  ipcMain.on("window-minimize", () => {
    mainWindow?.minimize();
  });

  ipcMain.on("window-maximize", () => {
    if (mainWindow?.isMaximized()) {
      mainWindow.unmaximize();
    } else {
      mainWindow?.maximize();
    }
  });

  ipcMain.on("window-close", () => {
    mainWindow?.close();
  });

  // App version
  ipcMain.handle("get-version", () => {
    return app.getVersion();
  });

  // Manual notification from renderer
  ipcMain.on("notification", (_event, { title, body }: { title: string; body: string }) => {
    if (Notification.isSupported()) {
      const notification = new Notification({ title, body });
      notification.on("click", () => {
        mainWindow?.show();
        mainWindow?.focus();
      });
      notification.show();
    }
  });
}

// ─── App lifecycle ────────────────────────────────────────────

app.whenReady().then(() => {
  registerIpcHandlers();
  createWindow();
  createTray();

  // Init realtime notifications
  if (mainWindow) {
    initNotifications(mainWindow);
    initAutoUpdater(mainWindow);
  }

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

// macOS: handle deep link when app is already running
app.on("open-url", (event, url) => {
  event.preventDefault();
  handleDeepLink(url);
});

app.on("before-quit", () => {
  cleanupNotifications();
  // Allow window to actually close when quitting
  tray = null;
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
