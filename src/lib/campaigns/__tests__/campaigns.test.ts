import { describe, it, expect } from "vitest";
import type {
  Campaign,
  CampaignRecipient,
  CampaignWithStats,
  CreateCampaignInput,
} from "../types";

describe("Campaign types", () => {
  it("Campaign interface has expected shape", () => {
    const campaign: Campaign = {
      id: "camp-1",
      user_id: "user-1",
      name: "Test Campaign",
      message_template: "Hello {{name}}!",
      status: "draft",
      phone_number_id: "pn-1",
      created_at: "2024-01-01T00:00:00Z",
    };
    expect(campaign.status).toBe("draft");
    expect(campaign.name).toBe("Test Campaign");
  });

  it("CampaignRecipient interface has expected shape", () => {
    const recipient: CampaignRecipient = {
      id: "cr-1",
      campaign_id: "camp-1",
      contact_id: "contact-1",
      status: "pending",
      sent_at: null,
      error: null,
    };
    expect(recipient.status).toBe("pending");
  });

  it("CampaignWithStats extends Campaign with counts", () => {
    const campaign: CampaignWithStats = {
      id: "camp-1",
      user_id: "user-1",
      name: "Test",
      message_template: "Hello!",
      status: "sent",
      phone_number_id: "pn-1",
      created_at: "2024-01-01T00:00:00Z",
      total_recipients: 10,
      sent_count: 8,
      failed_count: 2,
      pending_count: 0,
    };
    expect(campaign.total_recipients).toBe(10);
    expect(campaign.sent_count + campaign.failed_count + campaign.pending_count).toBe(10);
  });

  it("CreateCampaignInput has required fields", () => {
    const input: CreateCampaignInput = {
      name: "New Campaign",
      message_template: "Hi!",
      phone_number_id: "pn-1",
      contact_ids: ["c-1", "c-2"],
    };
    expect(input.contact_ids).toHaveLength(2);
  });
});
