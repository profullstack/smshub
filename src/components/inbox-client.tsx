"use client";

import { useState, useEffect, useRef } from "react";
import { failureReason } from "@/lib/message-status";
import { useInbox, type Conversation } from "@/hooks/use-inbox";
import { NewMessageModal } from "./new-message-modal";
import { ContactNameEditor } from "./contact-name-editor";
import { Logo } from "./logo";
import type { LineNumber } from "@/lib/inbox-lines";

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
      return <span className="text-red-300 ml-1" title="Failed">✗ Failed</span>;
    default:
      return null;
  }
}

export function InboxClient({
  conversations: initialConversations,
  numbers = [],
  userId: _userId,
}: {
  conversations: Conversation[];
  numbers?: LineNumber[];
  userId: string;
}) {
  const {
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
    getUnreadCount,
    handleSend,
    handleSuggestReply,
    handleArchive,
    handleDelete,
    handleLogout,
    reloadConversations,
    handleContactUpdated,
  } = useInbox(initialConversations, numbers);
  const [showNewMessage, setShowNewMessage] = useState(false);
  const [, setSelectedIndex] = useState(-1);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

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

  return (
    <div className="h-screen flex">
      {/* New Message Modal */}
      <NewMessageModal
        isOpen={showNewMessage}
        onClose={() => setShowNewMessage(false)}
        onSent={reloadConversations}
        defaultNumberId={activeLine?.id}
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
                href="/numbers"
                className="text-xs text-blue-400 hover:text-blue-300 font-medium"
                title="Rent a number for SMS and verification codes"
              >
                📱 Numbers
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

          {/* Line filter: one chip per number, e.g. one per family member */}
          {lines.length > 1 && (
            <div className="mt-2 flex flex-wrap gap-1.5" role="group" aria-label="Filter by line">
              {[{ id: null, label: "All lines", number: "", unread: totalUnread }, ...lines].map((line) => {
                const active = (activeLine?.id ?? null) === line.id;
                return (
                  <button
                    key={line.id ?? "all"}
                    onClick={() => chooseLine(line.id)}
                    aria-pressed={active}
                    title={line.number || "Every number"}
                    className={`max-w-full flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${
                      active
                        ? "bg-blue-600 text-white"
                        : "bg-gray-800 text-gray-400 hover:bg-gray-700 hover:text-gray-200"
                    }`}
                  >
                    <span className="truncate">{line.label}</span>
                    {line.unread > 0 && (
                      <span
                        className={`rounded-full px-1.5 text-[10px] leading-4 ${
                          active ? "bg-white text-blue-700" : "bg-blue-600 text-white"
                        }`}
                      >
                        {line.unread}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <div className="flex-1 overflow-y-auto">
          {filteredConversations.length === 0 ? (
            <div className="p-4 text-gray-500 text-center text-sm">
              {searchQuery
                ? "No matches"
                : showArchived
                  ? "No archived conversations"
                  : activeLine
                    ? `No conversations on ${activeLine.label} yet`
                    : "No conversations yet"}
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
                    {msg.routed_from && (
                      <p className="text-xs text-gray-400 mb-1">From {msg.routed_from}</p>
                    )}
                    <p className="text-sm">
                      {msg.kind === "call" && <span aria-label="Call">📞 </span>}
                      {msg.body}
                    </p>
                    {msg.kind === "call" && msg.recording_seconds != null && (
                      <div className="mt-2">
                        <audio controls preload="none" src={`/api/messages/${msg.id}/recording`} className="w-64 max-w-full" />
                        <a href={`/api/messages/${msg.id}/recording?download=1`} className="text-xs text-blue-300 hover:text-blue-200">
                          Download mp3
                        </a>
                      </div>
                    )}
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
                    {msg.direction === "outbound" && msg.status === "failed" && (
                      <p className="text-xs mt-1 text-red-200" role="status">
                        Not delivered{failureReason(msg) ? `: ${failureReason(msg)}` : ""}
                      </p>
                    )}
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
