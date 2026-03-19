import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export async function GET() {
  try {
    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Get teams where user is owner or member
    const { data: memberships, error } = await supabase
      .from("team_members")
      .select(`
        role,
        teams(id, name, owner_id, created_at)
      `)
      .eq("user_id", user.id);

    if (error) throw error;

    const teams = (memberships || []).map((m) => ({
      ...(m.teams as unknown as { id: string; name: string; owner_id: string; created_at: string }),
      role: m.role,
    }));

    return NextResponse.json({ teams });
  } catch (error) {
    console.error("Get teams error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { name } = await request.json();

    if (!name) {
      return NextResponse.json(
        { error: "Missing required field: name" },
        { status: 400 }
      );
    }

    // Create team
    const { data: team, error: teamError } = await supabase
      .from("teams")
      .insert({ name, owner_id: user.id })
      .select()
      .single();

    if (teamError) throw teamError;

    // Add owner as admin member
    const { error: memberError } = await supabase
      .from("team_members")
      .insert({
        team_id: team.id,
        user_id: user.id,
        role: "admin",
      });

    if (memberError) throw memberError;

    return NextResponse.json({ team }, { status: 201 });
  } catch (error) {
    console.error("Create team error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
