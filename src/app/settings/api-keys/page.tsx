"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useToast } from "@/contexts/toast-context";

interface ApiKeyRow {
  id: string;
  name: string;
  created_at: string;
  last_used_at: string | null;
  raw_key?: string;
}

export default function ApiKeysPage() {
  const [keys, setKeys] = useState<ApiKeyRow[]>([]);
  const [newKeyName, setNewKeyName] = useState("");
  const [newRawKey, setNewRawKey] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const supabase = createClient();
  const router = useRouter();
  const { addToast } = useToast();

  useEffect(() => {
    loadKeys();
  }, []);

  const loadKeys = async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      router.push("/login");
      return;
    }

    const res = await fetch("/api/api-keys");
    const data = await res.json();
    if (data.keys) setKeys(data.keys);
  };

  const createKey = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setNewRawKey(null);

    try {
      const res = await fetch("/api/api-keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newKeyName || "Default" }),
      });

      if (res.ok) {
        const data = await res.json();
        setNewRawKey(data.key.raw_key);
        setNewKeyName("");
        addToast("API key created!", "success");
        loadKeys();
      } else {
        addToast("Failed to create API key", "error");
      }
    } catch {
      addToast("Failed to create API key", "error");
    } finally {
      setLoading(false);
    }
  };

  const deleteKey = async (id: string) => {
    if (!confirm("Delete this API key? Any integrations using it will stop working."))
      return;

    try {
      const res = await fetch(`/api/api-keys/${id}`, { method: "DELETE" });
      if (res.ok) {
        addToast("API key deleted", "success");
        loadKeys();
      } else {
        addToast("Failed to delete API key", "error");
      }
    } catch {
      addToast("Failed to delete API key", "error");
    }
  };

  return (
    <div className="min-h-screen bg-gray-950 p-8">
      <div className="max-w-2xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">API Keys</h1>
          <Link
            href="/settings"
            className="text-blue-400 hover:text-blue-300 text-sm"
          >
            ← Back to Settings
          </Link>
        </div>

        <p className="text-sm text-gray-400">
          Use API keys to authenticate with the{" "}
          <code className="bg-gray-800 px-1 rounded">/api/v1/</code> endpoints.
          Include the key in the <code className="bg-gray-800 px-1 rounded">X-API-Key</code> header.
        </p>

        {/* New Key Form */}
        <form
          onSubmit={createKey}
          className="bg-gray-900 rounded-lg p-4 border border-gray-800 space-y-3"
        >
          <h3 className="font-medium">Create New API Key</h3>
          <input
            type="text"
            value={newKeyName}
            onChange={(e) => setNewKeyName(e.target.value)}
            placeholder="Key name (e.g. Production)"
            className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm"
          />
          <button
            type="submit"
            disabled={loading}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg text-sm font-medium disabled:opacity-50"
          >
            {loading ? "Creating..." : "Create Key"}
          </button>
        </form>

        {/* Show newly created key */}
        {newRawKey && (
          <div className="bg-yellow-900/30 border border-yellow-700 rounded-lg p-4">
            <p className="text-yellow-200 text-sm font-medium mb-2">
              ⚠️ Copy your API key now — it won&apos;t be shown again!
            </p>
            <code className="block bg-gray-800 p-3 rounded text-sm text-green-400 break-all">
              {newRawKey}
            </code>
          </div>
        )}

        {/* Existing Keys */}
        <div className="space-y-2">
          {keys.length === 0 ? (
            <p className="text-gray-500 text-sm text-center py-4">
              No API keys yet
            </p>
          ) : (
            keys.map((key) => (
              <div
                key={key.id}
                className="bg-gray-900 rounded-lg p-4 border border-gray-800 flex justify-between items-center"
              >
                <div>
                  <div className="font-medium text-sm">{key.name}</div>
                  <div className="text-xs text-gray-500 mt-1">
                    Created {new Date(key.created_at).toLocaleDateString()}
                    {key.last_used_at && (
                      <span>
                        {" "}
                        · Last used{" "}
                        {new Date(key.last_used_at).toLocaleDateString()}
                      </span>
                    )}
                  </div>
                </div>
                <button
                  onClick={() => deleteKey(key.id)}
                  className="text-red-400 hover:text-red-300 text-sm"
                >
                  Delete
                </button>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
