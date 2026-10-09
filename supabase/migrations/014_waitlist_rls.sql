-- waitlist shipped without RLS, so the public anon key could read every email.
-- Only /api/waitlist writes it, with the service-role key (which bypasses RLS),
-- so no policies are needed: anon and authenticated get nothing.
ALTER TABLE waitlist ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON waitlist FROM anon, authenticated;
