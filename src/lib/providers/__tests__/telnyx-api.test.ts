import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { configureTelnyxWebhooks, sameWebhookUrl } from "../telnyx-api";

const HOOK = "https://smshub.dev/api/webhooks/telnyx";

function json(body: unknown, status = 200) {
  return { ok: status < 400, status, json: async () => body };
}

describe("configureTelnyxWebhooks", () => {
  const fetchMock = vi.fn();
  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => vi.unstubAllGlobals());

  function account(profiles: unknown[], numbers: unknown[], patchStatus = 200) {
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (init?.method === "PATCH") return json({ data: {} }, patchStatus);
      if (url.includes("/messaging_profiles")) return json({ data: profiles, meta: { total_pages: 1 } });
      if (url.includes("/phone_numbers/messaging")) return json({ data: numbers, meta: { total_pages: 1 } });
      throw new Error(`unexpected ${url}`);
    });
  }

  const patches = () =>
    fetchMock.mock.calls
      .filter(([, init]) => init?.method === "PATCH")
      .map(([url, init]) => ({ url, body: JSON.parse(init.body) }));

  it("sets the webhook on a profile that has none", async () => {
    account(
      [{ id: "p1", name: "Main", webhook_url: null }],
      [{ phone_number: "+17139303938", messaging_profile_id: "p1" }]
    );
    const res = await configureTelnyxWebhooks("KEY", HOOK);
    expect(res.ok).toBe(true);
    expect(res.profiles[0]).toMatchObject({ profileId: "p1", action: "updated", numbers: ["+17139303938"] });
    expect(patches()).toEqual([
      { url: "https://api.telnyx.com/v2/messaging_profiles/p1", body: { webhook_url: HOOK, webhook_api_version: "2" } },
    ]);
  });

  it("leaves a profile that feeds another app alone unless forced", async () => {
    account(
      [{ id: "p1", name: "Other app", webhook_url: "https://other.example/hook" }],
      [{ phone_number: "+17139303938", messaging_profile_id: "p1" }]
    );
    const res = await configureTelnyxWebhooks("KEY", HOOK);
    expect(res.ok).toBe(false);
    expect(res.profiles[0]).toMatchObject({ action: "points_elsewhere", previousUrl: "https://other.example/hook" });
    expect(patches()).toEqual([]);

    const forced = await configureTelnyxWebhooks("KEY", HOOK, { force: true });
    expect(forced.profiles[0].action).toBe("updated");
  });

  it("does nothing when the profile already points here", async () => {
    account([{ id: "p1", name: "Main", webhook_url: `${HOOK}/` }], [{ phone_number: "+1", messaging_profile_id: "p1" }]);
    const res = await configureTelnyxWebhooks("KEY", HOOK);
    expect(res.profiles[0].action).toBe("already_set");
    expect(patches()).toEqual([]);
  });

  it("only touches profiles owning the given numbers, and reports numbers with no profile", async () => {
    account(
      [
        { id: "p1", name: "Mine", webhook_url: null },
        { id: "p2", name: "Not mine", webhook_url: null },
      ],
      [
        { phone_number: "+17139303938", messaging_profile_id: "p1" },
        { phone_number: "+18885550000", messaging_profile_id: "p2" },
        { phone_number: "+14085550000", messaging_profile_id: "" },
      ]
    );
    const res = await configureTelnyxWebhooks("KEY", HOOK, { onlyNumbers: ["+17139303938", "+14085550000"] });
    expect(res.profiles.map((p) => p.profileId)).toEqual(["p1"]);
    expect(res.numbersWithoutProfile).toEqual(["+14085550000"]);
  });

  it("surfaces a Telnyx error code", async () => {
    fetchMock.mockResolvedValue(json({ errors: [{ code: "10009", title: "Authentication failed" }] }, 401));
    const res = await configureTelnyxWebhooks("BAD", HOOK);
    expect(res.ok).toBe(false);
    expect(res.error).toMatchObject({ status: 401, code: "10009", message: "Authentication failed" });
  });

  it("compares webhook URLs loosely", () => {
    expect(sameWebhookUrl("https://SMSHUB.dev/api/webhooks/telnyx/", HOOK)).toBe(true);
    expect(sameWebhookUrl(null, HOOK)).toBe(false);
  });
});
