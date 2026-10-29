-- Blocked senders: flag a number as spam or scam and stop hearing from it.
--
-- A block lives on the user's contact row for that phone, so it covers every line the user owns.
-- Inbound texts from a blocked phone are dropped before they are stored (blocked_count says how
-- many), calls from it are hung up unanswered, and its threads are archived when it is blocked.

ALTER TABLE public.contacts
  ADD COLUMN IF NOT EXISTS blocked_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS block_reason TEXT CHECK (block_reason IN ('spam', 'scam', 'other')),
  ADD COLUMN IF NOT EXISTS blocked_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_blocked_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_contacts_blocked ON public.contacts(user_id, phone) WHERE blocked_at IS NOT NULL;
