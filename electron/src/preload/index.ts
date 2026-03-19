import { contextBridge, ipcRenderer } from "electron";

// Expose protected methods to the renderer process
contextBridge.exposeInMainWorld("electron", {
  // Notifications
  sendNotification: (title: string, body: string) => {
    ipcRenderer.send("notification", { title, body });
  },

  // App info
  getVersion: () => ipcRenderer.invoke("get-version"),

  // Window controls
  minimize: () => ipcRenderer.send("window-minimize"),
  maximize: () => ipcRenderer.send("window-maximize"),
  close: () => ipcRenderer.send("window-close"),

  // IPC listeners — messages
  onNewMessage: (callback: (data: unknown) => void) => {
    ipcRenderer.on("new-message", (_event, data) => callback(data));
  },

  // IPC listeners — navigation (deep links)
  onNavigate: (callback: (path: string) => void) => {
    ipcRenderer.on("navigate", (_event, path) => callback(path));
  },

  // IPC listeners — auto-updater
  onUpdateAvailable: (callback: (info: { version: string; releaseDate?: string; releaseNotes?: string }) => void) => {
    ipcRenderer.on("update-available", (_event, info) => callback(info));
  },

  onUpdateProgress: (callback: (percent: number) => void) => {
    ipcRenderer.on("update-progress", (_event, percent) => callback(percent));
  },

  onUpdateDownloaded: (callback: (info: { version: string }) => void) => {
    ipcRenderer.on("update-downloaded", (_event, info) => callback(info));
  },

  onUpdateError: (callback: (error: { message: string }) => void) => {
    ipcRenderer.on("update-error", (_event, error) => callback(error));
  },
});
