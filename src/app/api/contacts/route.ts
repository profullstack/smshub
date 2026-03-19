import { NextResponse, type NextRequest } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createClient } from "@supabase/supabase-js";

function getServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

export async function GET() {
  try {
    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: contacts, error } = await supabase
      .from("contacts")
      .select("*")
      .eq("user_id", user.id)
      .order("name", { ascending: true });

    if (error) throw error;

    return NextResponse.json({ contacts });
  } catch (error) {
    console.error("Get contacts error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { phone, name } = body;

    if (!phone) {
      return NextResponse.json({ error: "Phone number is required" }, { status: 400 });
    }

    const serviceClient = getServiceClient();
    const { data, error } = await serviceClient
      .from("contacts")
      .upsert(
        { user_id: user.id, phone, name: name || null },
        { onConflict: "user_id,phone" }
      )
      .select()
      .single();

    if (error) {
      console.error("Add contact error:", error);
      return NextResponse.json({ error: "Failed to add contact" }, { status: 500 });
    }

    return NextResponse.json({ contact: data }, { status: 201 });
  } catch (error) {
    console.error("Add contact error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
