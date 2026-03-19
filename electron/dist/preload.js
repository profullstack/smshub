"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const electron_1 = require("electron");
// Expose protected methods to the renderer process
electron_1.contextBridge.exposeInMainWorld("electron", {
    // Notifications
    sendNotification: (title, body) => {
        electron_1.ipcRenderer.send("notification", { title, body });
    },
    // App info
    getVersion: () => electron_1.ipcRenderer.invoke("get-version"),
    // Window controls
    minimize: () => electron_1.ipcRenderer.send("window-minimize"),
    maximize: () => electron_1.ipcRenderer.send("window-maximize"),
    close: () => electron_1.ipcRenderer.send("window-close"),
    // IPC listeners — messages
    onNewMessage: (callback) => {
        electron_1.ipcRenderer.on("new-message", (_event, data) => callback(data));
    },
    // IPC listeners — navigation (deep links)
    onNavigate: (callback) => {
        electron_1.ipcRenderer.on("navigate", (_event, path) => callback(path));
    },
    // IPC listeners — auto-updater
    onUpdateAvailable: (callback) => {
        electron_1.ipcRenderer.on("update-available", (_event, info) => callback(info));
    },
    onUpdateProgress: (callback) => {
        electron_1.ipcRenderer.on("update-progress", (_event, percent) => callback(percent));
    },
    onUpdateDownloaded: (callback) => {
        electron_1.ipcRenderer.on("update-downloaded", (_event, info) => callback(info));
    },
    onUpdateError: (callback) => {
        electron_1.ipcRenderer.on("update-error", (_event, error) => callback(error));
    },
});
