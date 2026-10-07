import { createServerSupabaseClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { InboxClient } from "@/components/inbox-client";
import { StationInbox } from "@/components/station/station-inbox";
import { getBrand } from "@/lib/brand-server";

export default async function InboxPage() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: conversations } = await supabase
    .from("conversations")
    .select(
      `
      *,
      unread_count,
      contacts (id, phone, name),
      phone_numbers (id, number, friendly_name)
    `
    )
    .eq("user_id", user.id)
    .order("last_message_at", { ascending: false });

  // The user's own numbers are the inbox's lines (one per family member, say).
  const { data: numbers } = await supabase
    .from("phone_numbers")
    .select("id, number, friendly_name")
    .eq("user_id", user.id)
    .eq("status", "active")
    .order("created_at", { ascending: true });

  if ((await getBrand()).id === "numberstation") {
    return <StationInbox conversations={conversations || []} numbers={numbers || []} />;
  }

  return <InboxClient conversations={conversations || []} numbers={numbers || []} userId={user.id} />;
}
