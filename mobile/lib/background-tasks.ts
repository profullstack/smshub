/**
 * Background Tasks — Periodically fetch new messages when app is backgrounded.
 *
 * Uses expo-background-fetch and expo-task-manager to register a background task
 * that checks Supabase for new messages.
 */

import * as BackgroundFetch from "expo-background-fetch";
import * as TaskManager from "expo-task-manager";
import * as Notifications from "expo-notifications";
import { supabase } from "./supabase";
import { saveConversations } from "./offline-store";
import type { CachedConversation } from "./offline-store";

const BACKGROUND_FETCH_TASK = "SMSHUB_BACKGROUND_FETCH";

/**
 * Define the background task.
 * This runs periodically when the app is backgrounded.
 */
TaskManager.defineTask(BACKGROUND_FETCH_TASK, async () => {
  try {
    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session) {
      return BackgroundFetch.BackgroundFetchResult.NoData;
    }

    // Fetch latest conversations with newest message
    const { data: conversations, error } = await supabase
      .from("conversations")
      .select(
        "*, contacts(phone, name), messages(body, direction, created_at)"
      )
      .order("last_message_at", { ascending: false })
      .order("created_at", {
        ascending: false,
        referencedTable: "messages",
      })
      .limit(1, { referencedTable: "messages" })
      .limit(50);

    if (error || !conversations) {
      console.error("[background-fetch] Error fetching conversations:", error);
      return BackgroundFetch.BackgroundFetchResult.Failed;
    }

    // Cache conversations for offline use
    await saveConversations(conversations as CachedConversation[]);

    // Check for new unread inbound messages (received in last 5 minutes)
    const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    const { data: newMessages } = await supabase
      .from("messages")
      .select("id, body, conversation_id, created_at")
      .eq("direction", "inbound")
      .gte("created_at", fiveMinAgo)
      .order("created_at", { ascending: false })
      .limit(5);

    if (newMessages && newMessages.length > 0) {
      // Show a local notification for new messages
      for (const msg of newMessages) {
        await Notifications.scheduleNotificationAsync({
          content: {
            title: "New SMS",
            body: msg.body.length > 100 ? msg.body.slice(0, 100) + "…" : msg.body,
            data: { conversation_id: msg.conversation_id },
            sound: "default",
          },
          trigger: null, // immediate
        });
      }

      return BackgroundFetch.BackgroundFetchResult.NewData;
    }

    return BackgroundFetch.BackgroundFetchResult.NoData;
  } catch (err) {
    console.error("[background-fetch] Task error:", err);
    return BackgroundFetch.BackgroundFetchResult.Failed;
  }
});

/**
 * Register the background fetch task.
 * Call once at app startup (after auth).
 */
export async function registerBackgroundFetch(): Promise<void> {
  try {
    const status = await BackgroundFetch.getStatusAsync();

    if (
      status === BackgroundFetch.BackgroundFetchStatus.Restricted ||
      status === BackgroundFetch.BackgroundFetchStatus.Denied
    ) {
      console.log("[background-fetch] Background fetch is restricted or denied");
      return;
    }

    // Check if already registered
    const isRegistered = await TaskManager.isTaskRegisteredAsync(
      BACKGROUND_FETCH_TASK
    );
    if (isRegistered) {
      console.log("[background-fetch] Task already registered");
      return;
    }

    await BackgroundFetch.registerTaskAsync(BACKGROUND_FETCH_TASK, {
      minimumInterval: 15 * 60, // 15 minutes (iOS minimum)
      stopOnTerminate: false, // Android: continue after app is killed
      startOnBoot: true, // Android: start on device boot
    });

    console.log("[background-fetch] Task registered successfully");
  } catch (err) {
    console.error("[background-fetch] Failed to register task:", err);
  }
}

/**
 * Unregister the background fetch task (e.g., on logout).
 */
export async function unregisterBackgroundFetch(): Promise<void> {
  try {
    const isRegistered = await TaskManager.isTaskRegisteredAsync(
      BACKGROUND_FETCH_TASK
    );
    if (isRegistered) {
      await BackgroundFetch.unregisterTaskAsync(BACKGROUND_FETCH_TASK);
      console.log("[background-fetch] Task unregistered");
    }
  } catch (err) {
    console.error("[background-fetch] Failed to unregister task:", err);
  }
}
