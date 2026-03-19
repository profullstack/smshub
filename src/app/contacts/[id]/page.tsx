"use client";

import { useState, useEffect, use } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useToast } from "@/contexts/toast-context";

interface ContactDetail {
  id: string;
  phone: string;
  name: string | null;
  email: string | null;
  company: string | null;
  notes: string | null;
  tags: string[] | null;
  last_contacted_at: string | null;
  created_at: string;
}

interface MessageRow {
  id: string;
  direction: string;
  body: string;
  status: string;
  created_at: string;
}

export default function ContactDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const [contact, setContact] = useState<ContactDetail | null>(null);
  const [messages, setMessages] = useState<MessageRow[]>([]);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({
    name: "",
    email: "",
    company: "",
    notes: "",
    tags: "",
  });
  const [saving, setSaving] = useState(false);
  const supabase = createClient();
  const router = useRouter();
  const { addToast } = useToast();

  useEffect(() => {
    loadContact();
  }, [id]);

  const loadContact = async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      router.push("/login");
      return;
    }

    const { data: contactData } = await supabase
      .from("contacts")
      .select("*")
      .eq("id", id)
      .eq("user_id", user.id)
      .single();

    if (!contactData) {
      router.push("/contacts");
      return;
    }

    const c = contactData as ContactDetail;
    setContact(c);
    setForm({
      name: c.name || "",
      email: c.email || "",
      company: c.company || "",
      notes: c.notes || "",
      tags: c.tags?.join(", ") || "",
    });

    // Get conversation history
    const { data: conversations } = await supabase
      .from("conversations")
      .select("id")
      .eq("contact_id", id)
      .eq("user_id", user.id);

    if (conversations && conversations.length > 0) {
      const convoIds = conversations.map((c) => c.id);
      const { data: msgs } = await supabase
        .from("messages")
        .select("id, direction, body, status, created_at")
        .in("conversation_id", convoIds)
        .order("created_at", { ascending: false })
        .limit(50);

      if (msgs) setMessages(msgs);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const tags = form.tags
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean);

      const res = await fetch(`/api/contacts/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name || null,
          email: form.email || null,
          company: form.company || null,
          notes: form.notes || null,
          tags,
        }),
      });

      if (res.ok) {
        addToast("Contact updated!", "success");
        setEditing(false);
        loadContact();
      } else {
        addToast("Failed to update contact", "error");
      }
    } catch {
      addToast("Failed to update contact", "error");
    } finally {
      setSaving(false);
    }
  };

  if (!contact) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center">
        <p className="text-gray-400">Loading...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-950 p-8">
      <div className="max-w-3xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">
            {contact.name || contact.phone}
          </h1>
          <div className="flex gap-3">
            <Link
              href="/contacts"
              className="text-blue-400 hover:text-blue-300 text-sm"
            >
              ← Back to Contacts
            </Link>
            <button
              onClick={() => setEditing(!editing)}
              className="text-sm text-gray-400 hover:text-gray-200"
            >
              {editing ? "Cancel" : "Edit"}
            </button>
          </div>
        </div>

        {/* Contact Info */}
        <div className="bg-gray-900 rounded-lg p-6 border border-gray-800 space-y-4">
          {editing ? (
            <>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Name</label>
                <input
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Email</label>
                <input
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Company</label>
                <input
                  value={form.company}
                  onChange={(e) => setForm({ ...form, company: e.target.value })}
                  className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Notes</label>
                <textarea
                  value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                  rows={3}
                  className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm resize-none"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">
                  Tags (comma separated)
                </label>
                <input
                  value={form.tags}
                  onChange={(e) => setForm({ ...form, tags: e.target.value })}
                  placeholder="vip, customer, lead"
                  className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm"
                />
              </div>
              <button
                onClick={handleSave}
                disabled={saving}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg text-sm font-medium disabled:opacity-50"
              >
                {saving ? "Saving..." : "Save"}
              </button>
            </>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <div className="text-xs text-gray-500">Phone</div>
                  <div className="text-sm">{contact.phone}</div>
                </div>
                {contact.email && (
                  <div>
                    <div className="text-xs text-gray-500">Email</div>
                    <div className="text-sm">{contact.email}</div>
                  </div>
                )}
                {contact.company && (
                  <div>
                    <div className="text-xs text-gray-500">Company</div>
                    <div className="text-sm">{contact.company}</div>
                  </div>
                )}
                {contact.last_contacted_at && (
                  <div>
                    <div className="text-xs text-gray-500">Last Contacted</div>
                    <div className="text-sm">
                      {new Date(contact.last_contacted_at).toLocaleString()}
                    </div>
                  </div>
                )}
              </div>
              {contact.notes && (
                <div>
                  <div className="text-xs text-gray-500">Notes</div>
                  <div className="text-sm text-gray-300 mt-1 whitespace-pre-wrap">
                    {contact.notes}
                  </div>
                </div>
              )}
              {contact.tags && contact.tags.length > 0 && (
                <div className="flex gap-1">
                  {contact.tags.map((tag) => (
                    <span
                      key={tag}
                      className="px-2 py-0.5 bg-gray-800 text-gray-300 rounded-full text-xs"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              )}
            </>
          )}
        </div>

        {/* Conversation History */}
        <div>
          <h2 className="text-lg font-semibold mb-3">Message History</h2>
          {messages.length === 0 ? (
            <p className="text-gray-500 text-sm">No messages yet</p>
          ) : (
            <div className="space-y-2">
              {messages.map((msg) => (
                <div
                  key={msg.id}
                  className="bg-gray-900 rounded-lg p-3 border border-gray-800"
                >
                  <div className="flex justify-between items-center">
                    <span
                      className={`text-xs font-medium ${
                        msg.direction === "inbound"
                          ? "text-green-400"
                          : "text-blue-400"
                      }`}
                    >
                      {msg.direction === "inbound" ? "← Received" : "→ Sent"}
                    </span>
                    <span className="text-xs text-gray-600">
                      {new Date(msg.created_at).toLocaleString()}
                    </span>
                  </div>
                  <p className="text-sm mt-1">{msg.body}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
