-- ============================================================================
-- Memoria — DEMO RESET
-- Reopens every auction with fresh, staggered ~4-hour countdowns so you can
-- demo bidding without lots closing mid-presentation.
--
-- HOW TO RUN: Supabase Dashboard -> SQL Editor -> New query ->
--             paste this whole file -> Run.
-- (This hits the same database as the live Vercel site, so production updates too.)
--
-- Want a longer window? Change  interval '4 hours'  to  interval '2 days'.
-- ============================================================================

with staggered as (
  select id, row_number() over (order by id) as rn from auctions
)
update auctions a
set status        = 'live',
    winner_org_id = null,
    settled_at    = null,
    ends_at       = now() + interval '4 hours' + (s.rn * 15) * interval '1 minute'
from staggered s
where a.id = s.id;

-- Re-list any agents that were marked sold when their auction settled.
update agent_instances set status = 'listed' where status = 'sold';
