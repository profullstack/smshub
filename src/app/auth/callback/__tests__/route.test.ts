import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const exchangeCodeForSession = vi.fn();
const verifyOtp = vi.fn();
const getUser = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createServerSupabaseClient: async () => ({
    auth: { exchangeCodeForSession, verifyOtp, getUser },
  }),
}));

import { GET, safeNextPath } from "../route";

function req(query: string) {
  return new NextRequest(`https://smshub.dev/auth/callback${query}`);
}

const noUser = { data: { user: null } };
const someUser = { data: { user: { id: "u1" } } };

describe("safeNextPath", () => {
  it("defaults to /inbox", () => {
    expect(safeNextPath(null)).toBe("/inbox");
    expect(safeNextPath("")).toBe("/inbox");
  });

  it("keeps same-origin relative paths", () => {
    expect(safeNextPath("/reset-password")).toBe("/reset-password");
  });

  it("rejects absolute and protocol-relative targets", () => {
    expect(safeNextPath("https://evil.example")).toBe("/inbox");
    expect(safeNextPath("//evil.example")).toBe("/inbox");
  });
});

describe("GET /auth/callback", () => {
  beforeEach(() => {
    exchangeCodeForSession.mockReset();
    verifyOtp.mockReset();
    getUser.mockReset();
  });

  it("exchanges a PKCE code and redirects to next once a session exists", async () => {
    exchangeCodeForSession.mockResolvedValue({ error: null });
    getUser.mockResolvedValue(someUser);
    const res = await GET(req("?code=abc&next=/reset-password"));
    expect(exchangeCodeForSession).toHaveBeenCalledWith("abc");
    expect(res.headers.get("location")).toBe("https://smshub.dev/reset-password");
  });

  it("verifies a token_hash link", async () => {
    verifyOtp.mockResolvedValue({ error: null });
    getUser.mockResolvedValue(someUser);
    const res = await GET(req("?token_hash=t&type=signup"));
    expect(verifyOtp).toHaveBeenCalledWith({ token_hash: "t", type: "signup" });
    expect(res.headers.get("location")).toBe("https://smshub.dev/inbox");
  });

  it("ignores an unknown otp type", async () => {
    getUser.mockResolvedValue(noUser);
    const res = await GET(req("?token_hash=t&type=bogus"));
    expect(verifyOtp).not.toHaveBeenCalled();
    expect(res.headers.get("location")).toBe("https://smshub.dev/login?error=link");
  });

  it("sends a failed exchange to /login?error=link", async () => {
    exchangeCodeForSession.mockResolvedValue({ error: new Error("bad code") });
    getUser.mockResolvedValue(noUser);
    const res = await GET(req("?code=bad"));
    expect(res.headers.get("location")).toBe("https://smshub.dev/login?error=link");
  });

  it("does not trust a code that produced no session", async () => {
    exchangeCodeForSession.mockResolvedValue({ error: null });
    getUser.mockResolvedValue(noUser);
    const res = await GET(req("?code=abc"));
    expect(res.headers.get("location")).toBe("https://smshub.dev/login?error=link");
  });

  it("sends a bare visit to /login?error=link", async () => {
    getUser.mockResolvedValue(noUser);
    const res = await GET(req(""));
    expect(exchangeCodeForSession).not.toHaveBeenCalled();
    expect(res.headers.get("location")).toBe("https://smshub.dev/login?error=link");
  });
});
