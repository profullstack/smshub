import { NextResponse, type NextRequest } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const { user_id, role } = await request.json();

    if (!user_id) {
      return NextResponse.json(
        { error: "Missing required field: user_id" },
        { status: 400 }
      );
    }

    // Verify requester is team owner/admin
    const { data: team } = await supabase
      .from("teams")
      .select("id, owner_id")
      .eq("id", id)
      .eq("owner_id", user.id)
      .single();

    if (!team) {
      return NextResponse.json(
        { error: "Team not found or not authorized" },
        { status: 404 }
      );
    }

    const { data: member, error } = await supabase
      .from("team_members")
      .insert({
        team_id: id,
        user_id,
        role: role || "member",
      })
      .select()
      .single();

    if (error) {
      if (error.code === "23505") {
        return NextResponse.json(
          { error: "User is already a team member" },
          { status: 409 }
        );
      }
      throw error;
    }

    return NextResponse.json({ member }, { status: 201 });
  } catch (error) {
    console.error("Add team member error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
