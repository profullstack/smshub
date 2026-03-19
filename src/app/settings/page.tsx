"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useToast } from "@/contexts/toast-context";

interface ProviderRow {
  id: string;
  type: string;
  api_key: string;
  api_secret: string | null;
  created_at: string;
}

interface PhoneNumberRow {
  id: string;
  number: string;
  friendly_name: string | null;
  provider_id: string;
}

export default function SettingsPage() {
  const [providers, setProviders] = useState<ProviderRow[]>([]);
  const [phoneNumbers, setPhoneNumbers] = useState<PhoneNumberRow[]>([]);
  const [contacts, setContacts] = useState<{ id: string; phone: string; name: string | null }[]>([]);
  const [editingContact, setEditingContact] = useState<string | null>(null);
  const [editName, setEditName] = useState("");

  const loadContacts = async () => {
    try {
      const res = await fetch("/api/contacts");
      if (res.ok) {
        const data = await res.json();
        setContacts(data.contacts || []);
      }
    } catch {}
  };

  const [newProvider, setNewProvider] = useState({
    type: "twilio" as "twilio" | "telnyx" | "phonenumbers-bot",
    apiKey: "",
    apiSecret: "",
  });
  const [newNumber, setNewNumber] = useState({ number: "", providerId: "", friendlyName: "" });
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const { addToast } = useToast();

  useEffect(() => {
    loadData();
    loadContacts();
  }, []);

  const loadData = async () => {
    try {
      const [provRes, numRes] = await Promise.all([
        fetch("/api/providers"),
        fetch("/api/phone-numbers"),
      ]);

      if (provRes.status === 401 || numRes.status === 401) {
        router.push("/login");
        return;
      }

      if (provRes.ok) {
        const provData = await provRes.json();
        setProviders(provData.providers || []);
      }
      if (numRes.ok) {
        const numData = await numRes.json();
        setPhoneNumbers(numData.phone_numbers || []);
      }
    } catch {
      addToast("Failed to load settings data", "error");
    }
  };

  const addProvider = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const res = await fetch("/api/providers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: newProvider.type,
          api_key: newProvider.apiKey,
          api_secret: newProvider.apiSecret || null,
        }),
      });

      if (res.ok) {
        addToast("Provider added!", "success");
        setNewProvider({ type: "twilio", apiKey: "", apiSecret: "" });
        loadData();
      } else {
        const data = await res.json();
        addToast(data.error || "Failed to add provider", "error");
      }
    } catch {
      addToast("Failed to add provider", "error");
    }

    setLoading(false);
  };

  const deleteProvider = async (id: string) => {
    if (!confirm("Delete this provider? This will also remove associated phone numbers.")) return;

    try {
      const res = await fetch(`/api/providers/${id}`, { method: "DELETE" });
      if (res.ok) {
        addToast("Provider deleted", "success");
        loadData();
      } else {
        addToast("Failed to delete provider", "error");
      }
    } catch {
      addToast("Failed to delete provider", "error");
    }
  };

  const addPhoneNumber = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const res = await fetch("/api/phone-numbers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          number: newNumber.number,
          provider_id: newNumber.providerId,
          friendly_name: newNumber.friendlyName || null,
        }),
      });

      if (res.ok) {
        addToast("Phone number added!", "success");
        setNewNumber({ number: "", providerId: "", friendlyName: "" });
        loadData();
      } else {
        const data = await res.json();
        addToast(data.error || "Failed to add phone number", "error");
      }
    } catch {
      addToast("Failed to add phone number", "error");
    }

    setLoading(false);
  };

  const deletePhoneNumber = async (id: string) => {
    if (!confirm("Delete this phone number?")) return;

    try {
      const res = await fetch(`/api/phone-numbers/${id}`, { method: "DELETE" });
      if (res.ok) {
        addToast("Phone number deleted", "success");
        loadData();
      } else {
        addToast("Failed to delete phone number", "error");
      }
    } catch {
      addToast("Failed to delete phone number", "error");
    }
  };

  const getProviderForNumber = (providerId: string): ProviderRow | undefined => {
    return providers.find((p) => p.id === providerId);
  };

  return (
    <div className="min-h-screen bg-gray-950 p-8">
      <div className="max-w-2xl mx-auto space-y-8">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">Settings</h1>
          <Link href="/inbox" className="text-blue-400 hover:text-blue-300 text-sm">
            ← Back to Inbox
          </Link>
        </div>

        {/* Providers */}
        <section className="space-y-4">
          <h2 className="text-lg font-semibold">SMS Providers</h2>

          {providers.map((p) => (
            <div key={p.id} className="bg-gray-900 rounded-lg p-4 border border-gray-800">
              <div className="flex justify-between items-center">
                <div>
                  <span className="font-medium capitalize">{p.type}</span>
                  <span className="text-xs text-gray-500 ml-2">{p.id.slice(0, 8)}...</span>
                </div>
                <button
                  onClick={() => deleteProvider(p.id)}
                  className="text-red-400 hover:text-red-300 text-sm"
                >
                  Delete
                </button>
              </div>
              <div className="text-sm text-gray-400 mt-1">
                API Key: {p.api_key.slice(0, 8)}...
              </div>
            </div>
          ))}

          <form onSubmit={addProvider} className="bg-gray-900 rounded-lg p-4 border border-gray-800 space-y-3">
            <h3 className="font-medium">Add Provider</h3>
            <select
              value={newProvider.type}
              onChange={(e) => setNewProvider({ ...newProvider, type: e.target.value as "twilio" | "telnyx" | "phonenumbers-bot" })}
              className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg"
            >
              <option value="twilio">Twilio</option>
              <option value="telnyx">Telnyx</option>
              <option value="phonenumbers-bot">phonenumbers.bot</option>
            </select>
            <input
              type="text"
              placeholder={newProvider.type === "twilio" ? "Account SID" : "API Key"}
              value={newProvider.apiKey}
              onChange={(e) => setNewProvider({ ...newProvider, apiKey: e.target.value })}
              required
              className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg"
            />
            <input
              type="password"
              placeholder={newProvider.type === "twilio" ? "Auth Token" : "API Secret (optional)"}
              value={newProvider.apiSecret}
              onChange={(e) => setNewProvider({ ...newProvider, apiSecret: e.target.value })}
              className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg"
            />
            <button
              type="submit"
              disabled={loading}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg text-sm font-medium disabled:opacity-50"
            >
              Add Provider
            </button>
          </form>
        </section>

        {/* Phone Numbers */}
        <section className="space-y-4">
          <h2 className="text-lg font-semibold">Phone Numbers</h2>

          {phoneNumbers.map((pn) => {
            const provider = getProviderForNumber(pn.provider_id);
            return (
              <div key={pn.id} className="bg-gray-900 rounded-lg p-4 border border-gray-800">
                <div className="flex justify-between items-center">
                  <div>
                    <div className="font-medium">{pn.friendly_name || pn.number}</div>
                    <div className="text-sm text-gray-400">{pn.number}</div>
                    {provider && (
                      <div className="text-xs text-gray-500 mt-1">
                        Provider: <span className="capitalize">{provider.type}</span> ({provider.api_key.slice(0, 8)}...)
                      </div>
                    )}
                  </div>
                  <button
                    onClick={() => deletePhoneNumber(pn.id)}
                    className="text-red-400 hover:text-red-300 text-sm"
                  >
                    Delete
                  </button>
                </div>
              </div>
            );
          })}

          {providers.length > 0 && (
            <form onSubmit={addPhoneNumber} className="bg-gray-900 rounded-lg p-4 border border-gray-800 space-y-3">
              <h3 className="font-medium">Add Phone Number</h3>
              <select
                value={newNumber.providerId}
                onChange={(e) => setNewNumber({ ...newNumber, providerId: e.target.value })}
                required
                className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg"
              >
                <option value="">Select provider</option>
                {providers.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.type} ({p.api_key.slice(0, 8)}...)
                  </option>
                ))}
              </select>
              <input
                type="tel"
                placeholder="+1234567890"
                value={newNumber.number}
                onChange={(e) => setNewNumber({ ...newNumber, number: e.target.value })}
                required
                className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg"
              />
              <input
                type="text"
                placeholder="Friendly name (optional)"
                value={newNumber.friendlyName}
                onChange={(e) => setNewNumber({ ...newNumber, friendlyName: e.target.value })}
                className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg"
              />
              <button
                type="submit"
                disabled={loading}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg text-sm font-medium disabled:opacity-50"
              >
                Add Number
              </button>
            </form>
          )}
        </section>
        {/* Contacts */}
        <section className="space-y-4">
          <h2 className="text-lg font-semibold">Contacts</h2>

          {/* Add Contact */}
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              const form = e.target as HTMLFormElement;
              const phone = (form.elements.namedItem("phone") as HTMLInputElement).value.trim();
              const name = (form.elements.namedItem("contactName") as HTMLInputElement).value.trim();
              if (!phone) { addToast("Phone number is required", "error"); return; }

              try {
                const res = await fetch("/api/contacts", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ phone, name: name || null }),
                });
                if (res.ok) {
                  addToast(`Contact ${name || phone} added`, "success");
                  form.reset();
                  loadContacts();
                } else {
                  const data = await res.json();
                  addToast(data.error || "Failed to add contact", "error");
                }
              } catch {
                addToast("Failed to add contact", "error");
              }
            }}
            className="bg-gray-900 rounded-lg p-4 border border-gray-800 space-y-3"
          >
            <h3 className="font-medium">Add Contact</h3>
            <div className="flex gap-2">
              <input
                name="phone"
                type="tel"
                placeholder="+1234567890"
                required
                className="flex-1 px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm"
              />
              <input
                name="contactName"
                type="text"
                placeholder="Name (optional)"
                className="flex-1 px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm"
              />
              <button
                type="submit"
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg text-sm font-medium transition-colors whitespace-nowrap"
              >
                + Add
              </button>
            </div>
          </form>

          {/* Contact List */}
          {contacts.length > 0 && (
            <div className="space-y-2">
              {contacts.map((c) => (
                <div key={c.id} className="bg-gray-900 border border-gray-800 rounded-lg p-3 flex items-center justify-between">
                  {editingContact === c.id ? (
                    <div className="flex gap-2 flex-1">
                      <input
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        className="flex-1 px-2 py-1 bg-gray-800 border border-gray-700 rounded text-sm"
                        placeholder="Name"
                        autoFocus
                      />
                      <button
                        onClick={async () => {
                          const res = await fetch(`/api/contacts/${c.id}`, {
                            method: "PATCH",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ name: editName || null }),
                          });
                          if (res.ok) {
                            addToast("Contact updated", "success");
                            setEditingContact(null);
                            loadContacts();
                          } else {
                            addToast("Failed to update", "error");
                          }
                        }}
                        className="px-3 py-1 bg-blue-600 hover:bg-blue-700 rounded text-xs font-medium"
                      >
                        Save
                      </button>
                      <button
                        onClick={() => setEditingContact(null)}
                        className="px-3 py-1 bg-gray-700 hover:bg-gray-600 rounded text-xs"
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <>
                      <div>
                        <div className="font-medium text-sm">{c.name || c.phone}</div>
                        {c.name && <div className="text-xs text-gray-400">{c.phone}</div>}
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={() => { setEditingContact(c.id); setEditName(c.name || ""); }}
                          className="text-xs text-gray-400 hover:text-white"
                        >
                          Edit
                        </button>
                        <button
                          onClick={async () => {
                            if (!confirm(`Delete ${c.name || c.phone}?`)) return;
                            const res = await fetch(`/api/contacts/${c.id}`, { method: "DELETE" });
                            if (res.ok) {
                              addToast("Contact deleted", "success");
                              loadContacts();
                            } else {
                              addToast("Failed to delete", "error");
                            }
                          }}
                          className="text-xs text-red-400 hover:text-red-300"
                        >
                          Delete
                        </button>
                      </div>
                    </>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Import / Export */}
          <div className="bg-gray-900 rounded-lg p-4 border border-gray-800 space-y-3">
            <h3 className="font-medium">Import / Export</h3>
            <p className="text-sm text-gray-400">
              CSV format: phone,name
            </p>
            <div className="flex gap-3">
              <a
                href="/api/contacts/export"
                className="px-4 py-2 bg-green-600 hover:bg-green-700 rounded-lg text-sm font-medium transition-colors inline-block"
                download
              >
                ⬇ Export CSV
              </a>
              <label className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg text-sm font-medium transition-colors cursor-pointer">
                ⬆ Import CSV
                <input
                  type="file"
                  accept=".csv,text/csv"
                  className="hidden"
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    const formData = new FormData();
                    formData.append("file", file);
                    try {
                      const res = await fetch("/api/contacts/import", {
                        method: "POST",
                        body: formData,
                      });
                      const data = await res.json();
                      if (res.ok) {
                        addToast(
                          `Imported ${data.imported} contacts (${data.skipped} skipped)`,
                          "success"
                        );
                      } else {
                        addToast(data.error || "Import failed", "error");
                      }
                    } catch {
                      addToast("Import failed", "error");
                    }
                    e.target.value = "";
                  }}
                />
              </label>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
