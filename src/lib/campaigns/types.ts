export type CampaignStatus = "draft" | "sending" | "sent" | "failed";
export type CampaignRecipientStatus = "pending" | "sent" | "failed";

export interface Campaign {
  id: string;
  user_id: string;
  name: string;
  message_template: string;
  status: CampaignStatus;
  phone_number_id: string;
  created_at: string;
}

export interface CampaignRecipient {
  id: string;
  campaign_id: string;
  contact_id: string;
  status: CampaignRecipientStatus;
  sent_at: string | null;
  error: string | null;
}

export interface CampaignWithStats extends Campaign {
  total_recipients: number;
  sent_count: number;
  failed_count: number;
  pending_count: number;
}

export interface CampaignRecipientWithContact extends CampaignRecipient {
  contacts: {
    id: string;
    phone: string;
    name: string | null;
  } | null;
}

export interface CreateCampaignInput {
  name: string;
  message_template: string;
  phone_number_id: string;
  contact_ids: string[];
}
