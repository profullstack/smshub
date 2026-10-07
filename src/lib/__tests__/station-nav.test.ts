import { describe, expect, it } from "vitest";
import { activeStationTab, stationFrame } from "../station-nav";

describe("stationFrame", () => {
  it("puts the app screens in the app frame", () => {
    for (const p of ["/inbox", "/numbers", "/settings", "/settings/lines", "/contacts/abc"]) {
      expect(stationFrame(p)).toBe("app");
    }
  });

  it("puts sign-in screens in the auth frame", () => {
    for (const p of ["/login", "/register", "/forgot-password", "/reset-password"]) {
      expect(stationFrame(p)).toBe("auth");
    }
  });

  it("treats everything else as the public site, without prefix accidents", () => {
    expect(stationFrame("/")).toBe("site");
    expect(stationFrame("/terms")).toBe("site");
    expect(stationFrame("/inboxes")).toBe("site");
    expect(stationFrame("/numbersfoo")).toBe("site");
  });
});

describe("activeStationTab", () => {
  it("lights the longest matching tab", () => {
    expect(activeStationTab("/settings/lines")?.label).toBe("Lines");
    expect(activeStationTab("/settings")?.label).toBe("Settings");
    expect(activeStationTab("/settings/api-keys")?.label).toBe("Settings");
    expect(activeStationTab("/inbox")?.label).toBe("Receiver");
  });

  it("lights nothing off the tabs", () => {
    expect(activeStationTab("/contacts")).toBeNull();
  });
});
