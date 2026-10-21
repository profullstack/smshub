import { describe, it, expect } from "vitest";
import { safePayUrl, unfinishedOrder } from "../recovery";

const base = { kind: "new" as const, area_code: null, months: 1, amount_usd: 5, chain: "USDC_POL" };
const ago = (min: number) => new Date(Date.now() - min * 60_000).toISOString();

describe("unfinished order", () => {
  it("offers the newest order when it expired unpaid this week", () => {
    expect(unfinishedOrder([{ ...base, id: "a", status: "expired", created_at: ago(90) }])?.id).toBe("a");
    expect(unfinishedOrder([{ ...base, id: "a", status: "pending", created_at: ago(61) }])?.id).toBe("a");
  });
  it("offers nothing when a newer order is paid or still open, or it is old", () => {
    expect(
      unfinishedOrder([
        { ...base, id: "a", status: "expired", created_at: ago(90) },
        { ...base, id: "b", status: "active", created_at: ago(30) },
      ])
    ).toBeNull();
    expect(unfinishedOrder([{ ...base, id: "a", status: "pending", created_at: ago(5) }])).toBeNull();
    expect(unfinishedOrder([{ ...base, id: "a", status: "expired", created_at: ago(8 * 1440) }])).toBeNull();
    expect(unfinishedOrder([])).toBeNull();
  });
  it("only sends the browser to CoinPay pages", () => {
    expect(safePayUrl("https://coinpayportal.com/pay/x")).toBeTruthy();
    expect(safePayUrl("https://coinpayportal.com/checkout/cs_1")).toBeTruthy();
    expect(safePayUrl("https://evil.example/pay/x")).toBeNull();
    expect(safePayUrl("javascript:alert(1)")).toBeNull();
  });
});
