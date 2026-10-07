-- Call recordings: a number can record the calls its voice menu answers
-- (callers hear "This call may be recorded" first). Telnyx keeps the MP3;
-- smshub fetches it when someone presses play.
ALTER TABLE phone_numbers ADD COLUMN IF NOT EXISTS record_calls BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS recording_seconds INTEGER;
