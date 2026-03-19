"use client";

import { useState, useRef, useEffect } from "react";
import { useToast } from "@/contexts/toast-context";

interface ContactNameEditorProps {
  contactId: string;
  currentName: string | null;
  phone: string;
  onUpdated: (newName: string) => void;
}

export function ContactNameEditor({ contactId, currentName, phone, onUpdated }: ContactNameEditorProps) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(currentName || "");
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const { addToast } = useToast();

  useEffect(() => {
    if (editing) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [editing]);

  const handleSave = async () => {
    const trimmed = name.trim();
    setSaving(true);
    try {
      const res = await fetch(`/api/contacts/${contactId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: trimmed || null }),
      });

      if (res.ok) {
        onUpdated(trimmed || phone);
        addToast("Contact updated", "success");
      } else {
        addToast("Failed to update contact", "error");
      }
    } catch {
      addToast("Failed to update contact", "error");
    } finally {
      setSaving(false);
      setEditing(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleSave();
    } else if (e.key === "Escape") {
      setName(currentName || "");
      setEditing(false);
    }
  };

  if (editing) {
    return (
      <input
        ref={inputRef}
        type="text"
        value={name}
        onChange={(e) => setName(e.target.value)}
        onBlur={handleSave}
        onKeyDown={handleKeyDown}
        disabled={saving}
        placeholder={phone}
        className="bg-gray-800 border border-gray-600 rounded px-2 py-0.5 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-blue-500 w-48"
      />
    );
  }

  return (
    <button
      onClick={() => setEditing(true)}
      className="font-medium hover:text-blue-400 transition-colors cursor-pointer"
      title="Click to edit name"
    >
      {currentName || phone}
    </button>
  );
}
