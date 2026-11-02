import { describe, expect, it } from "vitest";
import { alertSpeech, spokenDurations, spokenLinks } from "../call";

describe("spokenLinks", () => {
  it("reads links as domain and path, no scheme", () => {
    expect(spokenLinks("see https://threatcrush.com/incidents/42")).toBe("see threatcrush.com/incidents/42");
    expect(spokenLinks("HTTP://dev2.profullstack.com/ down")).toBe("dev2.profullstack.com down");
    expect(spokenLinks("open https://threatcrush.com/i/42?token=abc#top.")).toBe("open threatcrush.com/i/42.");
    expect(spokenLinks("(http://a.com/x), and https://b.io")).toBe("(a.com/x), and b.io");
  });

  it("leaves bare domains and other text alone", () => {
    for (const t of ["threatcrush.com/incidents/42", "From 23.95.228.174", "httpd restarted"]) {
      expect(spokenLinks(t)).toBe(t);
    }
  });

  it("is what the call speaks", () => {
    const said = alertSpeech("CRITICAL ssh login. Details: https://threatcrush.com/incidents/42");
    expect(said).not.toMatch(/https?:/);
    expect(said).toContain("Details: threatcrush.com/incidents/42.");
  });
});

describe("spokenDurations", () => {
  it("reads duration shorthand as words, singular and plural", () => {
    expect(spokenDurations("crawlproof.com was down for 1m")).toBe("crawlproof.com was down for 1 minute");
    expect(spokenDurations("down for 5m, up after 2h30m")).toBe("down for 5 minutes, up after 2 hours 30 minutes");
    expect(spokenDurations("latency 250ms over 30s, 1d ago, 1.5h")).toBe("latency 250 milliseconds over 30 seconds, 1 day ago, 1.5 hours");
  });

  it("leaves money, versions, ids and words alone", () => {
    for (const t of ["raised $1m", "v0.13.60", "node m5 is fine", "room 12b", "abc5m", "IPv4", "16GB"]) {
      expect(spokenDurations(t)).toBe(t);
    }
  });

  it("is what the call speaks", () => {
    expect(alertSpeech("down for 1m")).toContain("down for 1 minute.");
  });
});
