"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useToast } from "@/contexts/toast-context";
import { CONSENT_TEXT } from "@/lib/alerts/consent";

interface Settings {
  phone: string | null;
  consent: boolean;
  consented_at: string | null;
  opted_out_at: string | null;
}

interface Alert {
  id: string;
  to_phone: string;
  message: string;
  severity: string;
  channels: string[];
  status: string;
  error: string | null;
  created_at: string;
}

const input = "px-3 py-2 bg-gray-800 border border-gray-700 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500";

export default function AlertsSettingsPage() {
  const router = useRouter();
  const { addToast } = useToast();
  const [settings, setSettings] = useState<Settings | null>(null);
  const [phone, setPhone] = useState("");
  const [consent, setConsent] = useState(false);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch("/api/alerts/settings");
    if (res.status === 401) {
      router.push("/login");
      return;
    }
    const data = await res.json().catch(() => ({}));
    const s: Settings = data.settings ?? { phone: null, consent: false, consented_at: null, opted_out_at: null };
    setSettings(s);
    setPhone(s.phone ?? "");
    setConsent(s.consent);
    const list = await fetch("/api/v1/alerts?limit=10").then((r) => r.json()).catch(() => ({}));
    setAlerts(list.alerts ?? []);
  }, [router]);

  useEffect(() => {
    load();
  }, [load]);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const res = await fetch("/api/alerts/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: phone.trim() || null, consent }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) addToast(data.error || "Could not save", "error");
      else addToast(data.settings?.phone ? "Alert phone saved" : "Alerts turned off", "success");
      await load();
    } finally {
      setBusy(false);
    }
  };

  const test = async () => {
    setBusy(true);
    try {
      const res = await fetch("/api/v1/alerts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: "Test alert from SMSHub. Alerts are working.", severity: "info" }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) addToast(data.error || data.note || "Could not send", "error");
      else addToast(data.deduped ? "Already sent in the last 10 minutes" : `Sent: ${data.note}`, "success");
      await load();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-950 p-8">
      <div className="max-w-2xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">Alerts</h1>
          <Link href="/settings" className="text-blue-400 hover:text-blue-300 text-sm">← Settings</Link>
        </div>
        <p className="text-sm text-gray-400">
          Your scripts, servers and agents can alert you through SMSHub (<code>POST /api/v1/alerts</code>, the MCP tool{" "}
          <code>send_alert</code> or <code>smshub-cli alert &quot;disk full&quot;</code>). An alert is a text when one of your
          numbers can send SMS, otherwise a phone call that reads it to you. The same alert is sent once per 10 minutes.{" "}
          <Link href="/docs/alerts" className="text-blue-400">How alerts work</Link>
        </p>

        <form onSubmit={save} className="bg-gray-900 rounded-lg p-4 border border-gray-800 space-y-4">
          <label className="block text-sm text-gray-300">
            Mobile number for alerts
            <input
              className={`${input} w-full mt-1`}
              type="tel"
              placeholder="+14155550123"
              value={phone}
              onChange={(e) => {
                setPhone(e.target.value);
                if (e.target.value.trim() !== (settings?.phone ?? "")) setConsent(false);
              }}
            />
          </label>
          <label className="flex items-start gap-2 text-sm text-gray-300">
            <input type="checkbox" className="mt-1" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
            <span>{CONSENT_TEXT}</span>
          </label>
          {settings?.opted_out_at && (
            <p className="text-sm text-yellow-300">This phone replied STOP. Tick the box and save to get alerts again.</p>
          )}
          {settings?.consent && settings.consented_at && (
            <p className="text-xs text-gray-500">Agreed {new Date(settings.consented_at).toLocaleString()}.</p>
          )}
          <div className="flex gap-2 justify-end">
            {settings?.phone && settings.consent && (
              <button type="button" onClick={test} disabled={busy} className="px-3 py-2 text-sm text-gray-200 border border-gray-700 rounded hover:border-blue-500 disabled:opacity-50">
                Send a test alert
              </button>
            )}
            <button type="submit" disabled={busy || (Boolean(phone.trim()) && !consent)} className="px-4 py-2 text-sm bg-blue-600 hover:bg-blue-700 disabled:opacity-50 rounded">
              {busy ? "Saving..." : "Save"}
            </button>
          </div>
        </form>

        {alerts.length > 0 && (
          <section className="space-y-2">
            <h2 className="text-lg font-semibold">Recent alerts</h2>
            <ul className="divide-y divide-gray-800 text-sm">
              {alerts.map((a) => (
                <li key={a.id} className="py-2">
                  <div className="flex justify-between gap-2">
                    <span className="truncate">{a.message}</span>
                    <span className={a.status === "failed" ? "text-red-400" : "text-gray-400"}>
                      {a.status === "failed" ? "failed" : a.channels.join(" + ")}
                    </span>
                  </div>
                  <div className="text-xs text-gray-500">
                    {new Date(a.created_at).toLocaleString()} · {a.severity} · {a.to_phone}
                    {a.error ? ` · ${a.error}` : ""}
                  </div>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </div>
  );
}
