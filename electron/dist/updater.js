"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.initAutoUpdater = initAutoUpdater;
const electron_updater_1 = require("electron-updater");
const electron_1 = require("electron");
function initAutoUpdater(mainWindow) {
    // Don't check for updates in dev
    if (!mainWindow || process.env.NODE_ENV === "development") {
        console.log("[updater] Skipping auto-update in dev mode");
        return;
    }
    electron_updater_1.autoUpdater.autoDownload = false;
    electron_updater_1.autoUpdater.autoInstallOnAppQuit = true;
    // Configure GitHub Releases provider
    // electron-builder.yml publish section handles the repo config.
    // Override feed URL if needed:
    // autoUpdater.setFeedURL({
    //   provider: "github",
    //   owner: "smshub",
    //   repo: "smshub",
    // });
    electron_updater_1.autoUpdater.on("checking-for-update", () => {
        console.log("[updater] Checking for updates...");
    });
    electron_updater_1.autoUpdater.on("update-available", (info) => {
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
        electron_1.dialog
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
                electron_updater_1.autoUpdater.downloadUpdate();
            }
        });
    });
    electron_updater_1.autoUpdater.on("update-not-available", () => {
        console.log("[updater] No updates available");
    });
    electron_updater_1.autoUpdater.on("download-progress", (progress) => {
        console.log(`[updater] Download progress: ${Math.round(progress.percent)}%`);
        if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send("update-progress", progress.percent);
        }
    });
    electron_updater_1.autoUpdater.on("update-downloaded", (info) => {
        console.log("[updater] Update downloaded:", info.version);
        // Notify renderer
        if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send("update-downloaded", {
                version: info.version,
            });
        }
        electron_1.dialog
            .showMessageBox(mainWindow, {
            type: "info",
            title: "Update Ready",
            message: `SMSHub v${info.version} has been downloaded. Restart now to apply?`,
            buttons: ["Restart", "Later"],
            defaultId: 0,
        })
            .then((result) => {
            if (result.response === 0) {
                electron_updater_1.autoUpdater.quitAndInstall();
            }
        });
    });
    electron_updater_1.autoUpdater.on("error", (err) => {
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
        electron_updater_1.autoUpdater.checkForUpdates().catch((err) => {
            console.error("[updater] Failed to check for updates:", err.message);
        });
    }, 3000);
    // Also check periodically (every 4 hours)
    setInterval(() => {
        electron_updater_1.autoUpdater.checkForUpdates().catch((err) => {
            console.error("[updater] Periodic check failed:", err.message);
        });
    }, 4 * 60 * 60 * 1000);
}
