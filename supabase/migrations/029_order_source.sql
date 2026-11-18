-- First-touch source attribution on orders (#148). No PII: only the campaign
-- tags the visitor's first link carried and the day it was seen, e.g.
--   {"utm_source":"devto","utm_medium":"post","utm_campaign":"rev7","at":"2026-11-18"}
-- Web orders copy the smshub_src cookie (set by middleware.ts); API and MCP
-- callers may send an X-Source header. NULL when unknown. Additive only.

alter table public.number_orders add column if not exists source jsonb;

create index if not exists idx_number_orders_source
  on public.number_orders ((source ->> 'utm_source'))
  where source is not null;

notify pgrst, 'reload schema';
