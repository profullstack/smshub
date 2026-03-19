"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.initNotifications = initNotifications;
exports.cleanupNotifications = cleanupNotifications;
const electron_1 = require("electron");
const supabase_js_1 = require("@supabase/supabase-js");
const config_1 = require("./config");
let supabase = null;
let channel = null;
function initNotifications(mainWindow) {
    const config = (0, config_1.getConfig)();
    if (!config.supabaseUrl || !config.supabaseAnonKey) {
        console.warn("[notifications] Supabase URL or anon key not configured — realtime notifications disabled");
        return;
    }
    supabase = (0, supabase_js_1.createClient)(config.supabaseUrl, config.supabaseAnonKey);
    channel = supabase
        .channel("messages-realtime")
        .on("postgres_changes", {
        event: "INSERT",
        schema: "public",
        table: "messages",
        filter: "direction=eq.inbound",
    }, (payload) => {
        const message = payload.new;
        handleNewMessage(message, mainWindow);
    })
        .subscribe((status) => {
        console.log("[notifications] Realtime subscription status:", status);
    });
}
function handleNewMessage(message, mainWindow) {
    // Forward to renderer process
    if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send("new-message", message);
    }
    // Show native notification only if window is not focused
    if (!mainWindow || mainWindow.isDestroyed() || !mainWindow.isFocused()) {
        showNotification(message, mainWindow);
    }
}
function showNotification(message, mainWindow) {
    if (!electron_1.Notification.isSupported())
        return;
    const notification = new electron_1.Notification({
        title: "New SMS",
        body: message.body?.slice(0, 200) || "New message received",
        silent: false,
    });
    notification.on("click", () => {
        if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.show();
            mainWindow.focus();
            // Navigate to the conversation
            mainWindow.webContents.send("navigate-conversation", message.conversation_id);
        }
    });
    notification.show();
}
function cleanupNotifications() {
    if (channel && supabase) {
        supabase.removeChannel(channel);
        channel = null;
    }
    supabase = null;
}
