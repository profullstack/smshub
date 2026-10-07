"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useToast } from "@/contexts/toast-context";

interface LineContact {
  id: string;
  name: string;
  forward_to: string;
  keypad_digit: number | null;
  sms_prefix: string | null;
  forward_sms: boolean;
}

interface Line {
  id: string;
  number: string;
  friendly_name: string | null;
  provider_type: string;
  managed: boolean;
  contacts_line_id: string | null;
  record_calls: boolean;
  contacts: LineContact[];
}

interface Voice {
  ok: boolean;
  state: string;
  message: string;
}

type Draft = { name: string; forward_to: string; keypad_digit: string; sms_prefix: string; forward_sms: boolean };

const emptyDraft: Draft = { name: "", forward_to: "", keypad_digit: "", sms_prefix: "", forward_sms: false };

const toDraft = (c: LineContact): Draft => ({
  name: c.name,
  forward_to: c.forward_to,
  keypad_digit: c.keypad_digit === null ? "" : String(c.keypad_digit),
  sms_prefix: c.sms_prefix ?? "",
  forward_sms: c.forward_sms,
});

const toBody = (d: Draft) => ({
  name: d.name,
  forward_to: d.forward_to,
  keypad_digit: d.keypad_digit === "" ? null : Number(d.keypad_digit),
  sms_prefix: d.sms_prefix === "" ? null : d.sms_prefix,
  forward_sms: d.forward_sms,
});

const input = "px-2 py-1.5 bg-gray-800 border border-gray-700 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500";

function ContactForm({
  draft,
  setDraft,
  onSubmit,
  onCancel,
  submitLabel,
  busy,
}: {
  draft: Draft;
  setDraft: (d: Draft) => void;
  onSubmit: () => void;
  onCancel?: () => void;
  submitLabel: string;
  busy: boolean;
}) {
  return (
    <form
      className="grid grid-cols-2 sm:grid-cols-6 gap-2 items-end"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit();
      }}
    >
      <label className="col-span-2 sm:col-span-2 text-xs text-gray-400">
        Name
        <input className={`${input} w-full mt-1`} value={draft.name} maxLength={60} required placeholder="Kim"
          onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
      </label>
      <label className="col-span-2 sm:col-span-2 text-xs text-gray-400">
        Their cell
        <input className={`${input} w-full mt-1`} type="tel" value={draft.forward_to} required placeholder="+14155550123"
          onChange={(e) => setDraft({ ...draft, forward_to: e.target.value })} />
      </label>
      <label className="text-xs text-gray-400">
        Keypad
        <select className={`${input} w-full mt-1`} value={draft.keypad_digit}
          onChange={(e) => setDraft({ ...draft, keypad_digit: e.target.value })}>
          <option value="">none</option>
          {Array.from({ length: 10 }, (_, i) => (
            <option key={i} value={String(i)}>{i}</option>
          ))}
        </select>
      </label>
      <label className="text-xs text-gray-400">
        Text prefix
        <input className={`${input} w-full mt-1 uppercase`} value={draft.sms_prefix} maxLength={8} placeholder="K"
          onChange={(e) => setDraft({ ...draft, sms_prefix: e.target.value.replace(/[^A-Za-z0-9]/g, "") })} />
      </label>
      <label className="col-span-2 sm:col-span-4 flex items-center gap-2 text-xs text-gray-400">
        <input type="checkbox" checked={draft.forward_sms} onChange={(e) => setDraft({ ...draft, forward_sms: e.target.checked })} />
        Also text prefixed messages on to their cell (needs a number that can send)
      </label>
      <div className="col-span-2 flex gap-2 justify-end">
        {onCancel && (
          <button type="button" onClick={onCancel} className="px-3 py-1.5 text-sm text-gray-300 hover:text-white">Cancel</button>
        )}
        <button type="submit" disabled={busy} className="px-3 py-1.5 text-sm bg-blue-600 hover:bg-blue-700 disabled:opacity-50 rounded">
          {busy ? "Saving..." : submitLabel}
        </button>
      </div>
    </form>
  );
}

