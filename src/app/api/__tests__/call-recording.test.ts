import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { FakeDb } from "@/__tests__/fake-db";

const db = new FakeDb();
vi.mock("@/lib/supabase/server", () => ({ createServiceClient: () => db }));
const who = { user: { userId: "u1", email: null, via: "session" as const } };
vi.mock("@/lib/request-user", () => ({ resolveUser: vi.fn(async () => who) }));

const MSG = "44444444-4444-4444-8444-444444444444";

describe("GET /api/messages/:id/recording", () => {
  const fetchMock = vi.fn();
  beforeEach(() => {
    db.tables = {
      // FakeDb ignores embeds, so rows carry them the way PostgREST returns them.
      messages: [
        { id: MSG, kind: "call", provider_message_id: "call:sess-1", recording_seconds: 42, created_at: "2026-10-07T10:44:00Z", conversations: { user_id: "u1", phone_number_id: "pn-1" } },
      ],
      phone_numbers: [{ id: "pn-1", managed: false, providers: { type: "telnyx", api_key: "KEY_CUSTOMER", metadata: null } }],
    };
    fetchMock.mockReset();
    fetchMock.mockImplementation(async (url: string) => {
      if (url.startsWith("https://api.telnyx.com/v2/recordings")) {
        return { ok: true, status: 200, json: async () => ({ data: [{ download_urls: { mp3: "https://s3.example/rec.mp3?sig=1" } }] }) };
      }
      if (url === "https://s3.example/rec.mp3?sig=1") return new Response(new Uint8Array([0x49, 0x44, 0x33]), { status: 200 });
      throw new Error(`unexpected ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => vi.unstubAllGlobals());

  it("streams the MP3 found by the call session, with the line's key", async () => {
    const { GET } = await import("@/app/api/messages/[id]/recording/route");
    const res = await GET(new Request(`http://localhost/api/messages/${MSG}/recording?download=1`), { params: Promise.resolve({ id: MSG }) });
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("audio/mpeg");
    expect(res.headers.get("content-disposition")).toMatch(/^attachment; filename="call-2026-10-07-10-44-00\.mp3"/);
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(new Uint8Array([0x49, 0x44, 0x33]));
    expect(fetchMock.mock.calls[0][0]).toContain("filter[call_session_id]=sess-1");
    expect(fetchMock.mock.calls[0][1].headers.Authorization).toBe("Bearer KEY_CUSTOMER");
  });

  it("is a 404 for someone else's call or a call without a recording", async () => {
    const { GET } = await import("@/app/api/messages/[id]/recording/route");
    db.rows("messages")[0].conversations = { user_id: "u2", phone_number_id: "pn-1" };
    expect((await GET(new Request("http://localhost/x"), { params: Promise.resolve({ id: MSG }) })).status).toBe(404);
    db.rows("messages")[0].conversations = { user_id: "u1", phone_number_id: "pn-1" };
    db.rows("messages")[0].recording_seconds = null;
    expect((await GET(new Request("http://localhost/x"), { params: Promise.resolve({ id: MSG }) })).status).toBe(404);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
