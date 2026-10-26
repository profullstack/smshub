"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { CopyField } from "@/components/copy-field";

interface InviteRow {
  id: string;
  note: string;
  created_at: string;
  expires_at: string | null;
  used: boolean;
  used_at: string | null;
}

interface Summary {
  quota: { total: number; used: number; left: number };
  bonus_usd: number;
  referral_link: string;
  invites: InviteRow[];
}

function fmt(iso: string | null) {
  return iso ? new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" }) : "";
}

export default function InvitesPage() {
  const [data, setData] = useState<Summary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [fresh, setFresh] = useState<{ code: string; url: string } | null>(null);

  const load = useCallback(async () => {
    const r = await fetch("/api/v1/invites");
    if (r.status === 401) {
      window.location.href = "/login?next=/invites";
      return;
    }
    if (!r.ok) {
      setError("Could not load your invites");
      return;
    }
    setData(await r.json());
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const r = await fetch("/api/v1/invites", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ note }),
    }).catch(() => null);
    const b = r ? await r.json().catch(() => ({})) : {};
    if (r?.ok && b.ok) {
      setFresh({ code: b.code, url: b.url });
      setNote("");
      await load();
    } else {
      setError(b.error || "Could not create the invite");
    }
    setBusy(false);
  };

  if (!data) {
    return <div className="min-h-screen flex items-center justify-center text-gray-400">{error || "Loading..."}</div>;
  }

  return (
    <div className="min-h-screen max-w-2xl mx-auto px-4 py-8 space-y-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Invites</h1>
        <Link href="/settings" className="text-sm text-gray-400 hover:text-white">
          ← Settings
        </Link>
      </div>

      <section className="rounded-xl border border-gray-800 bg-gray-900 p-6 space-y-3">
        <h2 className="text-lg font-semibold">
          {data.quota.left} of {data.quota.total} invites left
        </h2>
        <p className="text-sm text-gray-400">
          Invites are few on purpose: give them to people you want here. When someone signs up through your
          invite and confirms their email, you each get ${data.bonus_usd.toFixed(2)} of store credit. Two accepted
          invites pay for a month of a rented number. Each link works once and expires after 30 days.
        </p>
        {fresh && (
          <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-100 space-y-2">
            <div>New invite. Copy it now: the code is shown only once.</div>
            <CopyField value={fresh.url} />
          </div>
        )}
        {error && <p className="text-sm text-red-400">{error}</p>}
        {data.quota.left > 0 && (
          <form onSubmit={create} className="flex flex-col gap-2 sm:flex-row">
            <input
              value={note}
              onChange={(e) => setNote(e.target.value.slice(0, 80))}
              placeholder="Who is it for? (only you see this)"
              className="flex-1 rounded-lg border border-gray-700 bg-gray-950 px-3 py-2"
            />
            <button
              type="submit"
              disabled={busy}
              className="rounded-lg bg-emerald-700 px-4 py-2 font-semibold text-white hover:bg-emerald-600 disabled:opacity-50"
            >
              {busy ? "Creating..." : "Create invite"}
            </button>
          </form>
        )}
      </section>

      {data.invites.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-lg font-semibold">Your invites</h2>
          <div className="divide-y divide-gray-800 rounded-xl border border-gray-800">
            {data.invites.map((i) => (
              <div key={i.id} className="flex flex-wrap items-center justify-between gap-2 p-3 text-sm">
                <div>
                  {i.note || "Invite"}
                  <div className="text-xs text-gray-500">Created {fmt(i.created_at)}</div>
                </div>
                <span className={i.used ? "text-emerald-400" : "text-gray-400"}>
                  {i.used ? `Accepted ${fmt(i.used_at)}` : i.expires_at ? `Open until ${fmt(i.expires_at)}` : "Open"}
                </span>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="rounded-xl border border-gray-800 p-6 space-y-2 text-sm text-gray-400">
        <h2 className="text-base font-semibold text-gray-200">Your referral link</h2>
        <p>Share it anywhere. People who sign up through it are recorded as yours.</p>
        <CopyField value={data.referral_link} />
      </section>
    </div>
  );
}
