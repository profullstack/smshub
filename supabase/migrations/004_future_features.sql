-- 004_future_features.sql
-- All future feature migrations: AI, Campaigns, Webhooks, CRM, Teams, Analytics, Multi-tenant, White-label API

-- ============================================================
-- 1. AI Auto-Replies
-- ============================================================

-- Add ai_enabled flag to conversations
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS ai_enabled BOOLEAN NOT NULL DEFAULT false;

-- ============================================================
-- 2. CRM Features - Extend contacts
-- ============================================================

ALTER TABLE contacts ADD COLUMN IF NOT EXISTS email TEXT;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS company TEXT;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS notes TEXT;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS tags TEXT[] DEFAULT '{}';
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS last_contacted_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_contacts_email ON contacts(email);
CREATE INDEX IF NOT EXISTS idx_contacts_company ON contacts(company);
CREATE INDEX IF NOT EXISTS idx_contacts_tags ON contacts USING gin(tags);

-- ============================================================
-- 3. Bulk Messaging Campaigns
-- ============================================================

CREATE TYPE campaign_status AS ENUM ('draft', 'sending', 'sent', 'failed');
CREATE TYPE campaign_recipient_status AS ENUM ('pending', 'sent', 'failed');

CREATE TABLE IF NOT EXISTS campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  message_template TEXT NOT NULL,
  status campaign_status NOT NULL DEFAULT 'draft',
  phone_number_id UUID NOT NULL REFERENCES phone_numbers(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS campaign_recipients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  contact_id UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  status campaign_recipient_status NOT NULL DEFAULT 'pending',
  sent_at TIMESTAMPTZ,
  error TEXT,
  UNIQUE(campaign_id, contact_id)
);

ALTER TABLE campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE campaign_recipients ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own campaigns" ON campaigns
  FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Users can manage own campaign recipients" ON campaign_recipients
  FOR ALL USING (
    EXISTS (SELECT 1 FROM campaigns WHERE campaigns.id = campaign_recipients.campaign_id AND campaigns.user_id = auth.uid())
  );

CREATE INDEX IF NOT EXISTS idx_campaigns_user ON campaigns(user_id);
CREATE INDEX IF NOT EXISTS idx_campaign_recipients_campaign ON campaign_recipients(campaign_id);

-- ============================================================
-- 4. Outbound Webhooks / Event System
-- ============================================================

CREATE TABLE IF NOT EXISTS user_webhooks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  events TEXT[] NOT NULL DEFAULT '{}',
  secret TEXT NOT NULL,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE user_webhooks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own webhooks" ON user_webhooks
  FOR ALL USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_user_webhooks_user ON user_webhooks(user_id);

-- ============================================================
-- 5. Team Inbox / Shared Numbers
-- ============================================================

CREATE TYPE team_role AS ENUM ('admin', 'member');

CREATE TABLE IF NOT EXISTS teams (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS team_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role team_role NOT NULL DEFAULT 'member',
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(team_id, user_id)
);

-- Add optional team_id to phone_numbers
ALTER TABLE phone_numbers ADD COLUMN IF NOT EXISTS team_id UUID REFERENCES teams(id) ON DELETE SET NULL;

ALTER TABLE teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE team_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Team owners can manage teams" ON teams
  FOR ALL USING (auth.uid() = owner_id);

CREATE POLICY "Team members can view their teams" ON teams
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM team_members WHERE team_members.team_id = teams.id AND team_members.user_id = auth.uid())
  );

CREATE POLICY "Team admins can manage members" ON team_members
  FOR ALL USING (
    EXISTS (SELECT 1 FROM teams WHERE teams.id = team_members.team_id AND teams.owner_id = auth.uid())
    OR (auth.uid() = user_id AND current_setting('request.method', true) = 'GET')
  );

CREATE POLICY "Members can view team members" ON team_members
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM team_members tm WHERE tm.team_id = team_members.team_id AND tm.user_id = auth.uid())
  );

-- Update phone_numbers: team members can see shared numbers
CREATE POLICY "Team members can view shared numbers" ON phone_numbers
  FOR SELECT USING (
    team_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM team_members WHERE team_members.team_id = phone_numbers.team_id AND team_members.user_id = auth.uid()
    )
  );

-- Team members can view conversations on shared numbers
CREATE POLICY "Team members can view shared conversations" ON conversations
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM phone_numbers pn
      JOIN team_members tm ON tm.team_id = pn.team_id
      WHERE pn.id = conversations.phone_number_id
      AND tm.user_id = auth.uid()
    )
  );

CREATE INDEX IF NOT EXISTS idx_teams_owner ON teams(owner_id);
CREATE INDEX IF NOT EXISTS idx_team_members_team ON team_members(team_id);
CREATE INDEX IF NOT EXISTS idx_team_members_user ON team_members(user_id);
CREATE INDEX IF NOT EXISTS idx_phone_numbers_team ON phone_numbers(team_id);

-- ============================================================
-- 6. Multi-tenant SaaS Mode
-- ============================================================

CREATE TABLE IF NOT EXISTS organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  plan TEXT NOT NULL DEFAULT 'free',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS org_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'member',
  UNIQUE(org_id, user_id)
);

-- Add org_id to key tables
ALTER TABLE providers ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES organizations(id) ON DELETE SET NULL;
ALTER TABLE phone_numbers ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES organizations(id) ON DELETE SET NULL;
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES organizations(id) ON DELETE SET NULL;

ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE org_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members can view their org" ON organizations
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM org_members WHERE org_members.org_id = organizations.id AND org_members.user_id = auth.uid())
  );

CREATE POLICY "Org admins can manage org" ON organizations
  FOR ALL USING (
    EXISTS (SELECT 1 FROM org_members WHERE org_members.org_id = organizations.id AND org_members.user_id = auth.uid() AND org_members.role = 'admin')
  );

CREATE POLICY "Org members can view members" ON org_members
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM org_members om WHERE om.org_id = org_members.org_id AND om.user_id = auth.uid())
  );

CREATE POLICY "Org admins can manage members" ON org_members
  FOR ALL USING (
    EXISTS (SELECT 1 FROM org_members om WHERE om.org_id = org_members.org_id AND om.user_id = auth.uid() AND om.role = 'admin')
  );

CREATE INDEX IF NOT EXISTS idx_organizations_slug ON organizations(slug);
CREATE INDEX IF NOT EXISTS idx_org_members_org ON org_members(org_id);
CREATE INDEX IF NOT EXISTS idx_org_members_user ON org_members(user_id);
CREATE INDEX IF NOT EXISTS idx_providers_org ON providers(org_id);
CREATE INDEX IF NOT EXISTS idx_phone_numbers_org ON phone_numbers(org_id);
CREATE INDEX IF NOT EXISTS idx_conversations_org ON conversations(org_id);

-- ============================================================
-- 7. White-label API Keys
-- ============================================================

CREATE TABLE IF NOT EXISTS api_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  key_hash TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL DEFAULT 'Default',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_used_at TIMESTAMPTZ
);

ALTER TABLE api_keys ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own API keys" ON api_keys
  FOR ALL USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_api_keys_user ON api_keys(user_id);
CREATE INDEX IF NOT EXISTS idx_api_keys_hash ON api_keys(key_hash);
