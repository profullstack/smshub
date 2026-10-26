import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const getUserById = vi.fn();
const upsert = vi.fn();
const existing = vi.fn();

// A service-role supabase-js stand-in: auth.admin plus the user_profiles table.
vi.mock("@/lib/supabase/server", () => ({
  createServiceClient: () => ({
    auth: { admin: { getUserById } },
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: existing(), error: null }) }) }),
      upsert: (row: Record<string, unknown>, opts: unknown) => {
        upsert(row, opts);
        return { select: () => ({ single: async () => ({ data: row, error: null }) }) };
      },
    }),
  }),
}));

const fields = {
  email: "Ada@Acme.com",
  first_name: "Ada",
  last_name: "Lovelace",
  company_domain: "https://www.acme.com/about",
  job_title: " VP Engineering ",
  linkedin_url: "in/ada-lovelace",
};

function post(body: unknown) {
  return new NextRequest("http://localhost/api/auth/signup-profile", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}

describe("POST /api/auth/signup-profile", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    existing.mockReturnValue(null);
  });

  it("refuses a signup without first and last name", async () => {
    const { POST } = await import("@/app/api/auth/signup-profile/route");
    const res = await POST(post({ email: "ada@acme.com" }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(Object.keys(body.errors)).toEqual(expect.arrayContaining(["first_name", "last_name"]));
  });

  it("stores the six fields for the account signUp just created", async () => {
    getUserById.mockResolvedValue({
      data: { user: { id: "u1", email: "ada@acme.com", created_at: new Date().toISOString(), email_confirmed_at: null } },
      error: null,
    });
    const { POST } = await import("@/app/api/auth/signup-profile/route");
    const res = await POST(post({ ...fields, user_id: "u1" }));
    expect(res.status).toBe(200);
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: "u1",
        email: "ada@acme.com",
        first_name: "Ada",
        last_name: "Lovelace",
        company_domain: "acme.com",
        job_title: "VP Engineering",
        linkedin_url: "https://www.linkedin.com/in/ada-lovelace",
      }),
      { onConflict: "user_id" },
    );
  });

  it("will not write a confirmed or someone else's account", async () => {
    getUserById.mockResolvedValue({
      data: { user: { id: "u2", email: "ada@acme.com", created_at: new Date().toISOString(), email_confirmed_at: "2026-01-01" } },
      error: null,
    });
    const { POST } = await import("@/app/api/auth/signup-profile/route");
    expect((await POST(post({ ...fields, user_id: "u2" }))).status).toBe(403);
    getUserById.mockResolvedValue({
      data: { user: { id: "u3", email: "other@acme.com", created_at: new Date().toISOString(), email_confirmed_at: null } },
      error: null,
    });
    expect((await POST(post({ ...fields, user_id: "u3" }))).status).toBe(403);
    expect(upsert).not.toHaveBeenCalled();
  });
});
