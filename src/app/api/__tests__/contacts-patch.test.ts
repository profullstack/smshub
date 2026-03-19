import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// Mock supabase server
const mockUpdate = vi.fn();
const mockEq = vi.fn();
const mockSelect = vi.fn();
const mockSingle = vi.fn();
const mockGetUser = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createServerSupabaseClient: vi.fn(async () => ({
    auth: {
      getUser: mockGetUser,
    },
    from: vi.fn(() => ({
      update: mockUpdate,
    })),
  })),
}));

// Chain mocks
mockUpdate.mockReturnValue({ eq: mockEq });
mockEq.mockReturnValue({ eq: vi.fn().mockReturnValue({ select: mockSelect }) });
mockSelect.mockReturnValue({ single: mockSingle });

describe("PATCH /api/contacts/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when not authenticated", async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });

    const { PATCH } = await import("@/app/api/contacts/[id]/route");
    const request = new NextRequest("http://localhost/api/contacts/123", {
      method: "PATCH",
      body: JSON.stringify({ name: "Test" }),
      headers: { "Content-Type": "application/json" },
    });

    const response = await PATCH(request, { params: Promise.resolve({ id: "123" }) });
    expect(response.status).toBe(401);
  });

  it("returns 400 for invalid name type", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: "user-1" } } });

    const { PATCH } = await import("@/app/api/contacts/[id]/route");
    const request = new NextRequest("http://localhost/api/contacts/123", {
      method: "PATCH",
      body: JSON.stringify({ name: 42 }),
      headers: { "Content-Type": "application/json" },
    });

    const response = await PATCH(request, { params: Promise.resolve({ id: "123" }) });
    expect(response.status).toBe(400);
  });
});
