"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useToast } from "@/contexts/toast-context";

interface Organization {
  id: string;
  name: string;
  slug: string;
  plan: string;
  created_at: string;
}

interface OrgMember {
  id: string;
  user_id: string;
  role: string;
}

export default function OrgPage() {
  const [org, setOrg] = useState<Organization | null>(null);
  const [members, setMembers] = useState<OrgMember[]>([]);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [newSlug, setNewSlug] = useState("");
  const [loading, setLoading] = useState(true);
  const supabase = createClient();
  const router = useRouter();
  const { addToast } = useToast();

  useEffect(() => {
    loadOrg();
  }, []);

  const loadOrg = async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      router.push("/login");
      return;
    }

    // Check if user belongs to an org
    const { data: membership } = await supabase
      .from("org_members")
      .select("org_id, role")
      .eq("user_id", user.id)
      .limit(1)
      .single();

    if (membership) {
      const { data: orgData } = await supabase
        .from("organizations")
        .select("*")
        .eq("id", membership.org_id)
        .single();

      if (orgData) {
        setOrg(orgData);
        const { data: memberData } = await supabase
          .from("org_members")
          .select("*")
          .eq("org_id", orgData.id);
        if (memberData) setMembers(memberData);
      }
    }
    setLoading(false);
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName || !newSlug) return;

    setCreating(true);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;

    const { data: orgData, error: orgError } = await supabase
      .from("organizations")
      .insert({ name: newName, slug: newSlug })
      .select()
      .single();

    if (orgError) {
      addToast(orgError.message || "Failed to create organization", "error");
      setCreating(false);
      return;
    }

    // Add self as admin
    await supabase.from("org_members").insert({
      org_id: orgData.id,
      user_id: user.id,
      role: "admin",
    });

    addToast("Organization created!", "success");
    setCreating(false);
    loadOrg();
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center">
        <p className="text-gray-400">Loading...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-950 p-8">
      <div className="max-w-2xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">Organization</h1>
          <Link
            href="/"
            className="text-blue-400 hover:text-blue-300 text-sm"
          >
            ← Back to Inbox
          </Link>
        </div>

        {org ? (
          <div className="space-y-6">
            <div className="bg-gray-900 rounded-lg p-6 border border-gray-800">
              <h2 className="text-lg font-semibold">{org.name}</h2>
              <div className="mt-2 space-y-1 text-sm text-gray-400">
                <p>Slug: {org.slug}</p>
                <p>Plan: <span className="capitalize">{org.plan}</span></p>
                <p>
                  Created: {new Date(org.created_at).toLocaleDateString()}
                </p>
              </div>
            </div>

            <div>
              <h3 className="text-lg font-semibold mb-3">
                Members ({members.length})
              </h3>
              <div className="space-y-2">
                {members.map((m) => (
                  <div
                    key={m.id}
                    className="bg-gray-900 rounded-lg p-3 border border-gray-800 flex justify-between"
                  >
                    <span className="text-sm text-gray-300">
                      {m.user_id.slice(0, 8)}...
                    </span>
                    <span className="text-xs text-gray-500 capitalize">
                      {m.role}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-6">
            <p className="text-gray-500">
              You don&apos;t belong to an organization yet.
            </p>
            <form
              onSubmit={handleCreate}
              className="bg-gray-900 rounded-lg p-6 border border-gray-800 space-y-4"
            >
              <h2 className="text-lg font-semibold">Create Organization</h2>
              <div>
                <label className="block text-sm font-medium mb-1">Name</label>
                <input
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="My Company"
                  required
                  className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Slug</label>
                <input
                  value={newSlug}
                  onChange={(e) =>
                    setNewSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))
                  }
                  placeholder="my-company"
                  required
                  className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg"
                />
              </div>
              <button
                type="submit"
                disabled={creating}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg text-sm font-medium disabled:opacity-50"
              >
                {creating ? "Creating..." : "Create Organization"}
              </button>
            </form>
          </div>
        )}
      </div>
    </div>
  );
}
