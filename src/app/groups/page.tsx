"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";

interface Member {
  contact_id: string;
  phone: string;
  name: string | null;
  opted_out: boolean;
}

interface Group {
  id: string;
  name: string;
  description: string;
  from: string | null;
  relay: boolean;
  external_ref: string | null;
  member_count: number;
  last_sent_at: string | null;
  members?: Member[];
}

interface NumberRow {
  id: string;
  number: string;
  managed?: boolean;
}

const input = "px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500";
const button = "px-3 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-sm disabled:opacity-50";
const quiet = "px-3 py-2 rounded-lg bg-gray-800 hover:bg-gray-700 text-sm";

async function call<T>(path: string, init?: { method?: string; body?: unknown }): Promise<T> {
  const res = await fetch(path, {
    method: init?.method ?? "GET",
    headers: init?.body ? { "content-type": "application/json" } : undefined,
    body: init?.body ? JSON.stringify(init.body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
  return data as T;
}

/** "+14155550123 Kim" or "+14155550123=Kim", one per line or comma separated. */
function parseMembers(text: string) {
  return text
    .split(/[\n,]+/)
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => {
      const m = /^(\+?[\d\s().-]{7,})(?:\s*[=\s]\s*(.+))?$/.exec(l);
      return m ? { phone: m[1].replace(/[\s().-]/g, ""), ...(m[2] ? { name: m[2].trim() } : {}) } : { phone: l };
    });
}

export default function GroupsPage() {
  const [groups, setGroups] = useState<Group[]>([]);
  const [numbers, setNumbers] = useState<NumberRow[]>([]);
  const [open, setOpen] = useState<Group | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [name, setName] = useState("");
  const [from, setFrom] = useState("");
  const [relay, setRelay] = useState(false);
  const [membersText, setMembersText] = useState("");
  const [addText, setAddText] = useState("");
  const [message, setMessage] = useState("");

  const load = useCallback(async () => {
    try {
      const [{ groups }, nums] = await Promise.all([
        call<{ groups: Group[] }>("/api/v1/groups"),
        call<{ numbers?: NumberRow[] }>("/api/v1/numbers").catch(() => ({ numbers: [] as NumberRow[] })),
      ]);
      setGroups(groups);
      setNumbers((nums.numbers ?? []).filter((n) => !n.managed));
    } catch (e) {
      setNote((e as Error).message);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const act = async (job: () => Promise<string | void>) => {
    setBusy(true);
    setNote("");
    try {
      const said = await job();
      if (said) setNote(said);
      await load();
    } catch (e) {
      setNote((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const show = (id: string) => act(async () => setOpen(await call<Group>(`/api/v1/groups/${encodeURIComponent(id)}`)));

  return (
    <div className="min-h-screen bg-gray-950 p-8">
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">Groups</h1>
          <Link href="/inbox" className="text-blue-400 hover:text-blue-300 text-sm">
            ← Back to Inbox
          </Link>
        </div>
        <p className="text-sm text-gray-400">
          Named lists of people you text together, from your own number. Turn on relay and a member&apos;s reply to that
          number goes to the whole group, like a group chat. Anyone who replies STOP is skipped. Also from the API
          (<code>/api/v1/groups</code>), <code>smshub-cli group</code> and MCP.
        </p>
        {note && <div className="text-sm bg-gray-900 border border-gray-800 rounded-lg p-3">{note}</div>}

        <form
          className="bg-gray-900 rounded-lg p-4 border border-gray-800 space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            void act(async () => {
              const g = await call<Group>("/api/v1/groups", { method: "POST", body: { name, from: from || undefined, relay, members: parseMembers(membersText) } });
              setName("");
              setMembersText("");
              setOpen(g);
              return `Made ${g.name} with ${g.member_count} member${g.member_count === 1 ? "" : "s"}.`;
            });
          }}
        >
          <h2 className="font-medium">New group</h2>
          <div className="flex flex-wrap gap-2">
            <input className={input} required value={name} onChange={(e) => setName(e.target.value)} placeholder="Name" aria-label="Group name" />
            <select className={input} value={from} onChange={(e) => setFrom(e.target.value)} aria-label="Texts from">
              <option value="">Texts from…</option>
              {numbers.map((n) => (
                <option key={n.id} value={n.id}>
                  {n.number}
                </option>
              ))}
            </select>
            <label className="flex items-center gap-2 text-sm text-gray-300">
              <input type="checkbox" checked={relay} onChange={(e) => setRelay(e.target.checked)} /> Relay replies to the group
            </label>
          </div>
          <textarea className={`${input} w-full`} rows={3} value={membersText} onChange={(e) => setMembersText(e.target.value)} placeholder={"+14155550123 Kim\n+14155550124 Lee"} aria-label="Members" />
          <button className={button} disabled={busy}>
            Make group
          </button>
        </form>

        <div className="space-y-2">
          {groups.length === 0 && <div className="text-center py-8 text-gray-500">No groups yet</div>}
          {groups.map((g) => (
            <button key={g.id} type="button" onClick={() => void show(g.id)} className="w-full text-left bg-gray-900 rounded-lg p-4 border border-gray-800 hover:border-gray-700">
              <div className="flex justify-between">
                <span className="font-medium">{g.name}</span>
                <span className="text-xs text-gray-500">
                  {g.member_count} member{g.member_count === 1 ? "" : "s"}
                  {g.relay ? " · relay" : ""}
                  {g.external_ref ? ` · ${g.external_ref}` : ""}
                </span>
              </div>
              <div className="text-sm text-gray-400">{g.from ?? "No number set"}</div>
            </button>
          ))}
        </div>

        {open && (
          <div className="bg-gray-900 rounded-lg p-4 border border-gray-700 space-y-3">
            <div className="flex justify-between items-center">
              <h2 className="font-medium">
                {open.name} <span className="text-sm text-gray-500">from {open.from ?? "(choose a number)"}</span>
              </h2>
              <div className="flex gap-2">
                <button type="button" className={quiet} onClick={() => void act(async () => { setOpen(await call<Group>(`/api/v1/groups/${open.id}`, { method: "PATCH", body: { relay: !open.relay } })); })}>
                  Relay {open.relay ? "on" : "off"}
                </button>
                <button type="button" className={quiet} onClick={() => void act(async () => { await call(`/api/v1/groups/${open.id}`, { method: "DELETE" }); setOpen(null); return "Group deleted."; })}>
                  Delete
                </button>
              </div>
            </div>
            <ul className="text-sm space-y-1">
              {(open.members ?? []).map((m) => (
                <li key={m.contact_id} className="flex justify-between">
                  <span>
                    {m.name ? `${m.name} · ` : ""}
                    {m.phone}
                    {m.opted_out && <span className="text-gray-500"> (STOP)</span>}
                  </span>
                  <button type="button" className="text-red-400 text-xs" onClick={() => void act(async () => { setOpen(await call<Group>(`/api/v1/groups/${open.id}/members/${encodeURIComponent(m.phone)}`, { method: "DELETE" })); })}>
                    remove
                  </button>
                </li>
              ))}
            </ul>
            <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); void act(async () => { setOpen(await call<Group>(`/api/v1/groups/${open.id}/members`, { method: "POST", body: { members: parseMembers(addText) } })); setAddText(""); }); }}>
              <input className={`${input} flex-1`} value={addText} onChange={(e) => setAddText(e.target.value)} placeholder="+14155550125 Sam" aria-label="Add members" />
              <button className={quiet} disabled={busy}>Add</button>
            </form>
            <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); void act(async () => { const r = await call<{ sent: number; failed: number; skipped: number; errors?: { error?: string }[] }>(`/api/v1/groups/${open.id}/send`, { method: "POST", body: { message } }); setMessage(""); return `Sent ${r.sent}${r.failed ? `, ${r.failed} failed (${r.errors?.[0]?.error ?? ""})` : ""}${r.skipped ? `, ${r.skipped} skipped` : ""}.`; }); }}>
              <input className={`${input} flex-1`} required maxLength={1600} value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Text everyone in this group" aria-label="Message" />
              <button className={button} disabled={busy}>Send</button>
            </form>
          </div>
        )}
      </div>
    </div>
  );
}
