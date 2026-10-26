"use client";

import { useEffect, useState } from "react";
import { ProfileFields } from "@profullstack/profile/react";
import type { ProfileField } from "@profullstack/profile";

type Values = Partial<Record<ProfileField, string | null>>;
const FIELDS: ProfileField[] = ["email", "first_name", "last_name", "company_domain", "job_title", "linkedin_url"];

// The shared @profullstack/profile fields, read and written through
// /api/v1/me/profile.
export function ProfileCard() {
  const [values, setValues] = useState<Values>({});
  const [errors, setErrors] = useState<Partial<Record<ProfileField, string>>>({});
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/v1/me/profile")
      .then((r) => (r.ok ? r.json() : null))
      .then((body) => {
        const p = body?.profile ?? {};
        setValues(Object.fromEntries(FIELDS.map((k) => [k, p[k] ?? ""])));
      })
      .catch(() => setMessage("Could not load your profile."))
      .finally(() => setLoaded(true));
  }, []);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setMessage(null);
    setErrors({});
    const r = await fetch("/api/v1/me/profile", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(values),
    }).catch(() => null);
    const body = r ? await r.json().catch(() => ({})) : {};
    if (r?.ok) setMessage("Saved.");
    else {
      setErrors(body.errors ?? {});
      setMessage(body.error ?? "Could not save.");
    }
    setSaving(false);
  };

  return (
    <section className="space-y-4">
      <h2 className="text-lg font-semibold">Profile</h2>
      <form onSubmit={save} className="bg-gray-900 rounded-lg p-4 border border-gray-800 space-y-4">
        <ProfileFields idPrefix="settings-" values={values} onChange={setValues} errors={errors} disabled={!loaded} />
        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={saving || !loaded}
            className="py-2 px-4 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 rounded-lg text-sm font-medium transition-colors"
          >
            {saving ? "Saving..." : "Save profile"}
          </button>
          {message && <span className="text-sm text-gray-400">{message}</span>}
        </div>
      </form>
    </section>
  );
}
