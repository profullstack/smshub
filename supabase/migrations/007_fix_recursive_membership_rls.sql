-- Fix recursive RLS policies on membership tables.
-- Policies on team_members/org_members cannot query their own table directly;
-- use SECURITY DEFINER helpers so membership checks bypass RLS safely.

CREATE OR REPLACE FUNCTION public.is_team_owner(check_team_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.teams
    WHERE teams.id = check_team_id
      AND teams.owner_id = (SELECT auth.uid())
  );
$$;

CREATE OR REPLACE FUNCTION public.is_team_member(check_team_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.team_members
    WHERE team_members.team_id = check_team_id
      AND team_members.user_id = (SELECT auth.uid())
  );
$$;

CREATE OR REPLACE FUNCTION public.is_org_member(check_org_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.org_members
    WHERE org_members.org_id = check_org_id
      AND org_members.user_id = (SELECT auth.uid())
  );
$$;

CREATE OR REPLACE FUNCTION public.is_org_admin(check_org_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.org_members
    WHERE org_members.org_id = check_org_id
      AND org_members.user_id = (SELECT auth.uid())
      AND org_members.role = 'admin'
  );
$$;

REVOKE ALL ON FUNCTION public.is_team_owner(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.is_team_member(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.is_org_member(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.is_org_admin(UUID) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.is_team_owner(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_team_member(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_org_member(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_org_admin(UUID) TO authenticated;

DROP POLICY IF EXISTS "Team members can view their teams" ON public.teams;
DROP POLICY IF EXISTS "Team admins can manage members" ON public.team_members;
DROP POLICY IF EXISTS "Members can view team members" ON public.team_members;

CREATE POLICY "Team members can view their teams" ON public.teams
  FOR SELECT
  TO authenticated
  USING ((SELECT public.is_team_member(id)));

CREATE POLICY "Team owners can manage members" ON public.team_members
  FOR ALL
  TO authenticated
  USING ((SELECT public.is_team_owner(team_id)))
  WITH CHECK ((SELECT public.is_team_owner(team_id)));

CREATE POLICY "Team members can view team members" ON public.team_members
  FOR SELECT
  TO authenticated
  USING (
    user_id = (SELECT auth.uid())
    OR (SELECT public.is_team_member(team_id))
  );

DROP POLICY IF EXISTS "Org members can view their org" ON public.organizations;
DROP POLICY IF EXISTS "Org admins can manage org" ON public.organizations;
DROP POLICY IF EXISTS "Org members can view members" ON public.org_members;
DROP POLICY IF EXISTS "Org admins can manage members" ON public.org_members;

CREATE POLICY "Org members can view their org" ON public.organizations
  FOR SELECT
  TO authenticated
  USING ((SELECT public.is_org_member(id)));

CREATE POLICY "Org admins can manage org" ON public.organizations
  FOR ALL
  TO authenticated
  USING ((SELECT public.is_org_admin(id)))
  WITH CHECK ((SELECT public.is_org_admin(id)));

CREATE POLICY "Org members can view members" ON public.org_members
  FOR SELECT
  TO authenticated
  USING (
    user_id = (SELECT auth.uid())
    OR (SELECT public.is_org_member(org_id))
  );

CREATE POLICY "Org admins can manage members" ON public.org_members
  FOR ALL
  TO authenticated
  USING ((SELECT public.is_org_admin(org_id)))
  WITH CHECK ((SELECT public.is_org_admin(org_id)));
