import { app, BrowserWindow, Tray, Menu, nativeImage, ipcMain, Notification } from "electron";
import path from "path";

// ─── Constants ──────────────────────────────────────────────
const APP_URL = "https://smshub.dev";
const APP_NAME = "SMSHub";

let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;

// ─── Deep link / single instance ──────────────────────────────
if (process.defaultApp) {
  if (process.argv.length >= 2) {
    app.setAsDefaultProtocolClient("smshub", process.execPath, [
      path.resolve(process.argv[1]),
    ]);
  }
} else {
  app.setAsDefaultProtocolClient("smshub");
}

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
}

app.on("second-instance", (_event, commandLine) => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
    const url = commandLine.find((arg) => arg.startsWith("smshub://"));
    if (url) handleDeepLink(url);
  }
});

function handleDeepLink(url: string) {
  if (!mainWindow) return;
  const parsed = new URL(url);
  if (parsed.pathname.startsWith("//chat/")) {
    const id = parsed.pathname.replace("//chat/", "");
    mainWindow.loadURL(`${APP_URL}/inbox?conversation=${id}`);
  } else if (parsed.pathname.startsWith("//compose")) {
    const to = parsed.searchParams.get("to");
    mainWindow.loadURL(`${APP_URL}/inbox?compose=true${to ? `&to=${to}` : ""}`);
  }
}

// ─── Icon helpers ──────────────────────────────────────────────
function getAppIcon(): Electron.NativeImage {
  try {
    const iconPath = app.isPackaged
      ? path.join(process.resourcesPath, "icon.png")
      : path.join(__dirname, "..", "resources", "icons", "256x256.png");
    return nativeImage.createFromPath(iconPath);
  } catch {
    return nativeImage.createEmpty();
  }
}

function getTrayIcon(): Electron.NativeImage {
  return getAppIcon().resize({ width: 22, height: 22 });
}

// ─── Window ──────────────────────────────────────────────────
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    title: APP_NAME,
    icon: getAppIcon(),
    backgroundColor: "#030712",
    webPreferences: {
      preload: path.join(__dirname, "../preload/index.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.loadURL(APP_URL);

  mainWindow.on("close", (event) => {
    if (tray) {
      event.preventDefault();
      mainWindow?.hide();
    }
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

// ─── Tray ──────────────────────────────────────────────────
function createTray() {
  const icon = getTrayIcon();
  tray = new Tray(icon);

  const contextMenu = Menu.buildFromTemplate([
    { label: `Show ${APP_NAME}`, click: () => mainWindow?.show() },
    { type: "separator" },
    { label: "Quit", click: () => { tray = null; app.quit(); } },
  ]);

  tray.setToolTip(APP_NAME);
  tray.setContextMenu(contextMenu);
  tray.on("click", () => mainWindow?.show());
}

// ─── IPC handlers ──────────────────────────────────────────────
ipcMain.on("window-minimize", () => mainWindow?.minimize());
ipcMain.on("window-maximize", () => {
  if (mainWindow?.isMaximized()) mainWindow.unmaximize();
  else mainWindow?.maximize();
});
ipcMain.on("window-close", () => mainWindow?.close());
ipcMain.handle("get-version", () => app.getVersion());
ipcMain.on("notification", (_event, { title, body }) => {
  new Notification({ title, body }).show();
});

// ─── App ready ──────────────────────────────────────────────
app.whenReady().then(() => {
  createWindow();
  createTray();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

// macOS deep link handler
app.on("open-url", (event, url) => {
  event.preventDefault();
  handleDeepLink(url);
});
