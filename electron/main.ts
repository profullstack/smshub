import { app, BrowserWindow, Tray, Menu, nativeImage, ipcMain, Notification } from "electron";
import path from "path";
import { getConfig } from "./config";
import { initNotifications, cleanupNotifications } from "./notifications";
import { initAutoUpdater } from "./updater";

let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;

function createWindow() {
  const config = getConfig();

  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    title: "SMSHub",
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
  // TODO: Replace with actual icon
  const icon = nativeImage.createEmpty();
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
