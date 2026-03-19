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

    // Get user's conversations
    const { data: conversations } = await supabase
      .from("conversations")
      .select("id")
      .eq("user_id", user.id);

    const conversationIds = (conversations || []).map((c) => c.id);

    if (conversationIds.length === 0) {
      return NextResponse.json({
        stats: {
          total_sent: 0,
          total_received: 0,
          active_conversations: 0,
          messages_by_day: [],
          avg_response_time_seconds: null,
        },
      });
    }

    // Get all messages for user's conversations
    const { data: messages } = await supabase
      .from("messages")
      .select("direction, status, created_at, conversation_id")
      .in("conversation_id", conversationIds)
      .order("created_at", { ascending: true });

    const allMessages = messages || [];

    const totalSent = allMessages.filter((m) => m.direction === "outbound").length;
    const totalReceived = allMessages.filter((m) => m.direction === "inbound").length;

    // Messages by day (last 30 days)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const dayMap = new Map<string, { sent: number; received: number }>();
    for (const msg of allMessages) {
      const date = new Date(msg.created_at);
      if (date < thirtyDaysAgo) continue;
      const dayKey = date.toISOString().split("T")[0];
      const entry = dayMap.get(dayKey) || { sent: 0, received: 0 };
      if (msg.direction === "outbound") entry.sent++;
      else entry.received++;
      dayMap.set(dayKey, entry);
    }

    const messagesByDay = Array.from(dayMap.entries())
      .map(([date, counts]) => ({ date, ...counts }))
      .sort((a, b) => a.date.localeCompare(b.date));

    // Average response time: time between inbound and next outbound in same conversation
    let totalResponseTime = 0;
    let responseCount = 0;

    const msgsByConvo = new Map<string, typeof allMessages>();
    for (const msg of allMessages) {
      const list = msgsByConvo.get(msg.conversation_id) || [];
      list.push(msg);
      msgsByConvo.set(msg.conversation_id, list);
    }

    for (const convoMessages of msgsByConvo.values()) {
      for (let i = 0; i < convoMessages.length - 1; i++) {
        if (
          convoMessages[i].direction === "inbound" &&
          convoMessages[i + 1].direction === "outbound"
        ) {
          const diff =
            new Date(convoMessages[i + 1].created_at).getTime() -
            new Date(convoMessages[i].created_at).getTime();
          totalResponseTime += diff;
          responseCount++;
        }
      }
    }

    // Active conversations (had a message in last 7 days)
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const activeConversations = new Set(
      allMessages
        .filter((m) => new Date(m.created_at) >= sevenDaysAgo)
        .map((m) => m.conversation_id)
    ).size;

    return NextResponse.json({
      stats: {
        total_sent: totalSent,
        total_received: totalReceived,
        active_conversations: activeConversations,
        messages_by_day: messagesByDay,
        avg_response_time_seconds:
          responseCount > 0
            ? Math.round(totalResponseTime / responseCount / 1000)
            : null,
      },
    });
  } catch (error) {
    console.error("Analytics error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
