import { describe, it, expect } from "vitest";
import { parseTelnyxMessage, parseTelnyxStatusEvent } from "../telnyx-status";
import { failureReason } from "@/lib/message-status";

const failed = {
  id: "4031a115-655c-4ee5-8b50-1a19c94aacce",
  to: [{ phone_number: "+14085550100", status: "delivery_failed" }],
  errors: [
    {
      code: "40010",
      title: "Not 10DLC registered",
      detail: "The sending number is not 10DLC-registered but is required to be by the carrier.",
    },
  ],
};

describe("parseTelnyxMessage", () => {
  it("maps delivery_failed to failed with code and detail", () => {
    expect(parseTelnyxMessage(failed)).toEqual({
      messageId: failed.id,
      status: "failed",
      errorCode: "40010",
      errorDetail:
        "Not 10DLC registered: The sending number is not 10DLC-registered but is required to be by the carrier.",
    });
  });

  it("maps sending_failed to failed", () => {
    expect(parseTelnyxMessage({ id: "m", to: [{ status: "sending_failed" }] })?.status).toBe("failed");
  });

  it("maps delivered and clears errors", () => {
    expect(parseTelnyxMessage({ id: "m", to: [{ status: "delivered" }], errors: [] })).toEqual({
      messageId: "m",
      status: "delivered",
      errorCode: null,
      errorDetail: null,
    });
  });

  it("keeps in-flight and unconfirmed statuses as sent", () => {
    for (const s of ["queued", "sending", "sent", "delivery_unconfirmed"]) {
      expect(parseTelnyxMessage({ id: "m", to: [{ status: s }] })?.status).toBe("sent");
    }
  });

  it("returns null for unknown or missing data", () => {
    expect(parseTelnyxMessage(undefined)).toBeNull();
    expect(parseTelnyxMessage({ to: [{ status: "delivered" }] })).toBeNull();
    expect(parseTelnyxMessage({ id: "m", to: [{ status: "weird" }] })).toBeNull();
  });
});

describe("parseTelnyxStatusEvent", () => {
  it("does not treat message.finalized as delivered by itself", () => {
    const update = parseTelnyxStatusEvent({ data: { event_type: "message.finalized", payload: failed } });
    expect(update?.status).toBe("failed");
  });

  it("ignores message.received", () => {
    expect(parseTelnyxStatusEvent({ data: { event_type: "message.received", payload: failed } })).toBeNull();
  });
});

describe("failureReason", () => {
  it("formats detail and code", () => {
    expect(failureReason({ error_code: "40010", error_detail: "Not 10DLC registered" })).toBe(
      "Not 10DLC registered (40010)"
    );
    expect(failureReason({ error_code: "40010" })).toBe("Error 40010");
    expect(failureReason({ error_detail: "Send failed" })).toBe("Send failed");
    expect(failureReason({})).toBeNull();
  });
});
