export type Provider = "twilio" | "telnyx";
export type MessageDirection = "inbound" | "outbound";
export type MessageStatus = "queued" | "sent" | "delivered" | "failed";

export interface Database {
  public: {
    Tables: {
      providers: {
        Row: {
          id: string;
          user_id: string;
          type: Provider;
          api_key: string;
          api_secret: string | null;
          metadata: Record<string, unknown> | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          type: Provider;
          api_key: string;
          api_secret?: string | null;
          metadata?: Record<string, unknown> | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          type?: Provider;
          api_key?: string;
          api_secret?: string | null;
          metadata?: Record<string, unknown> | null;
          created_at?: string;
        };
      };
      phone_numbers: {
        Row: {
          id: string;
          user_id: string;
          provider_id: string;
          number: string;
          friendly_name: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          provider_id: string;
          number: string;
          friendly_name?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          provider_id?: string;
          number?: string;
          friendly_name?: string | null;
          created_at?: string;
        };
      };
      contacts: {
        Row: {
          id: string;
          user_id: string;
          phone: string;
          name: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          phone: string;
          name?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          phone?: string;
          name?: string | null;
          created_at?: string;
        };
      };
      conversations: {
        Row: {
          id: string;
          user_id: string;
          contact_id: string;
          phone_number_id: string;
          last_message_at: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          contact_id: string;
          phone_number_id: string;
          last_message_at?: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          contact_id?: string;
          phone_number_id?: string;
          last_message_at?: string;
          created_at?: string;
        };
      };
      messages: {
        Row: {
          id: string;
          conversation_id: string;
          direction: MessageDirection;
          body: string;
          status: MessageStatus;
          provider: Provider;
          provider_message_id: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          conversation_id: string;
          direction: MessageDirection;
          body: string;
          status?: MessageStatus;
          provider: Provider;
          provider_message_id?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          conversation_id?: string;
          direction?: MessageDirection;
          body?: string;
          status?: MessageStatus;
          provider?: Provider;
          provider_message_id?: string | null;
          created_at?: string;
        };
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: {
      provider_type: Provider;
      message_direction: MessageDirection;
      message_status: MessageStatus;
    };
  };
}
