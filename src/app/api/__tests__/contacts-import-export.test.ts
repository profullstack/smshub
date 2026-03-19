import { describe, it, expect, vi, beforeEach } from "vitest";

const mockGetUser = vi.fn();
const mockSelectFn = vi.fn();
const mockEqFn = vi.fn();
const mockOrderFn = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createServerSupabaseClient: vi.fn(async () => ({
    auth: { getUser: mockGetUser },
    from: vi.fn(() => ({
      select: mockSelectFn,
      insert: vi.fn().mockResolvedValue({ error: null }),
      update: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }),
    })),
  })),
}));

describe("GET /api/contacts/export", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockOrderFn.mockResolvedValue({
      data: [
        { phone: "+1234567890", name: "Alice" },
        { phone: "+0987654321", name: null },
      ],
      error: null,
    });
    mockEqFn.mockReturnValue({ order: mockOrderFn });
    mockSelectFn.mockReturnValue({ eq: mockEqFn });
  });

  it("returns 401 when not authenticated", async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });

    const { GET } = await import("@/app/api/contacts/export/route");
    const response = await GET();
    expect(response.status).toBe(401);
  });

  it("exports contacts as CSV", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: "user-1" } } });

    const { GET } = await import("@/app/api/contacts/export/route");
    const response = await GET();

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("text/csv");

    const text = await response.text();
    expect(text).toContain("phone,name");
    expect(text).toContain("+1234567890");
    expect(text).toContain("Alice");
  });
});

describe("POST /api/contacts/import", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mockSelectFn.mockReturnValue({
      eq: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({ data: null }),
        }),
      }),
    });
  });

  it("returns 401 when not authenticated", async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });

    const { POST } = await import("@/app/api/contacts/import/route");
    const request = new Request("http://localhost/api/contacts/import", {
      method: "POST",
      body: "phone,name\n+1234567890,Test",
    });

    const response = await POST(request);
    expect(response.status).toBe(401);
  });

  it("returns 400 for empty CSV", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: "user-1" } } });

    const { POST } = await import("@/app/api/contacts/import/route");
    const request = new Request("http://localhost/api/contacts/import", {
      method: "POST",
      body: "phone,name\n",
    });

    const response = await POST(request);
    expect(response.status).toBe(400);
  });
});
