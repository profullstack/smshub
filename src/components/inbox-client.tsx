"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/contexts/toast-context";
import { NewMessageModal } from "./new-message-modal";
import { ContactNameEditor } from "./contact-name-editor";
import { Logo } from "./logo";

interface Conversation {
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

interface Message {
  id: string;
  conversation_id: string;
  direction: "inbound" | "outbound";
  body: string;
  status: string;
  retry_count?: number;
  media_url?: string | null;
  created_at: string;
}

function MessageStatusIcon({ status, retryCount }: { status: string; retryCount?: number }) {
  if (status === "failed" && retryCount && retryCount > 0) {
    return <span className="text-orange-400 ml-1" title={`Retried ${retryCount}x`}>⟳ Failed</span>;
  }
  switch (status) {
    case "delivered":
      return <span className="text-green-400 ml-1" title="Delivered">✓✓</span>;
    case "sent":
      return <span className="text-blue-300 ml-1" title="Sent">✓</span>;
    case "queued":
      return <span className="text-gray-400 ml-1" title="Queued">◷</span>;
    case "failed":
      return <span className="text-red-400 ml-1" title="Failed">✗</span>;
    default:
      return null;
  }
}

export function InboxClient({
  conversations: initialConversations,
  userId: _userId,
}: {
  conversations: Conversation[];
  userId: string;
}) {
  const [conversations, setConversations] = useState<Conversation[]>(initialConversations);
  const [selectedConvo, setSelectedConvo] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [showNewMessage, setShowNewMessage] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const [suggestingReply, setSuggestingReply] = useState(false);
  const [, setSelectedIndex] = useState(-1);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const supabase = createClient();
  const { addToast } = useToast();

  // Filter conversations by search and archived status
  const filteredConversations = conversations.filter((convo) => {
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

  // Realtime subscription for new messages
  useEffect(() => {
    const channel = supabase
      .channel("messages-realtime")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages" },
        (payload) => {
          const newMsg = payload.new as Message;
          if (selectedConvo && newMsg.conversation_id === selectedConvo.id) {
            setMessages((prev) => [...prev, newMsg]);
            // Auto mark-read since we're viewing
            fetch(`/api/conversations/${selectedConvo.id}/read`, { method: "POST" });
          } else {
            // Increment unread count for other conversations
            setConversations((prev) =>
              prev.map((c) =>
                c.id === newMsg.conversation_id
                  ? { ...c, unread_count: (c.unread_count || 0) + 1 }
                  : c
              )
            );
          }
        }
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "messages" },
        (payload) => {
          const updated = payload.new as Message;
          setMessages((prev) =>
            prev.map((m) => (m.id === updated.id ? updated : m))
          );
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [selectedConvo, supabase]);

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ctrl+N: New message
      if ((e.ctrlKey || e.metaKey) && e.key === "n") {
        e.preventDefault();
        setShowNewMessage(true);
        return;
      }

      // Ctrl+K: Focus search
      if ((e.ctrlKey || e.metaKey) && e.key === "k") {
        e.preventDefault();
        searchRef.current?.focus();
        return;
      }

      // Escape: Close modals / clear search
      if (e.key === "Escape") {
        if (showNewMessage) {
          setShowNewMessage(false);
        } else if (searchQuery) {
          setSearchQuery("");
        }
        return;
      }

      // Arrow keys for conversation navigation (only when not typing)
      const active = document.activeElement;
      const isInput = active?.tagName === "INPUT" || active?.tagName === "TEXTAREA";
      if (!isInput) {
        if (e.key === "ArrowDown") {
          e.preventDefault();
          setSelectedIndex((prev) => {
            const next = Math.min(prev + 1, filteredConversations.length - 1);
            if (filteredConversations[next]) {
              setSelectedConvo(filteredConversations[next]);
            }
            return next;
          });
        } else if (e.key === "ArrowUp") {
          e.preventDefault();
          setSelectedIndex((prev) => {
            const next = Math.max(prev - 1, 0);
            if (filteredConversations[next]) {
              setSelectedConvo(filteredConversations[next]);
            }
            return next;
          });
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [showNewMessage, searchQuery, filteredConversations]);

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

  return (
    <div className="h-screen flex">
      {/* New Message Modal */}
      <NewMessageModal
        isOpen={showNewMessage}
        onClose={() => setShowNewMessage(false)}
        onSent={reloadConversations}
      />

      {/* Sidebar */}
      <div className="w-80 bg-gray-900 border-r border-gray-800 flex flex-col">
        <div className="p-4 border-b border-gray-800">
          <div className="flex items-center justify-between mb-3">
            <Logo
              imageClassName="h-16 w-auto"
              className="flex items-center gap-3"
            />
            <div className="flex items-center gap-2">
              <a
                href="/phonenumbers"
                className="text-xs text-blue-400 hover:text-blue-300 font-medium"
                title="phonenumbers.bot — Real SIM API"
              >
                📱 API
              </a>
              <a
                href="/settings"
                className="text-sm text-gray-400 hover:text-gray-200"
                title="Settings"
              >
                ⚙️
              </a>
              <button
                onClick={handleLogout}
                className="text-sm text-gray-400 hover:text-gray-200"
              >
                Logout
              </button>
            </div>
          </div>

          {/* New Message Button */}
          <button
            onClick={() => setShowNewMessage(true)}
            className="w-full mb-3 px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg font-medium text-sm transition-colors"
          >
            + New Message
          </button>

          {/* Search */}
          <input
            ref={searchRef}
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search conversations... (Ctrl+K)"
            className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />

          {/* Show Archived Toggle */}
          <button
            onClick={() => setShowArchived(!showArchived)}
            className={`w-full mt-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              showArchived
                ? "bg-yellow-600/20 text-yellow-400 hover:bg-yellow-600/30"
                : "bg-gray-800 text-gray-400 hover:bg-gray-700"
            }`}
          >
            {showArchived ? "📦 Showing Archived" : "📦 Show Archived"}
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">
          {filteredConversations.length === 0 ? (
            <div className="p-4 text-gray-500 text-center text-sm">
              {searchQuery ? "No matches" : showArchived ? "No archived conversations" : "No conversations yet"}
            </div>
          ) : (
            filteredConversations.map((convo, index) => {
              const unread = getUnreadCount(convo);
              return (
                <button
                  key={convo.id}
                  onClick={() => {
                    setSelectedConvo(convo);
                    setSelectedIndex(index);
                  }}
                  className={`w-full p-4 text-left border-b border-gray-800 hover:bg-gray-800/50 transition-colors flex items-center gap-3 ${
                    selectedConvo?.id === convo.id ? "bg-gray-800" : ""
                  }`}
                >
                  <div className="flex-1 min-w-0">
                    <div className={`font-medium truncate ${unread > 0 ? "text-white" : ""}`}>
                      {convo.contacts?.name || convo.contacts?.phone || "Unknown"}
                      {convo.archived && <span className="text-xs text-yellow-500 ml-1">📦</span>}
                    </div>
                    <div className="text-sm text-gray-400 truncate">
                      {convo.phone_numbers?.friendly_name || convo.phone_numbers?.number}
                    </div>
                  </div>
                  {unread > 0 && (
                    <span className="bg-blue-600 text-white text-xs font-bold rounded-full min-w-[20px] h-5 flex items-center justify-center px-1.5">
                      {unread}
                    </span>
                  )}
                </button>
              );
            })
          )}
        </div>
      </div>

      {/* Chat Area */}
      <div className="flex-1 flex flex-col">
        {selectedConvo ? (
          <>
            {/* Chat Header */}
            <div className="p-4 border-b border-gray-800 bg-gray-900">
              <div className="flex items-center justify-between">
                <div>
                  <ContactNameEditor
                    contactId={selectedConvo.contacts?.id || ""}
                    currentName={selectedConvo.contacts?.name || null}
                    phone={selectedConvo.contacts?.phone || "Unknown"}
                    onUpdated={handleContactUpdated}
                  />
                  <div className="text-sm text-gray-400">
                    via{" "}
                    {selectedConvo.phone_numbers?.friendly_name ||
                      selectedConvo.phone_numbers?.number}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={handleArchive}
                    className="px-3 py-1.5 bg-gray-800 hover:bg-gray-700 rounded-lg text-xs font-medium text-gray-300 transition-colors"
                    title={selectedConvo.archived ? "Unarchive" : "Archive"}
                  >
                    {selectedConvo.archived ? "📤 Unarchive" : "📦 Archive"}
                  </button>
                  <button
                    onClick={handleDelete}
                    className="px-3 py-1.5 bg-red-900/50 hover:bg-red-800/50 rounded-lg text-xs font-medium text-red-400 transition-colors"
                    title="Delete conversation"
                  >
                    🗑 Delete
                  </button>
                </div>
              </div>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {messages.map((msg) => (
                <div
                  key={msg.id}
                  className={`flex ${
                    msg.direction === "outbound" ? "justify-end" : "justify-start"
                  }`}
                >
                  <div
                    className={`max-w-xs lg:max-w-md px-4 py-2 rounded-2xl ${
                      msg.direction === "outbound"
                        ? "bg-blue-600 text-white"
                        : "bg-gray-800 text-gray-100"
                    }`}
                  >
                    {/* MMS image */}
                    {msg.media_url && (
                      <div className="mb-2">
                        <img
                          src={msg.media_url}
                          alt="MMS attachment"
                          className="max-w-full rounded-lg cursor-pointer"
                          onClick={() => window.open(msg.media_url!, "_blank")}
                        />
                      </div>
                    )}
                    <p className="text-sm">{msg.body}</p>
                    <p
                      className={`text-xs mt-1 flex items-center ${
                        msg.direction === "outbound"
                          ? "text-blue-200"
                          : "text-gray-500"
                      }`}
                    >
                      {new Date(msg.created_at).toLocaleTimeString()}
                      {msg.direction === "outbound" && (
                        <MessageStatusIcon status={msg.status} retryCount={msg.retry_count} />
                      )}
                    </p>
                  </div>
                </div>
              ))}
              <div ref={messagesEndRef} />
            </div>

            {/* Input */}
            <form
              onSubmit={handleSend}
              className="p-4 border-t border-gray-800 bg-gray-900"
            >
              <div className="flex gap-2">
                <input
                  type="text"
                  value={newMessage}
                  onChange={(e) => setNewMessage(e.target.value)}
                  placeholder="Type a message..."
                  className="flex-1 px-4 py-2 bg-gray-800 border border-gray-700 rounded-full focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <button
                  type="button"
                  onClick={handleSuggestReply}
                  disabled={suggestingReply || messages.length === 0}
                  className="px-3 py-2 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 rounded-full text-sm font-medium transition-colors"
                  title="AI Suggest Reply"
                >
                  {suggestingReply ? "..." : "✨ AI"}
                </button>
                <button
                  type="submit"
                  disabled={sending || !newMessage.trim()}
                  className="px-6 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 rounded-full font-medium transition-colors"
                >
                  {sending ? "Sending..." : "Send"}
                </button>
              </div>
            </form>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center text-gray-500">
            <div className="text-center">
              <p>Select a conversation to start messaging</p>
              <p className="text-sm mt-2 text-gray-600">
                or press <kbd className="bg-gray-800 px-1.5 py-0.5 rounded text-xs">Ctrl+N</kbd> for new message
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
