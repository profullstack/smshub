-- Managed numbers: a user rents a number we own on Telnyx, pays for it through a
-- CoinPay checkout, and it is provisioned when the payment settles and released
-- when the paid period (plus a grace window) runs out.

-- Who owns a number. Bring-your-own rows keep provider_id; managed rows point at a
-- per-user "managed" provider row so every existing join keeps working.
ALTER TABLE phone_numbers
  ADD COLUMN IF NOT EXISTS managed boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'released')),
  ADD COLUMN IF NOT EXISTS expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS released_at timestamptz,
  ADD COLUMN IF NOT EXISTS telnyx_number_id text;

-- Inbound SMS is routed by the number alone, so one live number has one owner.
-- Before this, anyone could type any number into Settings and receive its texts.
CREATE UNIQUE INDEX IF NOT EXISTS phone_numbers_number_active_uniq
  ON phone_numbers (number) WHERE status = 'active';

CREATE INDEX IF NOT EXISTS idx_phone_numbers_expiry
  ON phone_numbers (expires_at) WHERE managed AND status = 'active';

-- A user may not hand-edit the managed columns through PostgREST; the server
-- writes them with the service role.
CREATE OR REPLACE FUNCTION phone_numbers_guard_managed() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  -- PostgREST runs a signed-in browser's queries as the authenticated role.
  IF current_user IN ('authenticated', 'anon') THEN
    IF TG_OP = 'INSERT' AND NEW.managed THEN
      RAISE EXCEPTION 'managed numbers are provisioned by the server';
    END IF;
    IF TG_OP = 'UPDATE' AND (NEW.managed IS DISTINCT FROM OLD.managed
        OR NEW.expires_at IS DISTINCT FROM OLD.expires_at
        OR NEW.status IS DISTINCT FROM OLD.status
        OR NEW.number IS DISTINCT FROM OLD.number) THEN
      RAISE EXCEPTION 'managed number fields are read-only';
    END IF;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS phone_numbers_guard_managed ON phone_numbers;
CREATE TRIGGER phone_numbers_guard_managed
  BEFORE INSERT OR UPDATE ON phone_numbers
  FOR EACH ROW EXECUTE FUNCTION phone_numbers_guard_managed();

-- One row per checkout. kind=new rents a number, kind=renew extends one.
CREATE TABLE IF NOT EXISTS number_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  kind text NOT NULL DEFAULT 'new' CHECK (kind IN ('new', 'renew')),
  phone_number_id uuid REFERENCES phone_numbers(id) ON DELETE SET NULL,
  country text NOT NULL DEFAULT 'US',
  area_code text,
  months integer NOT NULL CHECK (months BETWEEN 1 AND 12),
  amount_usd numeric(10, 2) NOT NULL CHECK (amount_usd > 0),
  chain text NOT NULL,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'paid', 'active', 'failed', 'expired')),
  coinpay_payment_id text UNIQUE,
  pay_url text,
  telnyx_order_id text,
  number text,
  error text,
  attempts integer NOT NULL DEFAULT 0,
  paid_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_number_orders_user ON number_orders (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_number_orders_status ON number_orders (status);

ALTER TABLE number_orders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their own number orders" ON number_orders;
CREATE POLICY "Users can view their own number orders" ON number_orders
  FOR SELECT USING (auth.uid() = user_id);
-- No insert/update policy: orders are written by the server only.

NOTIFY pgrst, 'reload schema';
