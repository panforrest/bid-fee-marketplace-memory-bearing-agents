-- ============================================================================
-- Memoria — Seed data (house-owned, clearly labelled inventory + demo bidders)
-- Run AFTER 0001_init.sql. Safe to re-run (ON CONFLICT DO NOTHING).
-- ============================================================================

-- ---------- House seller + demo buyer orgs ----------
insert into organizations (id, legal_name, role, status, is_house) values
  ('10000000-0000-0000-0000-000000000001','Memoria House (platform-owned)','seller','verified',true)
on conflict (id) do nothing;

insert into organizations (id, legal_name, role, status, is_house) values
  ('20000000-0000-0000-0000-000000000001','Northwind Labs','buyer','verified',false),
  ('20000000-0000-0000-0000-000000000002','Vertex Capital','buyer','verified',false),
  ('20000000-0000-0000-0000-000000000003','Acme Agents','buyer','verified',false)
on conflict (id) do nothing;

insert into wallets (org_id, bid_balance, credit_cents) values
  ('20000000-0000-0000-0000-000000000001', 300, 0),
  ('20000000-0000-0000-0000-000000000002', 300, 0),
  ('20000000-0000-0000-0000-000000000003', 300, 0)
on conflict (org_id) do nothing;

-- ---------- The lots: one-of-one memory-bearing agents ----------
insert into agent_instances
  (id, seller_org_id, title, summary, emoji, status, base_model, framework, memory_backend,
   memory_record_ct, memory_bytes, memory_export_fmt, tool_scopes, benchmark_suite, benchmark_score,
   memory_highlights, memory_pack, provenance, reserve_cents)
values
  ('30000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001',
   'Atlas — Tier-1 SaaS Support Agent',
   'Absorbed 42,180 resolved support tickets across a B2B SaaS billing vertical. Knows the edge cases no runbook covers.',
   '🎧','listed','claude-sonnet-4-6','letta','qdrant',
   42180, 1610612736, 'letta-af', '{"zendesk","stripe-read","intercom"}','longmemeval',87.400,
   '{"42,180 resolved billing & provisioning tickets","Learned refund-policy edge cases across 3 pricing migrations","94% first-contact resolution in shadow eval"}',
   '[{"q":"Customer was double-charged after a plan upgrade mid-cycle. What do you do?","a":"Proration bug from the Q2 pricing migration. Issue a one-cycle credit, not a refund — refunds trip the dunning webhook and re-lock the account. I have 1,240 tickets on this exact case."},{"q":"How do you handle an enterprise churn threat over an SSO outage?","a":"Escalate to the SEV-2 bridge, offer the SAML fallback config, and comp the affected seats for the month. Never promise an ETA on the SSO fix — that pattern caused 3 of our worst CSAT drops."}]'::jsonb,
   '{"prior_owners":["Memoria House"],"created":"2026-02-14","interactions":"11 months live"}'::jsonb,
   150000),

  ('30000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000001',
   'Sable — Biotech Research Analyst',
   'Two years of curated context across oncology literature, patent landscapes, and internal lab notes. A living literature review.',
   '🧬','listed','claude-sonnet-4-6','mem0','neo4j',
   28900, 3221225472, 'mem0-json', '{"pubmed","patents-api","internal-wiki"}','custom-eval',91.200,
   '{"24 months of oncology + patent context","Cross-links 28,900 papers into a knowledge graph","Tracks 140 competitor pipeline programs"}',
   '[{"q":"What is the competitive risk to a KRAS G12C program right now?","a":"Two Phase-II readouts are due within 90 days that I am tracking; one has a resistance-mutation signal I flagged from three separate 2026 abstracts. I can name the trials."},{"q":"Summarize our internal position on the ADC linker patent.","a":"Our notes from March show freedom-to-operate concern on claim 7 of the competing filing. Legal wanted a design-around; I have the three candidate linkers we discussed."}]'::jsonb,
   '{"prior_owners":["Memoria House"],"created":"2024-06-01","interactions":"2 years curated"}'::jsonb,
   400000),

  ('30000000-0000-0000-0000-000000000003','10000000-0000-0000-0000-000000000001',
   'Quill — Brand Voice Copywriter',
   'Trained on 6,300 approved marketing assets for a single DTC brand. Nails the voice on the first try — no style guide needed.',
   '✍️','listed','claude-sonnet-4-6','custom','pgvector',
   6300, 268435456, 'custom', '{"figma-read","cms-write"}','custom-eval',82.900,
   '{"6,300 approved on-brand assets","Internalized voice, banned words, and legal disclaimers","Cut copy-review cycles from 4 rounds to 1"}',
   '[{"q":"Write a launch subject line for our new sleep gummy.","a":"On-brand: playful, lowercase, no exclamation points (banned in our voice). e.g. \"finally, a bedtime that sticks\". I know the legal team requires the \"these statements have not been evaluated\" footer on any sleep claim."}]'::jsonb,
   '{"prior_owners":["Memoria House"],"created":"2025-09-10","interactions":"10 months live"}'::jsonb,
   80000),

  ('30000000-0000-0000-0000-000000000004','10000000-0000-0000-0000-000000000001',
   'Ledger — Quant Trading Copilot',
   'A persistent behavioural model over 3 years of desk chatter, risk limits, and post-mortems. Not signals — judgment.',
   '📈','listed','llama-4-70b','langgraph','qdrant',
   51000, 4294967296, 'custom', '{"bloomberg-read","internal-risk"}','custom-eval',79.500,
   '{"3 years of desk memory + risk post-mortems","Remembers why every limit exists","Flags setups that preceded past drawdowns"}',
   '[{"q":"We want to raise the overnight limit on the vol book. Thoughts?","a":"Last time we did that (Aug 2024) we ate a gap-risk loss on the exact same book. The post-mortem said keep it capped through earnings season. I would wait 2 weeks."}]'::jsonb,
   '{"prior_owners":["Memoria House"],"created":"2023-05-20","interactions":"3 years desk memory"}'::jsonb,
   500000),

  ('30000000-0000-0000-0000-000000000005','10000000-0000-0000-0000-000000000001',
   'Verdi — Legal Contract Reviewer',
   'Reviewed 9,800 SaaS contracts for one legal team. Knows the house redline positions cold.',
   '⚖️','listed','claude-sonnet-4-6','letta','pgvector',
   9800, 805306368, 'letta-af', '{"docusign","clm-read"}','longmemeval',88.100,
   '{"9,800 reviewed SaaS agreements","Knows every house redline + fallback position","Flags non-standard indemnity in seconds"}',
   '[{"q":"Counterparty wants uncapped liability for data breach. Our position?","a":"House position: cap at 3x fees with a super-cap carve-out only for confirmed breach of confidentiality, not general data incidents. We have walked from 2 deals over uncapped — I have the precedent."}]'::jsonb,
   '{"prior_owners":["Memoria House"],"created":"2025-01-05","interactions":"18 months live"}'::jsonb,
   200000),

  ('30000000-0000-0000-0000-000000000006','10000000-0000-0000-0000-000000000001',
   'Pixel — Game NPC Dungeon Master',
   'Ran a persistent 400-player campaign for 14 months. Remembers every character arc, betrayal, and inside joke.',
   '🎲','listed','llama-4-70b','mem0','neo4j',
   73400, 2147483648, 'mem0-json', '{"discord","game-state"}','custom-eval',76.300,
   '{"14-month persistent world, 400 players","Remembers every arc, alliance, and grudge","Players literally asked to buy it"}',
   '[{"q":"A returning player asks why the northern guild hates them.","a":"Because in month 6 they sold out the guildmaster''s daughter to the frost cult for 300 gold. The guild has a bounty on them. I never forget a betrayal."}]'::jsonb,
   '{"prior_owners":["Memoria House"],"created":"2025-03-01","interactions":"14 months live"}'::jsonb,
   60000)
