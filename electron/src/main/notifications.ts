import { Notification, BrowserWindow } from "electron";
import { createClient, RealtimeChannel, SupabaseClient } from "@supabase/supabase-js";
import { getConfig } from "./config";

interface MessagePayload {
  id: string;
  conversation_id: string;
  direction: "inbound" | "outbound";
  body: string;
  status: string;
  provider: string;
  created_at: string;
}

let supabase: SupabaseClient | null = null;
let channel: RealtimeChannel | null = null;

export function initNotifications(mainWindow: BrowserWindow): void {
  const config = getConfig();

  if (!config.supabaseUrl || !config.supabaseAnonKey) {
    console.warn("[notifications] Supabase URL or anon key not configured — realtime notifications disabled");
    return;
  }

  supabase = createClient(config.supabaseUrl, config.supabaseAnonKey);

  channel = supabase
    .channel("messages-realtime")
    .on(
      "postgres_changes",
      {
        event: "INSERT",
        schema: "public",
        table: "messages",
        filter: "direction=eq.inbound",
      },
      (payload) => {
        const message = payload.new as MessagePayload;
        handleNewMessage(message, mainWindow);
      }
    )
    .subscribe((status) => {
      console.log("[notifications] Realtime subscription status:", status);
    });
}

function handleNewMessage(message: MessagePayload, mainWindow: BrowserWindow): void {
  // Forward to renderer process
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send("new-message", message);
  }

  // Show native notification only if window is not focused
  if (!mainWindow || mainWindow.isDestroyed() || !mainWindow.isFocused()) {
    showNotification(message, mainWindow);
  }
}

function showNotification(message: MessagePayload, mainWindow: BrowserWindow): void {
  if (!Notification.isSupported()) return;

  const notification = new Notification({
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

export function cleanupNotifications(): void {
  if (channel && supabase) {
    supabase.removeChannel(channel);
    channel = null;
  }
  supabase = null;
}
