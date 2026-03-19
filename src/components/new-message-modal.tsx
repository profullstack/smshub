"use client";

import { useState, useEffect, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/contexts/toast-context";

interface PhoneNumber {
  id: string;
  number: string;
  friendly_name: string | null;
}

interface NewMessageModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSent: () => void;
}

export function NewMessageModal({ isOpen, onClose, onSent }: NewMessageModalProps) {
  const [phoneNumbers, setPhoneNumbers] = useState<PhoneNumber[]>([]);
  const [selectedNumberId, setSelectedNumberId] = useState("");
  const [recipientPhone, setRecipientPhone] = useState("");
  const [messageBody, setMessageBody] = useState("");
  const [sending, setSending] = useState(false);
  const recipientRef = useRef<HTMLInputElement>(null);
  const supabase = createClient();
  const { addToast } = useToast();

  useEffect(() => {
    if (!isOpen) return;

    const loadNumbers = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data } = await supabase
        .from("phone_numbers")
        .select("id, number, friendly_name")
        .eq("user_id", user.id);
      if (data) {
        setPhoneNumbers(data);
        if (data.length > 0 && !selectedNumberId) {
          setSelectedNumberId(data[0].id);
        }
      }
    };

    loadNumbers();
    setTimeout(() => recipientRef.current?.focus(), 100);
  }, [isOpen, supabase, selectedNumberId]);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!recipientPhone.trim() || !messageBody.trim() || !selectedNumberId) return;

    setSending(true);
    try {
      const res = await fetch("/api/messages/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          to: recipientPhone.trim(),
          phoneNumberId: selectedNumberId,
          message: messageBody.trim(),
        }),
      });

      if (res.ok) {
        addToast("Message sent!", "success");
        setRecipientPhone("");
        setMessageBody("");
        onSent();
        onClose();
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

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/60" onClick={onClose}>
      <div
        className="bg-gray-900 border border-gray-700 rounded-xl p-6 w-full max-w-md shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">New Message</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-200 text-xl leading-none">
            ×
          </button>
        </div>

        <form onSubmit={handleSend} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">From</label>
            <select
              value={selectedNumberId}
              onChange={(e) => setSelectedNumberId(e.target.value)}
              required
              className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg"
            >
              {phoneNumbers.length === 0 && <option value="">No numbers configured</option>}
              {phoneNumbers.map((pn) => (
                <option key={pn.id} value={pn.id}>
                  {pn.friendly_name || pn.number}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">To</label>
            <input
              ref={recipientRef}
              type="tel"
              value={recipientPhone}
              onChange={(e) => setRecipientPhone(e.target.value)}
              placeholder="+1234567890"
              required
              className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">Message</label>
            <textarea
              value={messageBody}
              onChange={(e) => setMessageBody(e.target.value)}
              placeholder="Type your message..."
              rows={3}
              required
              className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
            />
          </div>

          <div className="flex gap-2 justify-end">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-gray-300 hover:text-white transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={sending || !recipientPhone.trim() || !messageBody.trim() || !selectedNumberId}
              className="px-6 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 rounded-lg font-medium transition-colors"
            >
              {sending ? "Sending..." : "Send"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
