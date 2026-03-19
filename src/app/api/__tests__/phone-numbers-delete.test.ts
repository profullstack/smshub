import { describe, it, expect, vi, beforeEach } from "vitest";

const mockGetUser = vi.fn();
const mockSelectSingle = vi.fn();
const mockDelete = vi.fn();
const mockDeleteEq = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createServerSupabaseClient: vi.fn(async () => ({
    auth: { getUser: mockGetUser },
    from: vi.fn((table: string) => {
      if (table === "phone_numbers") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn(() => ({
                single: mockSelectSingle,
              })),
            })),
          })),
          delete: mockDelete,
        };
      }
      return {};
    }),
  })),
}));

mockDelete.mockReturnValue({
  eq: vi.fn(() => ({
    eq: mockDeleteEq,
  })),
});

describe("DELETE /api/phone-numbers/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDelete.mockReturnValue({
      eq: vi.fn(() => ({
        eq: mockDeleteEq,
      })),
    });
  });

  it("returns 401 when not authenticated", async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });

    const { DELETE } = await import("@/app/api/phone-numbers/[id]/route");
    const request = new Request("http://localhost/api/phone-numbers/123", { method: "DELETE" });
    const response = await DELETE(request, { params: Promise.resolve({ id: "123" }) });
    expect(response.status).toBe(401);
  });

  it("returns 404 when phone number not found", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: "user-1" } } });
    mockSelectSingle.mockResolvedValue({ data: null });

    const { DELETE } = await import("@/app/api/phone-numbers/[id]/route");
    const request = new Request("http://localhost/api/phone-numbers/123", { method: "DELETE" });
    const response = await DELETE(request, { params: Promise.resolve({ id: "123" }) });
    expect(response.status).toBe(404);
  });

  it("deletes phone number successfully", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: "user-1" } } });
    mockSelectSingle.mockResolvedValue({ data: { id: "123" } });
    mockDeleteEq.mockResolvedValue({ error: null });

    const { DELETE } = await import("@/app/api/phone-numbers/[id]/route");
    const request = new Request("http://localhost/api/phone-numbers/123", { method: "DELETE" });
    const response = await DELETE(request, { params: Promise.resolve({ id: "123" }) });
    expect(response.status).toBe(200);
    const json = await response.json();
    expect(json.ok).toBe(true);
  });
});
