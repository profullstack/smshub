-- Contacts book per owned number (a "line"): who shares it, where their own
-- cell is, which keypad digit reaches them on a call and which text prefix
-- ("K: ...") files an inbound SMS into their thread. Configured once in
-- Settings > Lines, never per message.

CREATE TABLE IF NOT EXISTS line_contacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  phone_number_id UUID NOT NULL REFERENCES phone_numbers(id) ON DELETE CASCADE,
  -- The contacts row for forward_to, so inbox threads with that cell show the name.
  contact_id UUID REFERENCES contacts(id) ON DELETE SET NULL,
  name TEXT NOT NULL CHECK (char_length(name) BETWEEN 1 AND 60),
  forward_to TEXT NOT NULL CHECK (forward_to ~ '^\+[1-9][0-9]{6,14}$'),
  keypad_digit SMALLINT CHECK (keypad_digit BETWEEN 0 AND 9),
  sms_prefix TEXT CHECK (sms_prefix ~ '^[A-Za-z0-9]{1,8}$'),
  -- Also text a prefixed message on to forward_to. Off until outbound SMS works (10DLC).
  forward_sms BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_line_contacts_line ON line_contacts(phone_number_id);
CREATE INDEX IF NOT EXISTS idx_line_contacts_user ON line_contacts(user_id);
CREATE UNIQUE INDEX IF NOT EXISTS line_contacts_digit_uniq ON line_contacts(phone_number_id, keypad_digit) WHERE keypad_digit IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS line_contacts_prefix_uniq ON line_contacts(phone_number_id, upper(sms_prefix)) WHERE sms_prefix IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS line_contacts_cell_uniq ON line_contacts(phone_number_id, forward_to);

ALTER TABLE line_contacts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can manage their own line contacts" ON line_contacts;
CREATE POLICY "Users can manage their own line contacts"
  ON line_contacts FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Calls are logged in the inbox next to texts; a prefix-routed text keeps who really sent it.
ALTER TABLE messages ADD COLUMN IF NOT EXISTS kind TEXT NOT NULL DEFAULT 'sms';
ALTER TABLE messages DROP CONSTRAINT IF EXISTS messages_kind_check;
ALTER TABLE messages ADD CONSTRAINT messages_kind_check CHECK (kind IN ('sms', 'call'));
ALTER TABLE messages ADD COLUMN IF NOT EXISTS routed_from TEXT;
