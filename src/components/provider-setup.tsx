"use client";

import { useState } from "react";
import Link from "next/link";

export const SETUP_GUIDES: Record<string, string> = {
  telnyx: "/docs/telnyx",
  twilio: "/docs/twilio",
};

export function SetupGuideLink({ type, className = "" }: { type: string; className?: string }) {
  const href = SETUP_GUIDES[type];
  if (!href) return null;
  return (
    <Link href={href} target="_blank" className={`text-sm text-blue-400 hover:text-blue-300 ${className}`}>
      Setup guide →
    </Link>
  );
}

interface Check {
  id: string;
  label: string;
  status: "pass" | "fail" | "warn";
  detail: string;
  code?: string | null;
  fixable?: boolean;
}

interface ProfileResult {
  profileId: string;
  profileName: string;
  numbers: string[];
  previousUrl: string | null;
  action: "updated" | "already_set" | "points_elsewhere" | "failed";
  error?: { code: string | null; message: string };
}

export interface WebhookSetupResult {
  ok: boolean;
  webhookUrl: string;
  profiles?: ProfileResult[];
  numbersWithoutProfile?: string[];
  numbers?: Array<{ number: string; action: string; error?: string }>;
  error?: { code: string | null; message: string };
}

const ICON: Record<Check["status"], string> = { pass: "✅", fail: "❌", warn: "⚠️" };

export function CheckList({ checks }: { checks: Check[] }) {
  return (
    <ul className="space-y-2">
      {checks.map((c) => (
        <li key={c.id} className="flex gap-2 text-sm">
          <span aria-label={c.status}>{ICON[c.status]}</span>
          <div>
            <span className="font-medium">{c.label}</span>
            {c.code && <span className="ml-2 text-xs text-gray-500">code {c.code}</span>}
            <div className="text-gray-400">{c.detail}</div>
          </div>
        </li>
      ))}
    </ul>
  );
}

/** What happened to the provider's webhooks, in one line per profile/number. */
export function WebhookSetupSummary({ result }: { result: WebhookSetupResult }) {
  if (result.error) {
    return <p className="text-sm text-red-400">Could not set the webhook automatically: {result.error.message}</p>;
  }
  const lines: Array<{ ok: boolean; text: string }> = [];
  for (const p of result.profiles ?? []) {
    const who = `Messaging profile "${p.profileName}" (${p.numbers.join(", ")})`;
    if (p.action === "updated") lines.push({ ok: true, text: `${who}: webhook set to smshub.` });
    if (p.action === "already_set") lines.push({ ok: true, text: `${who}: already sends webhooks to smshub.` });
    if (p.action === "points_elsewhere")
      lines.push({ ok: false, text: `${who}: left alone because it sends webhooks to ${p.previousUrl}.` });
    if (p.action === "failed") lines.push({ ok: false, text: `${who}: update failed (${p.error?.message}).` });
  }
  for (const n of result.numbersWithoutProfile ?? []) {
    lines.push({ ok: false, text: `${n} has no messaging profile, so it cannot send or receive texts.` });
  }
  for (const n of result.numbers ?? []) {
    lines.push({
      ok: n.action !== "failed",
      text: `${n.number}: ${n.action === "updated" ? "webhook set to smshub" : n.action === "already_set" ? "already set" : `failed (${n.error})`}.`,
    });
  }
  if (!lines.length) {
    return <p className="text-sm text-gray-400">No numbers in this account yet, so there was nothing to point at smshub.</p>;
  }
  return (
    <ul className="space-y-1 text-sm">
      {lines.map((l, i) => (
        <li key={i} className={l.ok ? "text-green-400" : "text-yellow-400"}>
          {l.ok ? "✅" : "⚠️"} {l.text}
        </li>
      ))}
    </ul>
  );
}

export function ProviderTestPanel({ providerId, type }: { providerId: string; type: string }) {
  const [to, setTo] = useState("");
  const [running, setRunning] = useState(false);
  const [checks, setChecks] = useState<Check[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fix, setFix] = useState<WebhookSetupResult | null>(null);

  const runTest = async (withSms = true) => {
    setRunning(true);
    setError(null);
    try {
      const res = await fetch(`/api/providers/${providerId}/test`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ to: (withSms && to.trim()) || undefined }),
      });
      const data = await res.json();
      if (!res.ok) setError(data.error || "Test failed to run");
      else setChecks(data.checks);
    } catch {
      setError("Test failed to run");
    }
    setRunning(false);
  };

  const fixWebhook = async (force: boolean) => {
    setRunning(true);
    try {
      const res = await fetch(`/api/providers/${providerId}/webhook`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ force }),
      });
      const data = await res.json();
      if (!res.ok) setError(data.error || "Could not update the webhook");
      else setFix(data);
    } catch {
      setError("Could not update the webhook");
    }
    setRunning(false);
    // Re-check without sending another text.
    runTest(false);
  };

  const hasFixable = checks?.some((c) => c.fixable);
  const elsewhere = fix?.profiles?.some((p) => p.action === "points_elsewhere");

  return (
    <div className="mt-3 border-t border-gray-800 pt-3 space-y-3">
      <div className="flex flex-col sm:flex-row gap-2">
        <input
          type="tel"
          placeholder="Send a test SMS to (optional), e.g. +14155551234"
          value={to}
          onChange={(e) => setTo(e.target.value)}
          className="flex-1 px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm"
        />
        <button
          type="button"
          onClick={() => runTest()}
          disabled={running}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg text-sm font-medium disabled:opacity-50"
        >
          {running ? "Testing…" : "Run test"}
        </button>
      </div>
      {error && <p className="text-sm text-red-400">{error}</p>}
      {checks && <CheckList checks={checks} />}
      {hasFixable && (
        <button
          type="button"
          onClick={() => fixWebhook(false)}
          disabled={running}
          className="px-3 py-1.5 bg-green-700 hover:bg-green-600 rounded-lg text-sm font-medium disabled:opacity-50"
        >
          Fix webhook
        </button>
      )}
      {fix && <WebhookSetupSummary result={fix} />}
      {elsewhere && (
        <div className="text-sm text-gray-400 space-y-2">
          <p>
            Replacing that URL sends this number&apos;s texts to smshub instead. Anything else using that profile
            will stop getting them.
          </p>
          <button
            type="button"
            onClick={() => fixWebhook(true)}
            disabled={running}
            className="px-3 py-1.5 bg-yellow-700 hover:bg-yellow-600 rounded-lg text-sm font-medium disabled:opacity-50"
          >
            Replace with smshub webhook
          </button>
        </div>
      )}
      {type === "telnyx" && checks?.some((c) => c.code === "40010") && (
        <p className="text-sm text-gray-400">
          See <Link href="/docs/telnyx" className="text-blue-400">the setup guide</Link> for what 10DLC registration involves.
        </p>
      )}
    </div>
  );
}
