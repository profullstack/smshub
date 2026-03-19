import { supabase } from "./supabase";
import { API_URL } from "./constants";

/**
 * Make an authenticated API call to the web app backend
 */
async function authFetch(path: string, options: RequestInit = {}) {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) {
    throw new Error("Not authenticated");
  }

  const res = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${session.access_token}`,
      ...options.headers,
    },
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `API error: ${res.status}`);
  }

  return res.json();
}

/**
 * Send an SMS message
 */
export async function sendMessage(params: {
  to: string;
  phoneNumberId: string;
  message: string;
}) {
  return authFetch("/api/messages/send", {
    method: "POST",
    body: JSON.stringify(params),
  });
}

/**
 * Get conversations list
 */
export async function getConversations() {
  return authFetch("/api/conversations");
}

/**
 * Get messages for a conversation
 */
export async function getMessages(conversationId: string) {
  return authFetch(`/api/messages?conversation_id=${conversationId}`);
}
