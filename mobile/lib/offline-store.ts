/**
 * Offline Store — Cache conversations and messages locally using AsyncStorage.
 *
 * Features:
 * - Save/load conversations + messages to local storage
 * - Show cached data with "offline" indicator when no network
 * - Queue outbound messages for send when back online
 */

import AsyncStorage from "@react-native-async-storage/async-storage";
import NetInfo, { NetInfoState } from "@react-native-community/netinfo";
import { supabase } from "./supabase";
import { sendMessage } from "./api";

// Storage keys
const KEYS = {
  CONVERSATIONS: "smshub:conversations",
  MESSAGES_PREFIX: "smshub:messages:",
  OUTBOX: "smshub:outbox",
} as const;

// Types
export interface CachedConversation {
  id: string;
  last_message_at: string;
  phone_number_id: string;
  contacts: { phone: string; name: string | null } | null;
  messages: { body: string; direction: string; created_at: string }[] | null;
}

export interface CachedMessage {
  id: string;
  conversation_id: string;
  direction: string;
  body: string;
  status: string;
  created_at: string;
}

export interface QueuedMessage {
  id: string;
  to: string;
  phoneNumberId: string;
  message: string;
  queuedAt: string;
  retries: number;
}

// ─── Network state ────────────────────────────────────────────

let _isOnline = true;
let _listeners: Array<(online: boolean) => void> = [];

export function isOnline(): boolean {
  return _isOnline;
}

export function onConnectivityChange(cb: (online: boolean) => void): () => void {
  _listeners.push(cb);
  return () => {
    _listeners = _listeners.filter((l) => l !== cb);
  };
}

/**
 * Initialize network monitoring. Call once at app start.
 */
export function initNetworkMonitor(): () => void {
  const unsubscribe = NetInfo.addEventListener((state: NetInfoState) => {
    const online = !!(state.isConnected && state.isInternetReachable !== false);
    if (online !== _isOnline) {
      _isOnline = online;
      _listeners.forEach((cb) => cb(online));
      if (online) {
        // Flush queued messages when we come back online
        flushOutbox().catch(console.error);
      }
    }
  });

  return unsubscribe;
}

// ─── Conversations cache ──────────────────────────────────────

export async function saveConversations(
  conversations: CachedConversation[]
): Promise<void> {
  try {
    await AsyncStorage.setItem(
      KEYS.CONVERSATIONS,
      JSON.stringify(conversations)
    );
  } catch (err) {
    console.error("[offline-store] Failed to save conversations:", err);
  }
}

export async function loadConversations(): Promise<CachedConversation[]> {
  try {
    const raw = await AsyncStorage.getItem(KEYS.CONVERSATIONS);
    return raw ? JSON.parse(raw) : [];
  } catch (err) {
    console.error("[offline-store] Failed to load conversations:", err);
    return [];
  }
}

// ─── Messages cache ──────────────────────────────────────────

export async function saveMessages(
  conversationId: string,
  messages: CachedMessage[]
): Promise<void> {
  try {
    await AsyncStorage.setItem(
      `${KEYS.MESSAGES_PREFIX}${conversationId}`,
      JSON.stringify(messages)
    );
  } catch (err) {
    console.error("[offline-store] Failed to save messages:", err);
  }
}

export async function loadMessages(
  conversationId: string
): Promise<CachedMessage[]> {
  try {
    const raw = await AsyncStorage.getItem(
      `${KEYS.MESSAGES_PREFIX}${conversationId}`
    );
    return raw ? JSON.parse(raw) : [];
  } catch (err) {
    console.error("[offline-store] Failed to load messages:", err);
    return [];
  }
}

// ─── Outbox (queued messages for offline send) ───────────────

export async function queueMessage(msg: Omit<QueuedMessage, "id" | "queuedAt" | "retries">): Promise<void> {
  try {
    const outbox = await getOutbox();
    const queued: QueuedMessage = {
      ...msg,
      id: `outbox_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      queuedAt: new Date().toISOString(),
      retries: 0,
    };
    outbox.push(queued);
    await AsyncStorage.setItem(KEYS.OUTBOX, JSON.stringify(outbox));
  } catch (err) {
    console.error("[offline-store] Failed to queue message:", err);
  }
}

export async function getOutbox(): Promise<QueuedMessage[]> {
  try {
    const raw = await AsyncStorage.getItem(KEYS.OUTBOX);
    return raw ? JSON.parse(raw) : [];
  } catch (err) {
    console.error("[offline-store] Failed to read outbox:", err);
    return [];
  }
}

async function removeFromOutbox(id: string): Promise<void> {
  const outbox = await getOutbox();
  const filtered = outbox.filter((m) => m.id !== id);
  await AsyncStorage.setItem(KEYS.OUTBOX, JSON.stringify(filtered));
}

/**
 * Attempt to send all queued outbox messages.
 * Called automatically when network comes back online.
 */
export async function flushOutbox(): Promise<{ sent: number; failed: number }> {
  const outbox = await getOutbox();
  if (outbox.length === 0) return { sent: 0, failed: 0 };

  let sent = 0;
  let failed = 0;

  for (const msg of outbox) {
    try {
      await sendMessage({
        to: msg.to,
        phoneNumberId: msg.phoneNumberId,
        message: msg.message,
      });
      await removeFromOutbox(msg.id);
      sent++;
    } catch (err) {
      console.error(`[offline-store] Failed to send queued message ${msg.id}:`, err);
      // Increment retry count
      msg.retries++;
      if (msg.retries >= 5) {
        // Give up after 5 retries
        await removeFromOutbox(msg.id);
      }
      failed++;
    }
  }

  // Save updated retry counts for remaining messages
  const remaining = await getOutbox();
  if (remaining.length > 0) {
    await AsyncStorage.setItem(KEYS.OUTBOX, JSON.stringify(remaining));
  }

  return { sent, failed };
}

/**
 * Clear all cached data (e.g., on logout)
 */
export async function clearOfflineData(): Promise<void> {
  try {
    const keys = await AsyncStorage.getAllKeys();
    const smshubKeys = keys.filter((k) => k.startsWith("smshub:"));
    await AsyncStorage.multiRemove(smshubKeys);
  } catch (err) {
    console.error("[offline-store] Failed to clear offline data:", err);
  }
}
