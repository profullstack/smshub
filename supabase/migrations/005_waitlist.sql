-- Waitlist for phonenumbers.bot
CREATE TABLE IF NOT EXISTS waitlist (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL,
  product TEXT NOT NULL DEFAULT 'phonenumbers-bot',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(email, product)
);

CREATE INDEX IF NOT EXISTS idx_waitlist_product ON waitlist(product);
