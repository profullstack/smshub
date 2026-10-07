"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/contexts/toast-context";
import { buildLines, type LineNumber } from "@/lib/inbox-lines";

/**
 * The inbox's state and actions, shared by every brand's inbox UI: the line
 * filter, the live /api/stream feed, sending, archiving and deleting. The UIs
 * only decide how it looks.
 */

const LINE_KEY = "smshub.inbox.line";

export interface Conversation {
  id: string;
  user_id: string;
  contact_id: string;
  phone_number_id: string;
  last_message_at: string;
  last_read_at: string | null;
  archived: boolean;
  contacts: { id: string; phone: string; name: string | null } | null;
  phone_numbers: {
    id: string;
    number: string;
    friendly_name: string | null;
  } | null;
  unread_count?: number;
}

export interface Message {
  id: string;
  conversation_id: string;
  direction: "inbound" | "outbound";
  body: string;
  status: string;
  retry_count?: number;
  media_url?: string | null;
  error_code?: string | null;
  error_detail?: string | null;
  kind?: "sms" | "call";
  routed_from?: string | null;
  recording_seconds?: number | null;
  created_at: string;
}

export function useInbox(initialConversations: Conversation[], numbers: LineNumber[]) {
  const [conversations, setConversations] = useState<Conversation[]>(initialConversations);
  const [selectedConvo, setSelectedConvo] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const [suggestingReply, setSuggestingReply] = useState(false);
  // The line (phone number) the list is narrowed to; null shows every line.
  const [lineId, setLineId] = useState<string | null>(null);
  // Whether /api/stream is connected, for a live indicator.
  const [live, setLive] = useState(false);
  const supabase = createClient();
  const { addToast } = useToast();

  const lines = buildLines(numbers, conversations);
  const totalUnread = lines.reduce((sum, l) => sum + l.unread, 0);
  const activeLine = lines.find((l) => l.id === lineId) ?? null;

  // Remember the chosen line across visits, and forget one that no longer exists.
  useEffect(() => {
    const saved = window.localStorage.getItem(LINE_KEY);
    if (saved) setLineId(saved);
  }, []);
  const chooseLine = (id: string | null) => {
    setLineId(id);
    if (id) window.localStorage.setItem(LINE_KEY, id);
    else window.localStorage.removeItem(LINE_KEY);
  };

  // Filter conversations by line, search and archived status
  const filteredConversations = conversations.filter((convo) => {
    if (activeLine && convo.phone_number_id !== activeLine.id) return false;

    // Filter by archived status
    if (!showArchived && convo.archived) return false;
    if (showArchived && !convo.archived) return false;

    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    const name = convo.contacts?.name?.toLowerCase() || "";
    const phone = convo.contacts?.phone?.toLowerCase() || "";
    return name.includes(q) || phone.includes(q);
  });

  // Compute unread counts client-side
  const getUnreadCount = useCallback((convo: Conversation): number => {
    if (convo.unread_count !== undefined) return convo.unread_count;
    return 0;
  }, []);

  // Load messages for selected conversation
  useEffect(() => {
    if (!selectedConvo) return;

    const loadMessages = async () => {
      const res = await fetch(`/api/messages?conversation_id=${selectedConvo.id}`);
      const data = await res.json();
      if (data.messages) setMessages(data.messages);
    };

    loadMessages();

    // Mark as read
    fetch(`/api/conversations/${selectedConvo.id}/read`, { method: "POST" }).then(() => {
      setConversations((prev) =>
        prev.map((c) =>
          c.id === selectedConvo.id
            ? { ...c, last_read_at: new Date().toISOString(), unread_count: 0 }
            : c
        )
      );
    });
  }, [selectedConvo]);

  // Live updates from /api/stream (server-sent events). A text from a sender
  // we have no conversation with yet (the usual one-time-code case) reloads the
  // conversation list so it appears without a refresh.
  const selectedRef = useRef<Conversation | null>(null);
  selectedRef.current = selectedConvo;
  const conversationsRef = useRef<Conversation[]>(conversations);
  conversationsRef.current = conversations;

  useEffect(() => {
    const es = new EventSource("/api/stream");
    es.onopen = () => setLive(true);
    es.onerror = () => setLive(false);
    es.addEventListener("messages", (ev) => {
      const incoming = JSON.parse((ev as MessageEvent).data) as Message[];
      const current = selectedRef.current;
      let unknownConversation = false;
      for (const msg of incoming) {
        const known = conversationsRef.current.some((c) => c.id === msg.conversation_id);
        if (!known) unknownConversation = true;
        if (current && msg.conversation_id === current.id) {
          setMessages((prev) =>
            prev.some((m) => m.id === msg.id)
              ? prev.map((m) => (m.id === msg.id ? { ...m, ...msg } : m))
              : [...prev, msg]
          );
          if (msg.direction === "inbound") {
            fetch(`/api/conversations/${current.id}/read`, { method: "POST" });
          }
        } else if (known && msg.direction === "inbound") {
          setConversations((prev) =>
            prev.map((c) =>
              c.id === msg.conversation_id
                ? { ...c, unread_count: (c.unread_count || 0) + 1, last_message_at: msg.created_at }
                : c
            )
          );
        }
      }
      if (unknownConversation) {
        fetch("/api/conversations")
          .then((r) => (r.ok ? r.json() : null))
          .then((d) => d?.conversations && setConversations(d.conversations));
      }
    });
    return () => es.close();
  }, []);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim() || !selectedConvo) return;

    setSending(true);
    try {
      const res = await fetch("/api/messages/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          to: selectedConvo.contacts?.phone,
          phoneNumberId: selectedConvo.phone_number_id,
          message: newMessage,
        }),
      });

      if (res.ok) {
        setNewMessage("");
        addToast("Message sent!", "success");
        const msgRes = await fetch(`/api/messages?conversation_id=${selectedConvo.id}`);
        const data = await msgRes.json();
        if (data.messages) setMessages(data.messages);
      } else {
        const data = await res.json();
        addToast(data.error || "Failed to send message", "error");
      }
    } catch {
      addToast("Failed to send message", "error");
    } finally {
      setSending(false);
    }
  };

  const handleSuggestReply = async () => {
    if (!selectedConvo) return;
    setSuggestingReply(true);
    try {
      const res = await fetch("/api/messages/suggest-reply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversation_id: selectedConvo.id }),
      });
      if (res.ok) {
        const data = await res.json();
        setNewMessage(data.suggestion || "");
        addToast("AI suggestion loaded", "success");
      } else {
        const data = await res.json();
        addToast(data.error || "Failed to get suggestion", "error");
      }
    } catch {
      addToast("Failed to get AI suggestion", "error");
    } finally {
      setSuggestingReply(false);
    }
  };

  const handleArchive = async () => {
    if (!selectedConvo) return;
    const newArchived = !selectedConvo.archived;
    try {
      const res = await fetch(`/api/conversations/${selectedConvo.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ archived: newArchived }),
      });
      if (res.ok) {
        addToast(newArchived ? "Conversation archived" : "Conversation unarchived", "success");
        setConversations((prev) =>
          prev.map((c) => (c.id === selectedConvo.id ? { ...c, archived: newArchived } : c))
        );
        setSelectedConvo(null);
      }
    } catch {
      addToast("Failed to update conversation", "error");
    }
  };

  const handleDelete = async () => {
    if (!selectedConvo) return;
    if (!confirm("Delete this conversation? This cannot be undone.")) return;
    try {
      const res = await fetch(`/api/conversations/${selectedConvo.id}?hard=true`, {
        method: "DELETE",
      });
      if (res.ok) {
        addToast("Conversation deleted", "success");
        setConversations((prev) => prev.filter((c) => c.id !== selectedConvo.id));
        setSelectedConvo(null);
      }
    } catch {
      addToast("Failed to delete conversation", "error");
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    window.location.href = "/login";
  };

  const reloadConversations = async () => {
    const res = await fetch(`/api/conversations${showArchived ? "?archived=true" : ""}`);
    const data = await res.json();
    if (data.conversations) {
      setConversations(data.conversations);
    }
  };

  // Reload conversations when toggling archived view
  useEffect(() => {
    reloadConversations();
  }, [showArchived]);

  const handleContactUpdated = (newName: string) => {
    if (!selectedConvo) return;
    setConversations((prev) =>
      prev.map((c) =>
        c.id === selectedConvo.id && c.contacts
          ? { ...c, contacts: { ...c.contacts, name: newName } }
          : c
      )
    );
    setSelectedConvo((prev) =>
      prev && prev.contacts
        ? { ...prev, contacts: { ...prev.contacts, name: newName } }
        : prev
    );
  };

  return {
    conversations,
    filteredConversations,
    selectedConvo,
    setSelectedConvo,
    messages,
    newMessage,
    setNewMessage,
    sending,
    searchQuery,
    setSearchQuery,
    showArchived,
    setShowArchived,
    suggestingReply,
    lines,
    totalUnread,
    activeLine,
    chooseLine,
    live,
    getUnreadCount,
    handleSend,
    handleSuggestReply,
    handleArchive,
    handleDelete,
    handleLogout,
    reloadConversations,
    handleContactUpdated,
  };
}