function LineCard({ line, lines, reload }: { line: Line; lines: Line[]; reload: () => Promise<void> }) {
  const { addToast } = useToast();
  const [adding, setAdding] = useState<Draft>(emptyDraft);
  const [editing, setEditing] = useState<{ id: string; draft: Draft } | null>(null);
  const [busy, setBusy] = useState(false);
  const [voice, setVoice] = useState<Voice | null>(null);
  const hasMenu = line.contacts.some((c) => c.keypad_digit !== null);
  const source = lines.find((l) => l.id === line.contacts_line_id);
  // Lines that keep their own book (and are not this one) can lend it.
  const lenders = lines.filter((l) => l.id !== line.id && !l.contacts_line_id);
  const borrowed = lines.some((l) => l.contacts_line_id === line.id);

  const setRecording = async (on: boolean) => {
    setBusy(true);
    try {
      const res = await fetch(`/api/lines/${line.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ record_calls: on }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) addToast(data.error || "Could not change", "error");
      await reload();
    } finally {
      setBusy(false);
    }
  };

  const share = async (from: string) => {
    setBusy(true);
    try {
      const res = await fetch(`/api/lines/${line.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contacts_from: from || null }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) addToast(data.error || "Could not change", "error");
      else report(data.voice);
      await reload();
    } finally {
      setBusy(false);
    }
  };

  const report = (v: Voice | undefined) => {
    if (!v) return;
    setVoice(v);
    if (!v.ok) addToast(v.message, "error");
  };

  const save = async (url: string, method: "POST" | "PATCH", draft: Draft) => {
    setBusy(true);
    try {
      const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(toBody(draft)) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        addToast(data.error || "Could not save", "error");
        return false;
      }
      addToast("Saved", "success");
      report(data.voice);
      await reload();
      return true;
    } finally {
      setBusy(false);
    }
  };

  const remove = async (c: LineContact) => {
    if (!confirm(`Remove ${c.name} from ${line.friendly_name || line.number}?`)) return;
    const res = await fetch(`/api/lines/${line.id}/contacts/${c.id}`, { method: "DELETE" });
    if (!res.ok) addToast("Could not remove", "error");
    await reload();
  };

  const voiceCall = async (method: "GET" | "POST", force = false) => {
    setBusy(true);
    try {
      const res = await fetch(`/api/lines/${line.id}/voice`, {
        method,
        headers: { "Content-Type": "application/json" },
        body: method === "POST" ? JSON.stringify({ force }) : undefined,
      });
      const data = await res.json().catch(() => ({}));
      if (data.voice) setVoice(data.voice);
      else addToast(data.error || "Could not check calls", "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="bg-gray-900 rounded-lg p-4 border border-gray-800 space-y-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h2 className="text-lg font-semibold">{line.friendly_name || line.number}</h2>
          {line.friendly_name && <p className="text-sm text-gray-400">{line.number}</p>}
        </div>
        {line.provider_type === "telnyx" && (
          <button onClick={() => voiceCall("GET")} disabled={busy} className="text-sm text-blue-400 hover:text-blue-300 disabled:opacity-50">
            Check where calls go
          </button>
        )}
      </div>

      {lenders.length > 0 && !borrowed && (
        <label className="flex flex-wrap items-center gap-2 text-sm text-gray-400">
          Contacts:
          <select className={input} value={line.contacts_line_id ?? ""} disabled={busy} onChange={(e) => share(e.target.value)}>
            <option value="">this number&rsquo;s own</option>
            {lenders.map((l) => (
              <option key={l.id} value={l.id}>same as {l.friendly_name || l.number}</option>
            ))}
          </select>
        </label>
      )}

      {line.provider_type === "telnyx" && (
        <label className="flex items-center gap-2 text-sm text-gray-400">
          <input type="checkbox" checked={line.record_calls} disabled={busy} onChange={(e) => setRecording(e.target.checked)} />
          Record calls as MP3 (callers first hear &ldquo;This call may be recorded&rdquo;; play them in the inbox)
        </label>
      )}

      {source && (
        <p className="text-sm text-gray-400">
          Answers with {source.friendly_name || source.number}&rsquo;s contacts, voice menu and text prefixes. Edit them there.
        </p>
      )}

      {line.contacts.length > 0 ? (
        <ul className="divide-y divide-gray-800">
          {line.contacts.map((c) =>
            editing?.id === c.id ? (
              <li key={c.id} className="py-3">
                <ContactForm
                  draft={editing.draft}
                  setDraft={(draft) => setEditing({ id: c.id, draft })}
                  busy={busy}
                  submitLabel="Save"
                  onCancel={() => setEditing(null)}
                  onSubmit={async () => {
                    if (await save(`/api/lines/${line.id}/contacts/${c.id}`, "PATCH", editing.draft)) setEditing(null);
                  }}
                />
              </li>
            ) : (
              <li key={c.id} className="py-2 flex items-center justify-between gap-2 text-sm">
                <div className="min-w-0">
                  <span className="font-medium">{c.name}</span>
                  <span className="text-gray-400"> · {c.forward_to}</span>
                  {c.keypad_digit !== null && <span className="ml-2 px-1.5 rounded bg-gray-800 text-gray-300">press {c.keypad_digit}</span>}
                  {c.sms_prefix && <span className="ml-2 px-1.5 rounded bg-gray-800 text-gray-300">&ldquo;{c.sms_prefix}:&rdquo;</span>}
                  {c.forward_sms && <span className="ml-2 text-gray-500">forwards texts</span>}
                </div>
                <div className={`flex gap-3 shrink-0 ${source ? "hidden" : ""}`}>
                  <button onClick={() => setEditing({ id: c.id, draft: toDraft(c) })} className="text-blue-400 hover:text-blue-300">Edit</button>
                  <button onClick={() => remove(c)} className="text-red-400 hover:text-red-300">Remove</button>
                </div>
              </li>
            )
          )}
        </ul>
      ) : (
        <p className="text-sm text-gray-400">No one on this line yet.</p>
      )}

      <div className={`border-t border-gray-800 pt-3 ${source ? "hidden" : ""}`}>
        <h3 className="text-sm font-medium mb-2">Add someone</h3>
        <ContactForm
          draft={adding}
          setDraft={setAdding}
          busy={busy}
          submitLabel="Add"
          onSubmit={async () => {
            if (await save(`/api/lines/${line.id}/contacts`, "POST", adding)) setAdding(emptyDraft);
          }}
        />
      </div>

      {voice && (
        <div className={`text-sm rounded p-3 ${voice.ok ? "bg-green-950 text-green-200" : "bg-yellow-950 text-yellow-200"}`} role="status">
          {voice.message}
          {voice.state === "not_configured" && hasMenu && (
            <button onClick={() => voiceCall("POST")} disabled={busy} className="ml-2 underline">Set up the voice menu</button>
          )}
          {voice.state === "points_elsewhere" && hasMenu && (
            <button
              onClick={() => confirm("Calls to this number will stop going to that connection. Continue?") && voiceCall("POST", true)}
              disabled={busy}
              className="ml-2 underline"
            >
              Replace it
            </button>
          )}
        </div>
      )}
    </section>
  );
}

export default function LinesPage() {
  const [lines, setLines] = useState<Line[] | null>(null);
  const router = useRouter();

  const load = useCallback(async () => {
    const res = await fetch("/api/lines");
    if (res.status === 401) {
      router.push("/login");
      return;
    }
    const data = await res.json().catch(() => ({}));
    setLines(data.lines ?? []);
  }, [router]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="min-h-screen bg-gray-950 p-8">
      <div className="max-w-3xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">Lines</h1>
          <Link href="/settings" className="text-blue-400 hover:text-blue-300 text-sm">← Settings</Link>
        </div>
        <p className="text-sm text-gray-400">
          Who shares each number, set up once. Threads with their cell show their name. A caller hears
          &ldquo;press 1 for Kim&rdquo; and is put through to Kim&rsquo;s cell; every call is logged in the inbox.
          A text that starts with a prefix, like &ldquo;K: running late&rdquo;, is filed into Kim&rsquo;s thread;
          anything else stays in the sender&rsquo;s thread.
        </p>
        {lines === null && <p className="text-gray-400">Loading...</p>}
        {lines?.length === 0 && (
          <p className="text-gray-400">
            No numbers yet. <Link href="/settings" className="text-blue-400">Add one</Link> or <Link href="/numbers" className="text-blue-400">rent one</Link>.
          </p>
        )}
        {lines?.map((line) => <LineCard key={line.id} line={line} lines={lines} reload={load} />)}
      </div>
    </div>
  );
}
