"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import Link from "next/link";

interface PhoneNumberRow {
  id: string;
  number: string;
  friendly_name: string | null;
}

interface ContactRow {
  id: string;
  phone: string;
  name: string | null;
}

export default function NewCampaignPage() {
  const [name, setName] = useState("");
  const [template, setTemplate] = useState("");
  const [phoneNumberId, setPhoneNumberId] = useState("");
  const [selectedContacts, setSelectedContacts] = useState<string[]>([]);
  const [phoneNumbers, setPhoneNumbers] = useState<PhoneNumberRow[]>([]);
  const [contacts, setContacts] = useState<ContactRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const supabase = createClient();
  const router = useRouter();

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      router.push("/login");
      return;
    }

    const [numRes, contactRes] = await Promise.all([
      supabase.from("phone_numbers").select("id, number, friendly_name").eq("user_id", user.id),
      supabase.from("contacts").select("id, phone, name").eq("user_id", user.id).order("name"),
    ]);

    if (numRes.data) setPhoneNumbers(numRes.data);
    if (contactRes.data) setContacts(contactRes.data);
  };

  const toggleContact = (id: string) => {
    setSelectedContacts((prev) =>
      prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id]
    );
  };

  const selectAll = () => {
    if (selectedContacts.length === contacts.length) {
      setSelectedContacts([]);
    } else {
      setSelectedContacts(contacts.map((c) => c.id));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!name || !template || !phoneNumberId || selectedContacts.length === 0) {
      setError("Please fill in all fields and select at least one contact");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/campaigns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          message_template: template,
          phone_number_id: phoneNumberId,
          contact_ids: selectedContacts,
        }),
      });

      if (res.ok) {
        router.push("/campaigns");
      } else {
        const data = await res.json();
        setError(data.error || "Failed to create campaign");
      }
    } catch {
      setError("Failed to create campaign");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-950 p-8">
      <div className="max-w-2xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">New Campaign</h1>
          <Link
            href="/campaigns"
            className="text-blue-400 hover:text-blue-300 text-sm"
          >
            ← Back to Campaigns
          </Link>
        </div>

        {error && (
          <div className="bg-red-900/50 border border-red-700 text-red-200 px-4 py-3 rounded-lg text-sm">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label className="block text-sm font-medium mb-2">
              Campaign Name
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Holiday Sale"
              required
              className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">
              Message Template
            </label>
            <textarea
              value={template}
              onChange={(e) => setTemplate(e.target.value)}
              placeholder="Type your message..."
              required
              rows={4}
              className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">
              Send From
            </label>
            <select
              value={phoneNumberId}
              onChange={(e) => setPhoneNumberId(e.target.value)}
              required
              className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg"
            >
              <option value="">Select phone number</option>
              {phoneNumbers.map((pn) => (
                <option key={pn.id} value={pn.id}>
                  {pn.friendly_name || pn.number}
                </option>
              ))}
            </select>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm font-medium">
                Recipients ({selectedContacts.length} selected)
              </label>
              <button
                type="button"
                onClick={selectAll}
                className="text-xs text-blue-400 hover:text-blue-300"
              >
                {selectedContacts.length === contacts.length
                  ? "Deselect All"
                  : "Select All"}
              </button>
            </div>
            <div className="max-h-60 overflow-y-auto bg-gray-900 border border-gray-800 rounded-lg">
              {contacts.length === 0 ? (
                <p className="p-4 text-gray-500 text-sm text-center">
                  No contacts found
                </p>
              ) : (
                contacts.map((contact) => (
                  <label
                    key={contact.id}
                    className="flex items-center gap-3 px-4 py-2 hover:bg-gray-800 cursor-pointer border-b border-gray-800 last:border-b-0"
                  >
                    <input
                      type="checkbox"
                      checked={selectedContacts.includes(contact.id)}
                      onChange={() => toggleContact(contact.id)}
                      className="rounded bg-gray-700 border-gray-600"
                    />
                    <div>
                      <div className="text-sm">
                        {contact.name || contact.phone}
                      </div>
                      {contact.name && (
                        <div className="text-xs text-gray-500">
                          {contact.phone}
                        </div>
                      )}
                    </div>
                  </label>
                ))
              )}
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full px-4 py-3 bg-blue-600 hover:bg-blue-700 rounded-lg font-medium disabled:opacity-50 transition-colors"
          >
            {loading ? "Creating..." : "Create Campaign"}
          </button>
        </form>
      </div>
    </div>
  );
}
