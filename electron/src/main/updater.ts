import { autoUpdater } from "electron-updater";
import { BrowserWindow, dialog } from "electron";

export function initAutoUpdater(mainWindow: BrowserWindow): void {
  // Don't check for updates in dev
  if (!mainWindow || process.env.NODE_ENV === "development" || !process.env.ELECTRON_UPDATER_ENABLED) {
    console.log("[updater] Auto-update disabled (set ELECTRON_UPDATER_ENABLED=1 to enable)");
    return;
  }

  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = true;

  // Configure GitHub Releases provider
  // electron-builder.yml publish section handles the repo config.
  // Override feed URL if needed:
  // autoUpdater.setFeedURL({
  //   provider: "github",
  //   owner: "smshub",
  //   repo: "smshub",
  // });

  autoUpdater.on("checking-for-update", () => {
    console.log("[updater] Checking for updates...");
  });

  autoUpdater.on("update-available", (info) => {
    console.log("[updater] Update available:", info.version);

    // Notify renderer via IPC so the web UI can show an update banner
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send("update-available", {
        version: info.version,
        releaseDate: info.releaseDate,
        releaseNotes: info.releaseNotes,
      });
    }

    // Also show native dialog
    dialog
      .showMessageBox(mainWindow, {
        type: "info",
        title: "Update Available",
        message: `SMSHub v${info.version} is available. Download now?`,
        detail: typeof info.releaseNotes === "string" ? info.releaseNotes : undefined,
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

  autoUpdater.on("update-downloaded", (info) => {
    console.log("[updater] Update downloaded:", info.version);

    // Notify renderer
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send("update-downloaded", {
        version: info.version,
      });
    }

    dialog
      .showMessageBox(mainWindow, {
        type: "info",
        title: "Update Ready",
        message: `SMSHub v${info.version} has been downloaded. Restart now to apply?`,
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
    // Notify renderer of error
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send("update-error", {
        message: err.message,
      });
    }
  });

  // Check for updates after a short delay
  setTimeout(() => {
    autoUpdater.checkForUpdates().catch((err) => {
      console.error("[updater] Failed to check for updates:", err.message);
    });
  }, 3000);

  // Also check periodically (every 4 hours)
  setInterval(
    () => {
      autoUpdater.checkForUpdates().catch((err) => {
        console.error("[updater] Periodic check failed:", err.message);
      });
    },
    4 * 60 * 60 * 1000
  );
}
