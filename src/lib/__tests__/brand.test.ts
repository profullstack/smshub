import { describe, expect, it } from "vitest";
import { brandForHost, brandOriginForHost, normalizeHost, parseBrandHosts } from "../brand";

const env = (extra: Record<string, string> = {}) => ({ NODE_ENV: "test", ...extra }) as NodeJS.ProcessEnv;

describe("brand resolution", () => {
  it("serves SMSHub on smshub.dev and on any host nobody claims", () => {
    expect(brandForHost("smshub.dev", env()).id).toBe("smshub");
    expect(brandForHost("evil.example", env()).id).toBe("smshub");
    expect(brandForHost(null, env()).id).toBe("smshub");
  });

  it("maps configured hosts to their brand, ignoring case, port and trailing dot", () => {
    const e = env({ BRAND_HOSTS: "numberstation.example=numberstation, www.numberstation.example=numberstation" });
    expect(brandForHost("numberstation.example", e).id).toBe("numberstation");
    expect(brandForHost("WWW.NumberStation.example:443", e).id).toBe("numberstation");
    expect(brandForHost("numberstation.example.", e).id).toBe("numberstation");
    expect(brandForHost("smshub.dev", e).id).toBe("smshub");
  });

  it("takes the first value of a forwarded host list", () => {
    expect(normalizeHost("a.example, b.example")).toBe("a.example");
  });

  it("knows numberstation.localhost for local work", () => {
    expect(brandForHost("numberstation.localhost:3000", env()).id).toBe("numberstation");
  });

  it("lets BRAND force a brand", () => {
    expect(brandForHost("smshub.dev", env({ BRAND: "numberstation" })).id).toBe("numberstation");
    expect(brandForHost("smshub.dev", env({ BRAND: "nope" })).id).toBe("smshub");
  });

  it("drops unknown brands and blank pairs from BRAND_HOSTS", () => {
    expect(parseBrandHosts("a.example=nope,,=numberstation,b.example=numberstation")).toEqual({
      "b.example": "numberstation",
    });
  });
});

describe("brandOriginForHost", () => {
  const e = env({ BRAND_HOSTS: "numberstation.example=numberstation" });

  it("returns https origin for a configured host", () => {
    expect(brandOriginForHost("numberstation.example", e)).toBe("https://numberstation.example");
  });

  it("returns null for a host that is not configured, so redirects cannot be steered by a forged Host", () => {
    expect(brandOriginForHost("evil.example", e)).toBeNull();
    expect(brandOriginForHost("smshub.dev", e)).toBeNull();
    expect(brandOriginForHost("", e)).toBeNull();
  });

  it("keeps http and the port for local .localhost hosts", () => {
    expect(brandOriginForHost("numberstation.localhost:3000", e)).toBe("http://numberstation.localhost:3000");
  });
});
