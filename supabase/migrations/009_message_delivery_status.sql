-- Carrier delivery outcome for outbound messages. 'sent' only means the
-- provider accepted the message; Telnyx reports the real result later in
-- message.finalized (e.g. delivery_failed / 40010 "Not 10DLC registered").
ALTER TABLE messages ADD COLUMN IF NOT EXISTS error_code TEXT;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS error_detail TEXT;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS status_updated_at TIMESTAMPTZ;
