-- Contact groups: named lists of people to text together, optionally as a group chat.
--
-- A group belongs to one user and may name the number it texts from. With relay on, a text from
-- a member to that number is passed on to every other member ("Kim: running late"), so a group
-- works like an SMS group chat. external_ref lets another app keep one group per thing of its own
-- (group.call keeps one per room: "groupcall:4821") and upsert it by that reference.

CREATE TABLE IF NOT EXISTS public.contact_groups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  phone_number_id UUID REFERENCES public.phone_numbers(id) ON DELETE SET NULL,
  relay BOOLEAN NOT NULL DEFAULT false,
  external_ref TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_sent_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_contact_groups_user ON public.contact_groups(user_id);
CREATE UNIQUE INDEX IF NOT EXISTS contact_groups_user_ref ON public.contact_groups(user_id, external_ref) WHERE external_ref IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.contact_group_members (
  group_id UUID NOT NULL REFERENCES public.contact_groups(id) ON DELETE CASCADE,
  contact_id UUID NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
  added_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  opted_out BOOLEAN NOT NULL DEFAULT false,
  PRIMARY KEY (group_id, contact_id)
);
CREATE INDEX IF NOT EXISTS idx_contact_group_members_contact ON public.contact_group_members(contact_id);

ALTER TABLE public.contact_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contact_group_members ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users manage their own groups" ON public.contact_groups;
CREATE POLICY "Users manage their own groups" ON public.contact_groups FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- A member row is the owner's when the group is theirs, and the contact is theirs too.
DROP POLICY IF EXISTS "Users manage their own group members" ON public.contact_group_members;
CREATE POLICY "Users manage their own group members" ON public.contact_group_members FOR ALL
  USING (EXISTS (SELECT 1 FROM public.contact_groups g WHERE g.id = group_id AND g.user_id = auth.uid()))
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.contact_groups g WHERE g.id = group_id AND g.user_id = auth.uid())
    AND EXISTS (SELECT 1 FROM public.contacts c WHERE c.id = contact_id AND c.user_id = auth.uid())
  );
