import { describe, it, expect, vi, beforeEach } from "vitest";

const ID = "11111111-1111-4111-8111-111111111111";
const mockGetUser = vi.fn();
const mockUpdate = vi.fn();
const mockEq = vi.fn();
const mockMaybeSingle = vi.fn();
const mockFrom = vi.fn();
const mockServiceFrom = vi.fn();

// The rename must run on the caller's session (RLS), never the service role.
vi.mock("@/lib/supabase/server", () => ({
  createServerSupabaseClient: vi.fn(async () => ({
    auth: { getUser: mockGetUser },
    from: mockFrom,
  })),
  createServiceClient: vi.fn(() => ({ from: mockServiceFrom })),
}));

function chain() {
  const q: Record<string, unknown> = {
    update: mockUpdate,
    eq: mockEq,
    maybeSingle: mockMaybeSingle,
  };
  q.select = vi.fn(() => q);
  mockUpdate.mockReturnValue(q);
  mockEq.mockReturnValue(q);
  mockFrom.mockReturnValue(q);
}

async function patch(body: unknown, id = ID) {
  const { PATCH } = await import("@/app/api/phone-numbers/[id]/route");
  const request = new Request(`http://localhost/api/phone-numbers/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
  return PATCH(request, { params: Promise.resolve({ id }) });
}

describe("PATCH /api/phone-numbers/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    chain();
  });

  it("returns 401 when not authenticated", async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });
    expect((await patch({ friendly_name: "Mom" })).status).toBe(401);
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it("rejects a name that is too long or not text", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: "user-1" } } });
    expect((await patch({ friendly_name: "x".repeat(61) })).status).toBe(400);
    expect((await patch({ friendly_name: 7 })).status).toBe(400);
    expect((await patch("not json")).status).toBe(400);
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it("returns 404 for a number the caller does not own, or a bad id", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: "user-1" } } });
    mockMaybeSingle.mockResolvedValue({ data: null, error: null });
    expect((await patch({ friendly_name: "Mom" })).status).toBe(404);
    expect((await patch({ friendly_name: "Mom" }, "not-a-uuid")).status).toBe(404);
  });

  it("renames only the caller's own number, on the session client", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: "user-1" } } });
    mockMaybeSingle.mockResolvedValue({
      data: { id: ID, number: "+14155550001", friendly_name: "Mom" },
      error: null,
    });
    const res = await patch({ friendly_name: "  Mom  " });
    expect(res.status).toBe(200);
    expect((await res.json()).phone_number.friendly_name).toBe("Mom");
    expect(mockFrom).toHaveBeenCalledWith("phone_numbers");
    expect(mockUpdate).toHaveBeenCalledWith({ friendly_name: "Mom" });
    expect(mockEq).toHaveBeenCalledWith("id", ID);
    expect(mockEq).toHaveBeenCalledWith("user_id", "user-1");
    expect(mockServiceFrom).not.toHaveBeenCalled();
  });

  it("clears the name with an empty string", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: "user-1" } } });
    mockMaybeSingle.mockResolvedValue({ data: { id: ID, number: "+1", friendly_name: null }, error: null });
    expect((await patch({ friendly_name: "" })).status).toBe(200);
    expect(mockUpdate).toHaveBeenCalledWith({ friendly_name: null });
  });
});
