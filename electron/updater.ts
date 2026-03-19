import { autoUpdater } from "electron-updater";
import { BrowserWindow, dialog } from "electron";

export function initAutoUpdater(mainWindow: BrowserWindow): void {
  // Don't check for updates in dev
  if (!mainWindow || process.env.NODE_ENV === "development") {
    console.log("[updater] Skipping auto-update in dev mode");
    return;
  }

  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on("checking-for-update", () => {
    console.log("[updater] Checking for updates...");
  });

  autoUpdater.on("update-available", (info) => {
    console.log("[updater] Update available:", info.version);
    dialog
      .showMessageBox(mainWindow, {
        type: "info",
        title: "Update Available",
        message: `SMSHub v${info.version} is available. Download now?`,
        buttons: ["Download", "Later"],
        defaultId: 0,
      })
      .then((result) => {
        if (result.response === 0) {
          autoUpdater.downloadUpdate();
        }
      });
  });

  autoUpdater.on("update-not-available", () => {
    console.log("[updater] No updates available");
  });

  autoUpdater.on("download-progress", (progress) => {
    console.log(`[updater] Download progress: ${Math.round(progress.percent)}%`);
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send("update-progress", progress.percent);
    }
  });

  autoUpdater.on("update-downloaded", () => {
    console.log("[updater] Update downloaded");
    dialog
      .showMessageBox(mainWindow, {
        type: "info",
        title: "Update Ready",
        message: "Update has been downloaded. Restart now to apply?",
        buttons: ["Restart", "Later"],
        defaultId: 0,
      })
      .then((result) => {
        if (result.response === 0) {
          autoUpdater.quitAndInstall();
        }
      });
  });

  autoUpdater.on("error", (err) => {
    console.error("[updater] Error:", err.message);
  });

  // Check for updates after a short delay
  setTimeout(() => {
    autoUpdater.checkForUpdates().catch((err) => {
      console.error("[updater] Failed to check for updates:", err.message);
    });
  }, 3000);
}
