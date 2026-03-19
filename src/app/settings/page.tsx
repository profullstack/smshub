"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
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
  const [newProvider, setNewProvider] = useState({
    type: "twilio" as "twilio" | "telnyx",
    apiKey: "",
    apiSecret: "",
  });
  const [newNumber, setNewNumber] = useState({ number: "", providerId: "", friendlyName: "" });
  const [loading, setLoading] = useState(false);
  const supabase = createClient();
  const router = useRouter();
  const { addToast } = useToast();

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { router.push("/login"); return; }

    const [provRes, numRes] = await Promise.all([
      supabase.from("providers").select("*").eq("user_id", user.id),
      supabase.from("phone_numbers").select("*").eq("user_id", user.id),
    ]);

    if (provRes.data) setProviders(provRes.data);
    if (numRes.data) setPhoneNumbers(numRes.data);
  };

  const addProvider = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { error } = await supabase.from("providers").insert({
      user_id: user.id,
      type: newProvider.type,
      api_key: newProvider.apiKey,
      api_secret: newProvider.apiSecret || null,
    });

    if (error) {
      addToast("Failed to add provider", "error");
    } else {
      addToast("Provider added!", "success");
      setNewProvider({ type: "twilio", apiKey: "", apiSecret: "" });
    }
    setLoading(false);
    loadData();
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
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { error } = await supabase.from("phone_numbers").insert({
      user_id: user.id,
      provider_id: newNumber.providerId,
      number: newNumber.number,
      friendly_name: newNumber.friendlyName || null,
    });

    if (error) {
      addToast("Failed to add phone number", "error");
    } else {
      addToast("Phone number added!", "success");
      setNewNumber({ number: "", providerId: "", friendlyName: "" });
    }
    setLoading(false);
    loadData();
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
          <Link href="/" className="text-blue-400 hover:text-blue-300 text-sm">
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
              onChange={(e) => setNewProvider({ ...newProvider, type: e.target.value as "twilio" | "telnyx" })}
              className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg"
            >
              <option value="twilio">Twilio</option>
              <option value="telnyx">Telnyx</option>
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
      </div>
    </div>
  );
}
