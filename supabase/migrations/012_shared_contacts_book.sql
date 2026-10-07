-- A line can use another line's contacts book: one family menu and one set of
-- text prefixes answering on several numbers (e.g. a local and a toll-free).
ALTER TABLE phone_numbers
  ADD COLUMN IF NOT EXISTS contacts_line_id UUID REFERENCES phone_numbers(id) ON DELETE SET NULL;
ALTER TABLE phone_numbers DROP CONSTRAINT IF EXISTS phone_numbers_contacts_line_not_self;
ALTER TABLE phone_numbers ADD CONSTRAINT phone_numbers_contacts_line_not_self CHECK (contacts_line_id IS DISTINCT FROM id);