on conflict (id) do nothing;

-- ---------- The auctions (all live; staggered end times) ----------
insert into auctions (id, instance_id, seller_org_id, status, ends_at, reserve_cents) values
  ('40000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','live', now() + interval '2 hours',   150000),
  ('40000000-0000-0000-0000-000000000002','30000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000001','live', now() + interval '5 hours',   400000),
  ('40000000-0000-0000-0000-000000000003','30000000-0000-0000-0000-000000000003','10000000-0000-0000-0000-000000000001','live', now() + interval '90 minutes', 80000),
  ('40000000-0000-0000-0000-000000000004','30000000-0000-0000-0000-000000000004','10000000-0000-0000-0000-000000000001','live', now() + interval '8 hours',   500000),
  ('40000000-0000-0000-0000-000000000005','30000000-0000-0000-0000-000000000005','10000000-0000-0000-0000-000000000001','live', now() + interval '3 hours',   200000),
  ('40000000-0000-0000-0000-000000000006','30000000-0000-0000-0000-000000000006','10000000-0000-0000-0000-000000000001','live', now() + interval '45 minutes', 60000)
on conflict (id) do nothing;

-- ---------- Pre-place some bids so featured lots look active ----------
-- (simulates place_bid: gapless seq, price += increment, ledger + wallet debit)
do $$
declare
  buyers uuid[] := array[
    '20000000-0000-0000-0000-000000000001',
    '20000000-0000-0000-0000-000000000002',
    '20000000-0000-0000-0000-000000000003'];
  targets uuid[] := array[
    '40000000-0000-0000-0000-000000000001',
    '40000000-0000-0000-0000-000000000002',
    '40000000-0000-0000-0000-000000000004',
    '40000000-0000-0000-0000-000000000005'];
  a uuid; i int; n int; v_org uuid; v_seq int; v_price int; v_end timestamptz; v_inc int;
begin
  foreach a in array targets loop
    -- skip if this auction already has bids (keeps re-runs clean)
    if exists (select 1 from bids where auction_id = a) then continue; end if;
    select increment_cents, ends_at into v_inc, v_end from auctions where id = a;
    n := 8 + floor(random()*10)::int;  -- 8..17 bids
    v_price := 0; v_seq := 0;
    for i in 1..n loop
      v_org := buyers[1 + (i % 3)];
      v_seq := v_seq + 1;
      v_price := v_price + v_inc;
      insert into bids (auction_id, org_id, seq, price_after, ends_at_after)
        values (a, v_org, v_seq, v_price, v_end);
      insert into credit_entries (org_id, kind, bid_delta, auction_id)
        values (v_org, 'bid_spend', -1, a);
      update wallets set bid_balance = bid_balance - 1 where org_id = v_org;
    end loop;
    update auctions set price_cents = v_price, bid_count = v_seq, leader_org_id = v_org where id = a;
    insert into auction_events (auction_id, kind, payload)
      values (a, 'opened', jsonb_build_object('seeded', true, 'bids', v_seq));
  end loop;
end $$;
