"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useToast } from "@/contexts/toast-context";
import { WEBHOOK_EVENT_DOCS, WEBHOOK_EVENT_TYPES } from "@/lib/webhooks/catalog";

interface Endpoint {
  id: string;
  url: string;
  events: string[];
  description: string;
  enabled: boolean;
  failures: number;
  disabled_reason: string | null;
  created_at: string;
}

interface Delivery {
  id: string;
  endpoint_id: string;
  event_type: string;
  status: "pending" | "delivered" | "failed";
  attempts: number;
  last_status: number | null;
  last_error: string | null;
  created_at: string;
}

const API = "/api/v1/webhooks";

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(data.error || `HTTP ${res.status}`), { status: res.status });
  return data as T;
}

export default function WebhooksPage() {
  const router = useRouter();
  const { addToast } = useToast();
  const [endpoints, setEndpoints] = useState<Endpoint[]>([]);
  const [deliveries, setDeliveries] = useState<Delivery[]>([]);
  const [url, setUrl] = useState("");
  const [description, setDescription] = useState("");
  const [events, setEvents] = useState<string[]>(["message.received"]);
  const [shownSecret, setShownSecret] = useState<{ id: string; secret: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const [list, log] = await Promise.all([
        call<{ endpoints: Endpoint[] }>(""),
        call<{ deliveries: Delivery[] }>("/deliveries?limit=20"),
      ]);
      setEndpoints(list.endpoints);
      setDeliveries(log.deliveries);
    } catch (e) {
      if ((e as { status?: number }).status === 401) router.push("/login");
      else addToast((e as Error).message, "error");
    }
  }, [router, addToast]);

  useEffect(() => {
    load();
  }, [load]);

  const toggleEvent = (t: string) =>
    setEvents((cur) => (cur.includes(t) ? cur.filter((x) => x !== t) : [...cur, t]));

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const r = await call<{ endpoint: Endpoint; secret: string }>("", {
        method: "POST",
        body: JSON.stringify({ url, description, events: events.length ? events : ["*"] }),
      });
      setShownSecret({ id: r.endpoint.id, secret: r.secret });
      setUrl("");
      setDescription("");
      addToast("Webhook added", "success");
      load();
    } catch (err) {
      addToast((err as Error).message, "error");
    } finally {
      setBusy(false);
    }
  };

  const act = async (label: string, fn: () => Promise<unknown>) => {
    try {
      await fn();
      addToast(label, "success");
      load();
    } catch (err) {
      addToast((err as Error).message, "error");
    }
  };

  const test = (id: string) =>
    act("Test sent", async () => {
      const r = await call<{ ok: boolean; status: number | null; error: string | null }>(`/${id}/test`, { method: "POST" });
      if (!r.ok) throw new Error(`Test failed: ${r.status ?? ""} ${r.error ?? ""}`.trim());
    });

  const rotate = async (id: string) => {
    if (!confirm("Replace the signing secret? The old one stops working at once.")) return;
    try {
      const r = await call<{ secret: string }>(`/${id}/rotate`, { method: "POST" });
      setShownSecret({ id, secret: r.secret });
    } catch (err) {
      addToast((err as Error).message, "error");
    }
  };

  const reveal = async (id: string) => {
    try {
      const r = await call<{ secret: string }>(`/${id}/secret`);
      setShownSecret({ id, secret: r.secret });
    } catch (err) {
      addToast((err as Error).message, "error");
    }
  };

  const remove = (id: string) => {
    if (!confirm("Remove this webhook and its delivery log?")) return;
    act("Webhook removed", () => call(`/${id}`, { method: "DELETE" }));
  };

  return (
    <div className="min-h-screen bg-gray-950 p-8">
      <div className="max-w-2xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">Webhooks</h1>
          <Link href="/settings" className="text-blue-400 hover:text-blue-300 text-sm">
            ← Back to Settings
          </Link>
        </div>

        <p className="text-sm text-gray-400">
          smshub POSTs each event to your URL as signed JSON (Standard Webhooks), and retries for about three days if
          your server is down. The most useful one is <code className="bg-gray-800 px-1 rounded">message.received</code>:
          every text on your numbers, with any one-time code pulled out. How to verify a delivery:{" "}
          <Link href="/docs/api#webhooks" className="text-blue-400">API docs → Webhooks</Link>.
        </p>

        <form onSubmit={create} className="bg-gray-900 rounded-lg p-4 border border-gray-800 space-y-3">
          <h3 className="font-medium">Add a webhook</h3>
          <input
            type="url"
            required
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://example.com/smshub"
            className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm"
          />
          <input
            type="text"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Description (optional)"
            className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm"
          />
          <fieldset className="space-y-1">
            <legend className="text-xs text-gray-400 mb-1">Events (none ticked = all)</legend>
            {WEBHOOK_EVENT_TYPES.map((t) => (
              <label key={t} className="flex items-start gap-2 text-sm">
                <input type="checkbox" className="mt-1" checked={events.includes(t)} onChange={() => toggleEvent(t)} />
                <span>
                  <code className="text-gray-200">{t}</code>{" "}
                  <span className="text-xs text-gray-500">{WEBHOOK_EVENT_DOCS[t]}</span>
                </span>
              </label>
            ))}
          </fieldset>
          <button
            type="submit"
            disabled={busy}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg text-sm font-medium disabled:opacity-50"
          >
            {busy ? "Adding..." : "Add webhook"}
          </button>
        </form>

        {shownSecret && (
          <div className="bg-yellow-900/30 border border-yellow-700 rounded-lg p-4 space-y-2">
            <p className="text-yellow-200 text-sm font-medium">
              Signing secret for {shownSecret.id}. Keep it on your server; anyone with it can forge deliveries.
            </p>
            <code className="block bg-gray-800 p-3 rounded text-sm text-green-400 break-all">{shownSecret.secret}</code>
            <button onClick={() => setShownSecret(null)} className="text-xs text-gray-400 hover:text-gray-200">
              Hide
            </button>
          </div>
        )}

        <div className="space-y-2">
          {endpoints.length === 0 ? (
            <p className="text-gray-500 text-sm text-center py-4">No webhooks yet</p>
          ) : (
            endpoints.map((ep) => (
              <div key={ep.id} className="bg-gray-900 rounded-lg p-4 border border-gray-800 space-y-2">
                <div className="flex justify-between items-start gap-3">
                  <div className="min-w-0">
                    <div className="font-mono text-sm break-all">{ep.url}</div>
                    <div className="text-xs text-gray-500 mt-1">
                      {ep.id} · {ep.events.join(", ")}
                      {ep.description ? ` · ${ep.description}` : ""}
                    </div>
                    {!ep.enabled && (
                      <div className="text-xs text-red-400 mt-1">Off{ep.disabled_reason ? `: ${ep.disabled_reason}` : ""}</div>
                    )}
                    {ep.enabled && ep.failures > 0 && (
                      <div className="text-xs text-yellow-400 mt-1">{ep.failures} failed deliveries in a row</div>
                    )}
                  </div>
                  <button
                    onClick={() =>
                      act(ep.enabled ? "Webhook off" : "Webhook on", () =>
                        call(`/${ep.id}`, { method: "PATCH", body: JSON.stringify({ enabled: !ep.enabled }) })
                      )
                    }
                    className={`shrink-0 text-xs px-2 py-1 rounded border ${ep.enabled ? "border-green-700 text-green-400" : "border-gray-700 text-gray-400"}`}
                  >
                    {ep.enabled ? "On" : "Off"}
                  </button>
                </div>
                <div className="flex flex-wrap gap-3 text-sm">
                  <button onClick={() => test(ep.id)} className="text-blue-400 hover:text-blue-300">Send test</button>
                  <button onClick={() => reveal(ep.id)} className="text-blue-400 hover:text-blue-300">Show secret</button>
                  <button onClick={() => rotate(ep.id)} className="text-blue-400 hover:text-blue-300">Rotate secret</button>
                  <button onClick={() => remove(ep.id)} className="text-red-400 hover:text-red-300">Remove</button>
                </div>
              </div>
            ))
          )}
        </div>

        {deliveries.length > 0 && (
          <section className="space-y-2">
            <h2 className="text-lg font-semibold">Recent deliveries</h2>
            {deliveries.map((d) => (
              <div key={d.id} className="flex flex-wrap items-center justify-between gap-2 text-xs bg-gray-900 border border-gray-800 rounded-lg px-3 py-2">
                <span className="font-mono text-gray-200">{d.event_type}</span>
                <span className={d.status === "delivered" ? "text-green-400" : d.status === "failed" ? "text-red-400" : "text-yellow-400"}>
                  {d.status}
                  {d.last_status ? ` ${d.last_status}` : ""}
                  {d.attempts > 1 ? ` after ${d.attempts} tries` : ""}
                </span>
                <span className="text-gray-500">{new Date(d.created_at).toLocaleString()}</span>
                {d.status !== "delivered" && d.last_error && <span className="w-full text-gray-500 break-all">{d.last_error}</span>}
                {d.status === "failed" && (
                  <button
                    onClick={() => act("Queued again", () => call(`/deliveries/${d.id}/retry`, { method: "POST" }))}
                    className="text-blue-400 hover:text-blue-300"
                  >
                    Retry
                  </button>
                )}
              </div>
            ))}
          </section>
        )}
      </div>
    </div>
  );
}
