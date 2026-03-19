import { describe, it, expect, vi, beforeEach } from "vitest";

const mockGetUser = vi.fn();
const mockUpdate = vi.fn();
const mockUpdateEq = vi.fn();
const mockUpdateEqSingle = vi.fn();
const mockSelect = vi.fn();
const mockDelete = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createServerSupabaseClient: vi.fn(async () => ({
    auth: { getUser: mockGetUser },
    from: vi.fn((table: string) => {
      if (table === "messages") {
        return {
          delete: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({ error: null }),
          }),
        };
      }
      return {
        update: mockUpdate,
        delete: mockDelete,
      };
    }),
  })),
}));

describe("PATCH /api/conversations/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSelect.mockReturnValue({
      single: mockUpdateEqSingle,
    });
    mockUpdateEq.mockReturnValue({
      select: mockSelect,
      eq: vi.fn().mockReturnValue({
        select: mockSelect,
      }),
    });
    mockUpdate.mockReturnValue({ eq: mockUpdateEq });
    mockUpdateEqSingle.mockResolvedValue({
      data: { id: "conv-1", archived: true },
      error: null,
    });
  });

  it("returns 401 when not authenticated", async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });

    const { PATCH } = await import("@/app/api/conversations/[id]/route");
    const request = new Request("http://localhost/api/conversations/123", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ archived: true }),
    });

    const response = await PATCH(request, { params: Promise.resolve({ id: "123" }) });
    expect(response.status).toBe(401);
  });

  it("returns 400 when archived is not boolean", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: "user-1" } } });

    const { PATCH } = await import("@/app/api/conversations/[id]/route");
    const request = new Request("http://localhost/api/conversations/123", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ archived: "yes" }),
    });

    const response = await PATCH(request, { params: Promise.resolve({ id: "123" }) });
    expect(response.status).toBe(400);
  });

  it("archives a conversation", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: "user-1" } } });

    const { PATCH } = await import("@/app/api/conversations/[id]/route");
    const request = new Request("http://localhost/api/conversations/123", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ archived: true }),
    });

    const response = await PATCH(request, { params: Promise.resolve({ id: "123" }) });
    expect(response.status).toBe(200);
    const json = await response.json();
    expect(json.conversation.archived).toBe(true);
  });
});

describe("DELETE /api/conversations/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDelete.mockReturnValue({
      eq: vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ error: null }),
      }),
    });
    mockUpdate.mockReturnValue({
      eq: vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ error: null }),
      }),
    });
  });

  it("returns 401 when not authenticated", async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });

    const { DELETE } = await import("@/app/api/conversations/[id]/route");
    const request = new Request("http://localhost/api/conversations/123", {
      method: "DELETE",
    });

    const response = await DELETE(request, { params: Promise.resolve({ id: "123" }) });
    expect(response.status).toBe(401);
  });

  it("soft deletes by default (archives)", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: "user-1" } } });

    const { DELETE } = await import("@/app/api/conversations/[id]/route");
    const request = new Request("http://localhost/api/conversations/123", {
      method: "DELETE",
    });

    const response = await DELETE(request, { params: Promise.resolve({ id: "123" }) });
    expect(response.status).toBe(200);
    expect(mockUpdate).toHaveBeenCalledWith({ archived: true });
  });

  it("hard deletes when ?hard=true", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: "user-1" } } });

    const { DELETE } = await import("@/app/api/conversations/[id]/route");
    const request = new Request("http://localhost/api/conversations/123?hard=true", {
      method: "DELETE",
    });

    const response = await DELETE(request, { params: Promise.resolve({ id: "123" }) });
    expect(response.status).toBe(200);
    expect(mockDelete).toHaveBeenCalled();
  });
});
