import { createServerSupabaseClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { InboxClient } from "@/components/inbox-client";

export default async function HomePage() {
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
      contacts (id, phone, name),
      phone_numbers (id, number, friendly_name)
    `
    )
    .eq("user_id", user.id)
    .order("last_message_at", { ascending: false });

  return <InboxClient conversations={conversations || []} userId={user.id} />;
}
