import { createServerSupabaseClient, createServiceClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const POLL_MS = 2000;
// Messages this recent are re-sent each tick so status changes (sent ->
// delivered) reach the browser too; the client merges by id.
const WINDOW_MS = 10 * 60 * 1000;
// EventSource reconnects by itself; a bounded stream keeps idle tabs cheap.
const MAX_STREAM_MS = 5 * 60 * 1000;

/**
 * The inbox's live feed, as server-sent events. The browser talks only to
 * /api: no Supabase socket from the page. Each `messages` event carries the
 * user's messages created in the last few minutes that changed since the
 * previous tick.
 */
export async function GET(request: Request) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return new Response("Unauthorized", { status: 401 });

  const db = createServiceClient();
  const encoder = new TextEncoder();
  const seen = new Map<string, string>();
  const started = Date.now();
  let timer: ReturnType<typeof setTimeout> | undefined;

  const stream = new ReadableStream({
    start(controller) {
      // The newest created_at we have shown. It rides on every event as the SSE
      // id, so a reconnect (Last-Event-ID) picks up exactly where it left off.
      let cursor = request.headers.get("last-event-id") || "";
      const send = (event: string, data: unknown) =>
        controller.enqueue(
          encoder.encode(`${cursor ? `id: ${cursor}\n` : ""}event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
        );
      const close = () => {
        if (timer) clearTimeout(timer);
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      };
      request.signal.addEventListener("abort", close);

      let first = true;
      const tick = async () => {
        if (request.signal.aborted) return;
        if (Date.now() - started > MAX_STREAM_MS) return close();
        try {
          const { data } = await db
            .from("messages")
            .select("id, conversation_id, direction, body, status, provider, media_url, kind, routed_from, created_at, conversations!inner(user_id)")
            .eq("conversations.user_id", user.id)
            .gt("created_at", new Date(Date.now() - WINDOW_MS).toISOString())
            .order("created_at", { ascending: true })
            .limit(200);
          const changed = [];
          const resumeAfter = first ? cursor : "";
          for (const m of data ?? []) {
            const sig = `${m.status}`;
            if (seen.get(m.id) !== sig) {
              seen.set(m.id, sig);
              // The first tick only primes `seen` (the page already loaded these),
              // except what arrived after a reconnecting client's last event.
              if (!first || (resumeAfter && m.created_at > resumeAfter)) {
                const msg: Record<string, unknown> = { ...m };
                delete msg.conversations;
                changed.push(msg);
              }
            }
            if (m.created_at > cursor) cursor = m.created_at;
          }
          if (changed.length) send("messages", changed);
          else send("ping", { t: Date.now() });
          first = false;
        } catch (e) {
          console.error("inbox stream error:", e);
        }
        timer = setTimeout(tick, POLL_MS);
      };
      controller.enqueue(encoder.encode("retry: 3000\n\n"));
      tick();
    },
    cancel() {
      if (timer) clearTimeout(timer);
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
