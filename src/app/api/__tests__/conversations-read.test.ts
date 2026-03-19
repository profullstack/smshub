import { describe, it, expect, vi, beforeEach } from "vitest";

const mockGetUser = vi.fn();
const mockUpdate = vi.fn();
const mockUpdateEq1 = vi.fn();
const mockUpdateEq2 = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createServerSupabaseClient: vi.fn(async () => ({
    auth: { getUser: mockGetUser },
    from: vi.fn(() => ({
      update: mockUpdate,
    })),
  })),
}));

mockUpdate.mockReturnValue({ eq: mockUpdateEq1 });
mockUpdateEq1.mockReturnValue({ eq: mockUpdateEq2 });

describe("POST /api/conversations/[id]/read", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUpdate.mockReturnValue({ eq: mockUpdateEq1 });
    mockUpdateEq1.mockReturnValue({ eq: mockUpdateEq2 });
    mockUpdateEq2.mockResolvedValue({ error: null });
  });

  it("returns 401 when not authenticated", async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });

    const { POST } = await import("@/app/api/conversations/[id]/read/route");
    const request = new Request("http://localhost/api/conversations/123/read", {
      method: "POST",
    });
    const response = await POST(request, { params: Promise.resolve({ id: "123" }) });
    expect(response.status).toBe(401);
  });

  it("marks conversation as read", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: "user-1" } } });

    const { POST } = await import("@/app/api/conversations/[id]/read/route");
    const request = new Request("http://localhost/api/conversations/123/read", {
      method: "POST",
    });
    const response = await POST(request, { params: Promise.resolve({ id: "123" }) });
    expect(response.status).toBe(200);
    const json = await response.json();
    expect(json.ok).toBe(true);
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ last_read_at: expect.any(String) })
    );
  });
});
