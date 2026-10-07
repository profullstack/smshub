"use client";

import { useEffect, useRef, useState } from "react";

const MAX_LINE_NAME = 60;

/**
 * Click-to-rename for a number's friendly_name, the label it gets as a line in
 * the inbox ("Mom", "Kid's phone"). Saving an empty name clears it.
 */
export function LineNameEditor({
  numberId,
  number,
  name,
  onSaved,
  onError,
}: {
  numberId: string;
  number: string;
  name: string | null;
  onSaved: (name: string | null) => void;
  onError: (message: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(name || "");
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [editing]);

  const save = async () => {
    const next = value.trim();
    if (next === (name || "")) {
      setEditing(false);
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(`/api/phone-numbers/${numberId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ friendly_name: next || null }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error || "Could not rename the line");
      onSaved(j.phone_number?.friendly_name ?? null);
    } catch (e) {
      setValue(name || "");
      onError(e instanceof Error ? e.message : "Could not rename the line");
    } finally {
      setSaving(false);
      setEditing(false);
    }
  };

  if (editing) {
    return (
      <input
        ref={inputRef}
        value={value}
        maxLength={MAX_LINE_NAME}
        onChange={(e) => setValue(e.target.value)}
        onBlur={save}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            save();
          } else if (e.key === "Escape") {
            setValue(name || "");
            setEditing(false);
          }
        }}
        disabled={saving}
        placeholder="Name this line, e.g. Mom"
        aria-label={`Name for ${number}`}
        className="w-56 rounded border border-gray-600 bg-gray-800 px-2 py-0.5 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-blue-500"
      />
    );
  }

  return (
    <button
      onClick={() => setEditing(true)}
      title="Rename this line"
      className="group inline-flex items-center gap-1.5 font-medium hover:text-blue-400"
    >
      {name ? <span>{name}</span> : <span className="text-gray-500 italic">Name this line</span>}
      <span className="text-xs text-gray-500 group-hover:text-blue-400">✏️</span>
    </button>
  );
}
