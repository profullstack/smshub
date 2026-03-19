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

  // IPC listeners
  onNewMessage: (callback: (data: unknown) => void) => {
    ipcRenderer.on("new-message", (_event, data) => callback(data));
  },
});
