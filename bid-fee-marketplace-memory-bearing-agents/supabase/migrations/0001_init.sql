-- ============================================================================
-- Memoria — Bid-Fee Marketplace for Memory-Bearing AI Agents
-- Migration 0001: schema + engine + invariants + RLS + realtime
-- Run ONCE on a fresh Supabase project (SQL Editor → paste → Run).
-- ============================================================================

-- ---------------------------------------------------------------------------
-- ENUMS
-- ---------------------------------------------------------------------------
create type org_role       as enum ('buyer','seller','both');
create type org_status     as enum ('pending_kyb','verified','suspended');
create type entry_kind      as enum (
  'subscription_grant',  -- monthly bid allocation
  'bid_spend',           -- -1 bid
  'loser_creditback',    -- spent bids -> store credit at par
  'purchase_applied',    -- store credit applied to a settlement
  'manual_adjustment'    -- ops
);
create type instance_status as enum
  ('draft','verifying','ready','listed','sold','transferred','withdrawn');
create type auction_status   as enum
  ('scheduled','live','closing','settled','failed','cancelled');

-- ---------------------------------------------------------------------------
-- ORGS, MEMBERS, WALLETS
-- ---------------------------------------------------------------------------
create table organizations (
  id          uuid primary key default gen_random_uuid(),
  legal_name  text not null,
  role        org_role   not null default 'buyer',
  status      org_status not null default 'verified',
  -- HOUSE ACCOUNTS: platform-owned inventory. Publicly labelled. CANNOT bid.
  is_house    boolean not null default false,
  country     text not null default 'US',
  created_at  timestamptz not null default now()
);

create table org_members (
  org_id   uuid references organizations(id) on delete cascade,
  user_id  uuid references auth.users(id) on delete cascade,
  is_admin boolean not null default true,
  primary key (org_id, user_id)
);

create table wallets (
  org_id      uuid primary key references organizations(id) on delete cascade,
  bid_balance integer not null default 0,   -- cached; ledger is truth
  credit_cents integer not null default 0,  -- store credit (cents)
  updated_at  timestamptz not null default now()
);

-- APPEND ONLY ledger (enforced by trigger below)
create table credit_entries (
  id          bigserial primary key,
  org_id      uuid not null references organizations(id),
  kind        entry_kind not null,
  bid_delta   integer not null default 0,
  cents_delta integer not null default 0,
  auction_id  uuid,
  reason      text,
  created_at  timestamptz not null default now()
);
create index on credit_entries (org_id, created_at desc);
create index on credit_entries (auction_id);

