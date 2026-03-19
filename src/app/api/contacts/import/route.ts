import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";

function parseCSV(text: string): Array<{ phone: string; name: string }> {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  const results: Array<{ phone: string; name: string }> = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    // Skip header row
    if (i === 0 && line.toLowerCase().startsWith("phone")) continue;

    // Simple CSV parsing (handles quoted fields)
    const fields: string[] = [];
    let current = "";
    let inQuotes = false;

    for (let j = 0; j < line.length; j++) {
      const ch = line[j];
      if (ch === '"') {
        if (inQuotes && line[j + 1] === '"') {
          current += '"';
          j++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (ch === "," && !inQuotes) {
        fields.push(current.trim());
        current = "";
      } else {
        current += ch;
      }
    }
    fields.push(current.trim());

    const phone = fields[0] || "";
    const name = fields[1] || "";

    if (phone) {
      results.push({ phone, name });
    }
  }

  return results;
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

    const contentType = request.headers.get("content-type") || "";
    let csvText: string;

    if (contentType.includes("multipart/form-data")) {
      const formData = await request.formData();
      const file = formData.get("file") as File | null;
      if (!file) {
        return NextResponse.json({ error: "No file uploaded" }, { status: 400 });
      }
      csvText = await file.text();
    } else {
      csvText = await request.text();
    }

    const contacts = parseCSV(csvText);

    if (contacts.length === 0) {
      return NextResponse.json(
        { error: "No valid contacts found in CSV" },
        { status: 400 }
      );
    }

    let imported = 0;
    let skipped = 0;

    for (const c of contacts) {
      const { data: existing } = await supabase
        .from("contacts")
        .select("id")
        .eq("user_id", user.id)
        .eq("phone", c.phone)
        .single();

      if (existing) {
        // Update name if provided
        if (c.name) {
          await supabase
            .from("contacts")
            .update({ name: c.name })
            .eq("id", existing.id);
        }
        skipped++;
      } else {
        await supabase.from("contacts").insert({
          user_id: user.id,
          phone: c.phone,
          name: c.name || null,
        });
        imported++;
      }
    }

    return NextResponse.json({ imported, skipped, total: contacts.length });
  } catch (error) {
    console.error("Import contacts error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
