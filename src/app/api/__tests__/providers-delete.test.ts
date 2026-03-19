import { describe, it, expect, vi, beforeEach } from "vitest";

const mockGetUser = vi.fn();
const mockSelectSingle = vi.fn();
const mockDelete = vi.fn();
const mockDeleteEq = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createServerSupabaseClient: vi.fn(async () => ({
    auth: { getUser: mockGetUser },
  })),
  createServiceClient: vi.fn(() => ({
    from: vi.fn((table: string) => {
      if (table === "providers") {
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

describe("DELETE /api/providers/[id]", () => {
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

    const { DELETE } = await import("@/app/api/providers/[id]/route");
    const request = new Request("http://localhost/api/providers/123", { method: "DELETE" });
    const response = await DELETE(request, { params: Promise.resolve({ id: "123" }) });
    expect(response.status).toBe(401);
  });

  it("returns 404 when provider not found", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: "user-1" } } });
    mockSelectSingle.mockResolvedValue({ data: null });

    const { DELETE } = await import("@/app/api/providers/[id]/route");
    const request = new Request("http://localhost/api/providers/123", { method: "DELETE" });
    const response = await DELETE(request, { params: Promise.resolve({ id: "123" }) });
    expect(response.status).toBe(404);
  });

  it("deletes provider successfully", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: "user-1" } } });
    mockSelectSingle.mockResolvedValue({ data: { id: "123", user_id: "user-1" } });
    mockDeleteEq.mockResolvedValue({ error: null });

    const { DELETE } = await import("@/app/api/providers/[id]/route");
    const request = new Request("http://localhost/api/providers/123", { method: "DELETE" });
    const response = await DELETE(request, { params: Promise.resolve({ id: "123" }) });
    expect(response.status).toBe(200);
  });
});
