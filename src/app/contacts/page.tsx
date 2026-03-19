"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import Link from "next/link";

interface ContactRow {
  id: string;
  phone: string;
  name: string | null;
  email: string | null;
  company: string | null;
  tags: string[] | null;
  last_contacted_at: string | null;
  created_at: string;
}

export default function ContactsPage() {
  const [contacts, setContacts] = useState<ContactRow[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const supabase = createClient();
  const router = useRouter();

  useEffect(() => {
    loadContacts();
  }, []);

  const loadContacts = async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      router.push("/login");
      return;
    }

    const { data } = await supabase
      .from("contacts")
      .select("*")
      .eq("user_id", user.id)
      .order("name", { ascending: true, nullsFirst: false });

    if (data) setContacts(data as ContactRow[]);
    setLoading(false);
  };

  const filtered = contacts.filter((c) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      c.name?.toLowerCase().includes(q) ||
      c.phone.toLowerCase().includes(q) ||
      c.email?.toLowerCase().includes(q) ||
      c.company?.toLowerCase().includes(q) ||
      c.tags?.some((t) => t.toLowerCase().includes(q))
    );
  });

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center">
        <p className="text-gray-400">Loading contacts...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-950 p-8">
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">Contacts</h1>
          <Link
            href="/"
            className="text-blue-400 hover:text-blue-300 text-sm"
          >
            ← Back to Inbox
          </Link>
        </div>

        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by name, phone, email, company, or tag..."
          className="w-full px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
        />

        <div className="text-sm text-gray-500">
          {filtered.length} contact{filtered.length !== 1 ? "s" : ""}
        </div>

        {filtered.length === 0 ? (
          <div className="text-center py-12 text-gray-500">
            {search ? "No contacts match your search" : "No contacts yet"}
          </div>
        ) : (
          <div className="space-y-2">
            {filtered.map((contact) => (
              <Link
                key={contact.id}
                href={`/contacts/${contact.id}`}
                className="block bg-gray-900 rounded-lg p-4 border border-gray-800 hover:border-gray-700 transition-colors"
              >
                <div className="flex justify-between items-start">
                  <div>
                    <div className="font-medium">
                      {contact.name || contact.phone}
                    </div>
                    {contact.name && (
                      <div className="text-sm text-gray-400">
                        {contact.phone}
                      </div>
                    )}
                    <div className="flex gap-3 mt-1 text-xs text-gray-500">
                      {contact.email && <span>📧 {contact.email}</span>}
                      {contact.company && <span>🏢 {contact.company}</span>}
                    </div>
                    {contact.tags && contact.tags.length > 0 && (
                      <div className="flex gap-1 mt-2">
                        {contact.tags.map((tag) => (
                          <span
                            key={tag}
                            className="px-2 py-0.5 bg-gray-800 text-gray-300 rounded-full text-xs"
                          >
                            {tag}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                  {contact.last_contacted_at && (
                    <div className="text-xs text-gray-600">
                      Last contacted{" "}
                      {new Date(contact.last_contacted_at).toLocaleDateString()}
                    </div>
                  )}
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
