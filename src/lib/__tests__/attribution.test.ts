// @vitest-environment node
import { describe, it, expect, vi } from "vitest";
import { NextRequest, type NextResponse } from "next/server";
import {
  SOURCE_COOKIE,
  cleanSourceValue,
  encodeSource,
  parseSource,
  sourceFromParams,
  sourceFromRequest,
} from "@/lib/attribution";

vi.mock("@/lib/crawl-gateway", () => ({ gate: async () => null }));
vi.mock("@/lib/throttle", () => ({ meter: async () => null }));

const DAY = new Date("2026-11-18T12:00:00Z");

describe("first-touch source: parsing", () => {
  it("reads utm_* and ref from a page URL and stamps the day", () => {
    const p = new URLSearchParams("utm_source=devto&utm_medium=post&utm_campaign=rev7&ref=abc&other=x");
    expect(sourceFromParams(p, DAY)).toEqual({
      utm_source: "devto",
      utm_medium: "post",
      utm_campaign: "rev7",
      ref: "abc",
      at: "2026-11-18",
    });
  });

  it("is null when no campaign tag is present", () => {
    expect(sourceFromParams(new URLSearchParams("q=1&utm_term=x"), DAY)).toBeNull();
    expect(sourceFromParams(new URLSearchParams("utm_source=%3C%3E"), DAY)).toBeNull();
  });

  it("strips anything that is not tag-like and caps the length", () => {
    expect(cleanSourceValue(" dev<script>to ")).toBe("devscriptto");
    expect(cleanSourceValue("a@b.com")).toBe("ab.com");
    expect(cleanSourceValue("x".repeat(500))).toHaveLength(64);
    expect(cleanSourceValue(42)).toBe("");
  });

  it("round-trips through the cookie value", () => {
    const src = sourceFromParams(new URLSearchParams("utm_source=hn&utm_campaign=launch-1"), DAY)!;
    const v = encodeSource(src);
    expect(v).toBe("utm_source=hn&utm_campaign=launch-1&at=2026-11-18");
    expect(parseSource(v)).toEqual(src);
    expect(parseSource(encodeURIComponent(v))).toEqual(src);
  });

  it("accepts the X-Source forms: query string, bare token, JSON", () => {
    expect(parseSource("utm_source=mcp-client&utm_medium=agent")).toEqual({ utm_source: "mcp-client", utm_medium: "agent" });
    expect(parseSource("devto")).toEqual({ utm_source: "devto" });
    expect(parseSource('{"utm_source":"reddit","ref":"r1","email":"a@b.com"}')).toEqual({ utm_source: "reddit", ref: "r1" });
  });

  it("never throws on junk and drops a malformed date", () => {
    for (const junk of [null, undefined, "", "   ", "{not json", "[1,2]", "%E0%A4%A", "=", "utm_source="]) {
      expect(() => parseSource(junk)).not.toThrow();
      expect(parseSource(junk)).toBeNull();
    }
    expect(parseSource("utm_source=x&at=yesterday")).toEqual({ utm_source: "x" });
  });

  it("prefers the X-Source header, then the cookie", () => {
    const both = new Request("https://smshub.dev/api/v1/numbers/orders", {
      headers: { "x-source": "api-partner", cookie: `a=1; ${SOURCE_COOKIE}=utm_source%3Dhn; b=2` },
    });
    expect(sourceFromRequest(both)).toEqual({ utm_source: "api-partner" });
    const cookieOnly = new Request("https://smshub.dev/api/numbers/orders", {
      headers: { cookie: `a=1; ${SOURCE_COOKIE}=utm_source%3Dhn%26at%3D2026-11-18` },
    });
    expect(sourceFromRequest(cookieOnly)).toEqual({ utm_source: "hn", at: "2026-11-18" });
    expect(sourceFromRequest(new Request("https://smshub.dev/x"))).toBeNull();
  });
});

describe("first-touch source: middleware", () => {
  const run = async (url: string, init: { cookie?: string; method?: string } = {}) => {
    const { middleware } = await import("../../../middleware");
    const headers: Record<string, string> = {};
    if (init.cookie) headers.cookie = init.cookie;
    return (await middleware(new NextRequest(url, { method: init.method ?? "GET", headers }))) as NextResponse;
  };

  it("sets a 30-day smshub_src cookie on a tagged page visit", async () => {
    const res = await run("https://smshub.dev/agents?utm_source=test&utm_medium=qa&utm_campaign=rev7");
    const c = res.cookies.get(SOURCE_COOKIE);
    expect(c).toBeTruthy();
    expect(parseSource(c!.value)).toMatchObject({ utm_source: "test", utm_medium: "qa", utm_campaign: "rev7" });
    expect(c!.maxAge).toBe(60 * 60 * 24 * 30);
    expect(c!.httpOnly).toBe(true);
  });

  it("keeps the first touch: no overwrite when the cookie exists", async () => {
    const res = await run("https://smshub.dev/agents?utm_source=second", { cookie: `${SOURCE_COOKIE}=utm_source%3Dfirst` });
    expect(res.cookies.get(SOURCE_COOKIE)).toBeUndefined();
  });

  it("ignores untagged pages and API routes", async () => {
    expect((await run("https://smshub.dev/agents")).cookies.get(SOURCE_COOKIE)).toBeUndefined();
    expect((await run("https://smshub.dev/api/v1/numbers?utm_source=x")).cookies.get(SOURCE_COOKIE)).toBeUndefined();
  });
});
