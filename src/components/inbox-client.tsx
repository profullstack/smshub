"use client";

import { useState, useEffect, useRef } from "react";
import { createClient } from "@/lib/supabase/client";

interface Conversation {
  id: string;
  user_id: string;
  contact_id: string;
  phone_number_id: string;
  last_message_at: string;
  contacts: { id: string; phone: string; name: string | null } | null;
  phone_numbers: {
    id: string;
    number: string;
    friendly_name: string | null;
  } | null;
}

interface Message {
  id: string;
  conversation_id: string;
  direction: "inbound" | "outbound";
  body: string;
  status: string;
  created_at: string;
}

export function InboxClient({
  conversations: initialConversations,
  userId: _userId,
}: {
  conversations: Conversation[];
  userId: string;
}) {
  const [conversations] =
    useState<Conversation[]>(initialConversations);
  const [selectedConvo, setSelectedConvo] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState("");
  const [sending, setSending] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const supabase = createClient();

  // Load messages for selected conversation
  useEffect(() => {
    if (!selectedConvo) return;

    const loadMessages = async () => {
      const res = await fetch(
        `/api/messages?conversation_id=${selectedConvo.id}`
      );
      const data = await res.json();
      if (data.messages) setMessages(data.messages);
    };

    loadMessages();
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
          }
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
        // Message will arrive via realtime, but also fetch to be safe
        const msgRes = await fetch(
          `/api/messages?conversation_id=${selectedConvo.id}`
        );
        const data = await msgRes.json();
        if (data.messages) setMessages(data.messages);
      }
    } catch (error) {
      console.error("Failed to send:", error);
    } finally {
      setSending(false);
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    window.location.href = "/login";
  };

  return (
    <div className="h-screen flex">
      {/* Sidebar */}
      <div className="w-80 bg-gray-900 border-r border-gray-800 flex flex-col">
        <div className="p-4 border-b border-gray-800 flex items-center justify-between">
          <h1 className="text-xl font-bold">SMSHub</h1>
          <button
            onClick={handleLogout}
            className="text-sm text-gray-400 hover:text-gray-200"
          >
            Logout
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">
          {conversations.length === 0 ? (
            <div className="p-4 text-gray-500 text-center text-sm">
              No conversations yet
            </div>
          ) : (
            conversations.map((convo) => (
              <button
                key={convo.id}
                onClick={() => setSelectedConvo(convo)}
                className={`w-full p-4 text-left border-b border-gray-800 hover:bg-gray-800/50 transition-colors ${
                  selectedConvo?.id === convo.id ? "bg-gray-800" : ""
                }`}
              >
                <div className="font-medium">
                  {convo.contacts?.name || convo.contacts?.phone || "Unknown"}
                </div>
                <div className="text-sm text-gray-400">
                  {convo.phone_numbers?.friendly_name ||
                    convo.phone_numbers?.number}
                </div>
              </button>
            ))
          )}
        </div>
      </div>

      {/* Chat Area */}
      <div className="flex-1 flex flex-col">
        {selectedConvo ? (
          <>
            {/* Chat Header */}
            <div className="p-4 border-b border-gray-800 bg-gray-900">
              <div className="font-medium">
                {selectedConvo.contacts?.name ||
                  selectedConvo.contacts?.phone ||
                  "Unknown"}
              </div>
              <div className="text-sm text-gray-400">
                via{" "}
                {selectedConvo.phone_numbers?.friendly_name ||
                  selectedConvo.phone_numbers?.number}
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
                    <p className="text-sm">{msg.body}</p>
                    <p
                      className={`text-xs mt-1 ${
                        msg.direction === "outbound"
                          ? "text-blue-200"
                          : "text-gray-500"
                      }`}
                    >
                      {new Date(msg.created_at).toLocaleTimeString()}
                      {msg.direction === "outbound" && msg.status === "failed" && (
                        <span className="ml-1 text-red-300">• Failed</span>
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
                  type="submit"
                  disabled={sending || !newMessage.trim()}
                  className="px-6 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 rounded-full font-medium transition-colors"
                >
                  Send
                </button>
              </div>
            </form>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center text-gray-500">
            Select a conversation to start messaging
          </div>
        )}
      </div>
    </div>
  );
}
