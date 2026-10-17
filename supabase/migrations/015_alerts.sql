-- Alerts: an account sends itself (or someone on its lines) a short alert by
-- API, MCP or CLI. It goes out as a text when the sending number can deliver
-- one, otherwise (or when critical) as a phone call that reads it aloud.
-- The account's alert phone is set once in Settings > Alerts with an explicit
-- consent checkbox; the wording agreed to is kept with the timestamp.

CREATE TABLE IF NOT EXISTS alert_settings (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  phone TEXT CHECK (phone ~ '^\+[1-9][0-9]{6,14}$'),
  consent BOOLEAN NOT NULL DEFAULT false,
  consent_text TEXT,
  consented_at TIMESTAMPTZ,
  -- Set when the phone replied STOP; cleared by consenting again.
  opted_out_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE alert_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can manage their own alert settings" ON alert_settings;
CREATE POLICY "Users can manage their own alert settings"
  ON alert_settings FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE TABLE IF NOT EXISTS alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  to_phone TEXT NOT NULL,
  message TEXT NOT NULL CHECK (char_length(message) BETWEEN 1 AND 600),
  severity TEXT NOT NULL DEFAULT 'warning' CHECK (severity IN ('info', 'warning', 'critical')),
  -- What actually went out: sms, call, or both.
  channels TEXT[] NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'sending' CHECK (status IN ('sending', 'sent', 'failed')),
  error TEXT,
  sms_message_id UUID REFERENCES messages(id) ON DELETE SET NULL,
  call_message_id UUID REFERENCES messages(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_alerts_user_created ON alerts(user_id, created_at DESC);

ALTER TABLE alerts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read their own alerts" ON alerts;
CREATE POLICY "Users can read their own alerts"
  ON alerts FOR SELECT
  USING (auth.uid() = user_id);