-- ---------------------------------------------------------------------------
-- THE ASSET: a one-of-one memory-bearing agent instance
-- ---------------------------------------------------------------------------
create table agent_instances (
  id               uuid primary key default gen_random_uuid(),
  seller_org_id    uuid not null references organizations(id),
  title            text not null,
  summary          text not null,
  emoji            text not null default '🤖',
  status           instance_status not null default 'listed',
  base_model       text not null,           -- 'claude-sonnet-4-6', 'llama-4-70b'
  framework        text not null,           -- 'letta','mem0','langgraph','custom'
  memory_backend   text not null,           -- 'qdrant','pgvector','neo4j'
  memory_record_ct bigint not null default 0,
  memory_bytes     bigint not null default 0,
  memory_export_fmt text not null default 'mem0-json',
  tool_scopes      text[] not null default '{}',
  benchmark_suite  text,                     -- 'longmemeval','custom-eval'
  benchmark_score  numeric(6,3),
  memory_highlights text[] not null default '{}',  -- shown on lot card
  memory_pack      jsonb not null default '[]'::jsonb, -- sample records for the trial chat
  provenance       jsonb not null default '{}'::jsonb,
  reserve_cents    integer,
  created_at       timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- THE AUCTION (1:1 with an instance)
-- ---------------------------------------------------------------------------
create table auctions (
  id             uuid primary key default gen_random_uuid(),
  instance_id    uuid not null unique references agent_instances(id),
  seller_org_id  uuid not null references organizations(id),
  status         auction_status not null default 'live',
  opens_at       timestamptz not null default now(),
  ends_at        timestamptz not null,        -- MUTATED by anti-snipe extension
  extend_seconds integer not null default 15, -- clock reset on each late bid
  extend_threshold integer not null default 15,
  increment_cents  integer not null default 1,   -- the "penny"
  bid_face_cents   integer not null default 60,  -- credit-back value of one bid (DealDash-style $0.60)
  price_cents      integer not null default 0,
  reserve_cents    integer,
  bid_count        integer not null default 0,
  leader_org_id    uuid references organizations(id),
  winner_org_id    uuid references organizations(id),
  settled_at       timestamptz,
  constraint ends_after_opens check (ends_at > opens_at)
);
create index on auctions (status, ends_at);

-- APPEND ONLY public audit trail of bids
create table bids (
  id            bigserial primary key,
  auction_id    uuid not null references auctions(id),
  org_id        uuid not null references organizations(id),
  user_id       uuid,
  seq           integer not null,             -- 1..n, gapless per auction
  price_after   integer not null,
  ends_at_after timestamptz not null,
  placed_at     timestamptz not null default now(),
  unique (auction_id, seq)
);
create index on bids (auction_id, seq desc);
create index on bids (org_id, placed_at desc);

-- APPEND ONLY public event log
create table auction_events (
  id         bigserial primary key,
  auction_id uuid not null references auctions(id),
  kind       text not null,   -- 'opened','bid','extended','closed','settled','failed'
  payload    jsonb not null default '{}'::jsonb,
  at         timestamptz not null default now()
);
create index on auction_events (auction_id, at desc);

-- ---------------------------------------------------------------------------
-- INVARIANTS — the lines that keep us out of court
-- ---------------------------------------------------------------------------

-- The house cannot bid. EVER. Enforced by the database, not policy.
create or replace function assert_not_house() returns trigger as $$
begin
  if exists (select 1 from organizations where id = new.org_id and is_house) then
    raise exception 'HOUSE_BID_FORBIDDEN';
  end if;
  return new;
end $$ language plpgsql;

create trigger no_house_bids before insert on bids
  for each row execute function assert_not_house();

-- Append-only enforcement
create or replace function block_mutation() returns trigger as $$
begin raise exception 'APPEND_ONLY_TABLE'; end $$ language plpgsql;

create trigger t_bids_ro   before update or delete on bids
  for each row execute function block_mutation();
create trigger t_ledger_ro before update or delete on credit_entries
  for each row execute function block_mutation();
create trigger t_events_ro before update or delete on auction_events
  for each row execute function block_mutation();

-- ---------------------------------------------------------------------------
-- ensure_org(): map the current auth user -> an org + wallet (auto-provision
-- an anonymous buyer with a starting bid allowance for a frictionless demo).
-- ---------------------------------------------------------------------------
create or replace function ensure_org(p_display_name text default null)
returns table (org_id uuid, bid_balance integer, credit_cents integer)
language plpgsql security definer as $$
declare
  v_uid uuid := auth.uid();
  v_org uuid;
  v_name text;
begin
  if v_uid is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;

  select om.org_id into v_org from org_members om where om.user_id = v_uid limit 1;

  if v_org is null then
    v_name := coalesce(nullif(p_display_name,''),
                       'Bidder-' || substr(v_uid::text, 1, 4));
    insert into organizations (legal_name, role, status)
      values (v_name, 'buyer', 'verified')
      returning id into v_org;
    insert into org_members (org_id, user_id, is_admin) values (v_org, v_uid, true);
    insert into wallets (org_id, bid_balance, credit_cents) values (v_org, 50, 0);
    insert into credit_entries (org_id, kind, bid_delta, reason)
      values (v_org, 'subscription_grant', 50, 'Welcome allowance (demo)');
  end if;

  return query
    select w.org_id, w.bid_balance, w.credit_cents from wallets w where w.org_id = v_org;
end $$;

-- ---------------------------------------------------------------------------
-- place_bid(): the heart of the system. One function, one transaction,
-- one row lock. Server owns the clock.
-- ---------------------------------------------------------------------------
create or replace function place_bid(p_auction_id uuid)
returns table (
  ok boolean, price_cents integer, ends_at timestamptz,
  seq integer, bid_balance integer, error text
) language plpgsql security definer as $$
declare
  v_org uuid; v_uid uuid := auth.uid();
  v_auction auctions%rowtype;
  v_balance integer; v_seq integer; v_new_end timestamptz;
begin
  select om.org_id into v_org from org_members om where om.user_id = v_uid limit 1;
  if v_org is null then
    return query select false,0,null::timestamptz,0,0,'NO_ORG'; return;
  end if;

  -- SERIALIZE: every concurrent bidder queues on this row lock
  select * into v_auction from auctions where id = p_auction_id for update;
  if not found then
    return query select false,0,null::timestamptz,0,0,'NOT_FOUND'; return;
  end if;

  -- server-authoritative clock check
  if v_auction.status <> 'live' or now() >= v_auction.ends_at then
    return query select false, v_auction.price_cents, v_auction.ends_at, 0,0,'AUCTION_CLOSED'; return;
  end if;
  if v_auction.seller_org_id = v_org then
    return query select false, v_auction.price_cents, v_auction.ends_at, 0,0,'SELLER_CANNOT_BID'; return;
  end if;
  -- no double-tap: leader cannot bid against themselves
  if v_auction.leader_org_id = v_org then
    return query select false, v_auction.price_cents, v_auction.ends_at, 0,0,'ALREADY_LEADING'; return;
  end if;

  select w.bid_balance into v_balance from wallets w where w.org_id = v_org for update;
  if coalesce(v_balance,0) < 1 then
    return query select false, v_auction.price_cents, v_auction.ends_at, 0,0,'INSUFFICIENT_BIDS'; return;
  end if;

  -- anti-snipe: only extend if inside the threshold
  v_new_end := case
    when v_auction.ends_at - now() < (v_auction.extend_threshold || ' seconds')::interval
      then now() + (v_auction.extend_seconds || ' seconds')::interval
    else v_auction.ends_at end;

  v_seq := v_auction.bid_count + 1;

  update auctions set
    price_cents   = price_cents + increment_cents,
    bid_count     = v_seq,
    ends_at       = v_new_end,
    leader_org_id = v_org
  where id = p_auction_id
  returning auctions.price_cents into v_auction.price_cents;

  insert into bids (auction_id, org_id, user_id, seq, price_after, ends_at_after)
    values (p_auction_id, v_org, v_uid, v_seq, v_auction.price_cents, v_new_end);

  insert into credit_entries (org_id, kind, bid_delta, auction_id)
    values (v_org, 'bid_spend', -1, p_auction_id);

  update wallets set bid_balance = bid_balance - 1, updated_at = now()
    where org_id = v_org returning bid_balance into v_balance;

  if v_new_end <> v_auction.ends_at then
    insert into auction_events (auction_id, kind, payload)
      values (p_auction_id, 'extended', jsonb_build_object('ends_at', v_new_end));
  end if;

  insert into auction_events (auction_id, kind, payload)
    values (p_auction_id, 'bid', jsonb_build_object(
      'seq', v_seq, 'org', v_org, 'price', v_auction.price_cents, 'ends_at', v_new_end));

  return query select true, v_auction.price_cents, v_new_end, v_seq, v_balance, null::text;
end $$;

-- ---------------------------------------------------------------------------
-- credit_back(): losers' spent bids convert to store credit at par.
-- The legal keystone: nobody ends a session with nothing.
-- ---------------------------------------------------------------------------
create or replace function credit_back(p_auction_id uuid, p_exclude_org uuid)
returns void language plpgsql security definer as $$
declare r record; v_face integer;
begin
  select bid_face_cents into v_face from auctions where id = p_auction_id;
  for r in
    select ce.org_id, count(*)::int as spent
    from credit_entries ce
    where ce.auction_id = p_auction_id and ce.kind = 'bid_spend'
      and (p_exclude_org is null or ce.org_id <> p_exclude_org)
    group by ce.org_id
  loop
    insert into credit_entries (org_id, kind, cents_delta, auction_id, reason)
      values (r.org_id, 'loser_creditback', r.spent * v_face, p_auction_id,
              'Credit-back at par: ' || r.spent || ' bids');
    update wallets set credit_cents = credit_cents + (r.spent * v_face), updated_at = now()
      where org_id = r.org_id;
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- close_due_auctions(): settlement + winner assignment + credit-back.
-- ---------------------------------------------------------------------------
create or replace function close_due_auctions(p_auction_id uuid default null)
returns integer language plpgsql security definer as $$
declare v_a auctions%rowtype; v_n integer := 0;
begin
  for v_a in
    select * from auctions
    where status = 'live' and ends_at <= now()
      and (p_auction_id is null or id = p_auction_id)
    for update skip locked
  loop
    if v_a.reserve_cents is not null and v_a.price_cents < v_a.reserve_cents then
      update auctions set status='failed', settled_at=now() where id=v_a.id;
      perform credit_back(v_a.id, null);
      insert into auction_events(auction_id,kind) values (v_a.id,'failed');
    else
      update auctions set status='settled', winner_org_id=v_a.leader_org_id,
        settled_at=now() where id=v_a.id;
      update agent_instances set status='sold' where id = v_a.instance_id;
      perform credit_back(v_a.id, v_a.leader_org_id);  -- everyone except the winner
      insert into auction_events(auction_id,kind,payload)
        values (v_a.id,'settled', jsonb_build_object('winner', v_a.leader_org_id, 'price', v_a.price_cents));
    end if;
    v_n := v_n + 1;
  end loop;
  return v_n;
end $$;

-- ---------------------------------------------------------------------------
-- get_auction_state(): initial fetch for the live page. Lazy-closes if expired.
-- Returns the auction + server clock + leader/seller names + last 20 bids.
-- ---------------------------------------------------------------------------
create or replace function get_auction_state(p_auction_id uuid)
returns jsonb language plpgsql security definer as $$
declare v_a auctions%rowtype; v_inst agent_instances%rowtype;
  v_leader text; v_seller text; v_bids jsonb;
begin
  perform close_due_auctions(p_auction_id);  -- first viewer after expiry settles it

  select * into v_a from auctions where id = p_auction_id;
  if not found then return null; end if;
  select * into v_inst from agent_instances where id = v_a.instance_id;
  select legal_name into v_leader from organizations where id = v_a.leader_org_id;
  select legal_name into v_seller from organizations where id = v_a.seller_org_id;

  select coalesce(jsonb_agg(b order by b.seq desc), '[]'::jsonb) into v_bids from (
    select bi.seq, bi.price_after, bi.placed_at, o.legal_name as org_name
    from bids bi join organizations o on o.id = bi.org_id
    where bi.auction_id = p_auction_id
    order by bi.seq desc limit 20
  ) b;

  return jsonb_build_object(
    'server_now', now(),
    'auction', jsonb_build_object(
      'id', v_a.id, 'status', v_a.status, 'ends_at', v_a.ends_at, 'opens_at', v_a.opens_at,
      'price_cents', v_a.price_cents, 'bid_count', v_a.bid_count,
      'increment_cents', v_a.increment_cents, 'bid_face_cents', v_a.bid_face_cents,
      'reserve_cents', v_a.reserve_cents,
      'leader_org_id', v_a.leader_org_id, 'leader_name', v_leader,
      'seller_name', v_seller, 'winner_org_id', v_a.winner_org_id),
    'instance', jsonb_build_object(
      'id', v_inst.id, 'title', v_inst.title, 'summary', v_inst.summary, 'emoji', v_inst.emoji,
      'base_model', v_inst.base_model, 'framework', v_inst.framework,
      'memory_backend', v_inst.memory_backend, 'memory_record_ct', v_inst.memory_record_ct,
      'memory_bytes', v_inst.memory_bytes, 'tool_scopes', v_inst.tool_scopes,
      'benchmark_suite', v_inst.benchmark_suite, 'benchmark_score', v_inst.benchmark_score,
      'memory_highlights', v_inst.memory_highlights),
    'bids', v_bids
  );
end $$;

-- ---------------------------------------------------------------------------
-- get_my_wallet(): the caller's wallet + recent ledger entries.
-- ---------------------------------------------------------------------------
create or replace function get_my_wallet()
returns jsonb language plpgsql security definer as $$
declare v_org uuid; v_wallet jsonb; v_entries jsonb;
begin
  select om.org_id into v_org from org_members om where om.user_id = auth.uid() limit 1;
  if v_org is null then return null; end if;

  select to_jsonb(w) into v_wallet from wallets w where w.org_id = v_org;
  select coalesce(jsonb_agg(e order by e.created_at desc), '[]'::jsonb) into v_entries from (
    select id, kind, bid_delta, cents_delta, auction_id, reason, created_at
    from credit_entries where org_id = v_org order by created_at desc limit 50
  ) e;

  return jsonb_build_object('org_id', v_org, 'wallet', v_wallet, 'entries', v_entries);
end $$;

-- ---------------------------------------------------------------------------
-- RLS: public tables readable by anyone (the audit trail is the moat);
-- all writes go through SECURITY DEFINER functions above.
-- ---------------------------------------------------------------------------
alter table organizations   enable row level security;
alter table org_members     enable row level security;
alter table wallets         enable row level security;
alter table credit_entries  enable row level security;
alter table agent_instances enable row level security;
alter table auctions        enable row level security;
alter table bids            enable row level security;
alter table auction_events  enable row level security;

create policy pub_read_orgs      on organizations   for select using (true);
create policy pub_read_instances on agent_instances for select using (true);
create policy pub_read_auctions  on auctions        for select using (true);
create policy pub_read_bids      on bids            for select using (true);
create policy pub_read_events    on auction_events  for select using (true);

-- ---------------------------------------------------------------------------
-- Realtime: broadcast changes on these tables to subscribed clients.
-- ---------------------------------------------------------------------------
alter publication supabase_realtime add table auction_events;
alter publication supabase_realtime add table auctions;
alter publication supabase_realtime add table bids;
