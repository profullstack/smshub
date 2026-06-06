CREATE TABLE IF NOT EXISTS coinpay_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE,
  coinpay_user_id TEXT,
  email TEXT,
  name TEXT,
  access_token TEXT NOT NULL,
  refresh_token TEXT,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE coinpay_connections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own CoinPay connection" ON coinpay_connections
  FOR SELECT
  TO authenticated
  USING (user_id = (SELECT auth.uid()));

CREATE POLICY "Users can delete own CoinPay connection" ON coinpay_connections
  FOR DELETE
  TO authenticated
  USING (user_id = (SELECT auth.uid()));

CREATE INDEX IF NOT EXISTS idx_coinpay_connections_user ON coinpay_connections(user_id);
