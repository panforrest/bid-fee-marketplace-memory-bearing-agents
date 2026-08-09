-- ============================================================================
-- Memoria — Migration 0005: opening-bid-sets-price, last-bidder-wins auction
--   * The FIRST bidder names ANY flat amount; that becomes the LOCKED per-bid
--     amount for the whole auction. Every later bid is that same amount.
--   * The price DOES NOT ascend after it's set.
--   * All bid fees accrue to the SELLER, in real time, auditably.
--   * NO reserve. NO credit-back (losing bids are not refunded).
--   * Each bid resets the clock to 30 min; when it expires, the LAST bidder wins.
--   * Demo auctions are reset to "awaiting opening bid"; wallets topped up.
-- Run AFTER 0001–0004 (Supabase SQL Editor -> paste -> Run). ONE file only.
-- ============================================================================

-- (1) New ledger kind for seller proceeds. Must be added in its own statement
--     BEFORE anything uses it. (Postgres: an enum value can't be added and used
--     in the same transaction; we only reference it at runtime, in place_bid.)
alter type entry_kind add value if not exists 'seller_proceeds';

-- (2) Locked flat per-bid amount (in credits). NULL until the opening bid.
alter table auctions add column if not exists flat_bid_units integer;

-- (2b) The "going once" window is 30 minutes. place_bid() resets ends_at to
--      now() + extend_seconds on every bid, so this makes it a 30-min timer.
alter table auctions alter column extend_seconds set default 1800;

-- (3) Reset the demo auctions to "awaiting opening bid". The append-only
--     triggers block DELETE, so disable them just for this reset, then re-enable.
alter table bids           disable trigger t_bids_ro;
alter table auction_events disable trigger t_events_ro;
alter table credit_entries disable trigger t_ledger_ro;

delete from bids           where auction_id in (select id from auctions);
delete from auction_events where auction_id in (select id from auctions);
delete from credit_entries where auction_id in (select id from auctions);

alter table bids           enable trigger t_bids_ro;
alter table auction_events enable trigger t_events_ro;
alter table credit_entries enable trigger t_ledger_ro;

update auctions set
  flat_bid_units = null,
  price_cents    = 0,
  bid_count      = 0,
  leader_org_id  = null,
  winner_org_id  = null,
  reserve_cents  = null,
  settled_at     = null,
  status         = 'live',
  extend_seconds = 1800,               -- 30-minute going-once window
  ends_at        = now() + interval '30 minutes';

-- put the assets back on the block
update agent_instances set status = 'listed' where status = 'sold';

-- (4) Demo allowance: top up every existing wallet so guests + seeded orgs
--     have plenty of runway for large opening bids.
update wallets set bid_balance = greatest(bid_balance, 100000), updated_at = now();

-- ---------------------------------------------------------------------------
-- ensure_org(): auto-provision an anon guest with a big demo allowance.
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
    insert into wallets (org_id, bid_balance, credit_cents) values (v_org, 100000, 0);
    insert into credit_entries (org_id, kind, bid_delta, reason)
      values (v_org, 'subscription_grant', 100000, 'Welcome allowance (demo)');
  end if;

  return query
    select w.org_id, w.bid_balance, w.credit_cents from wallets w where w.org_id = v_org;
end $$;

-- ---------------------------------------------------------------------------
-- place_bid(p_auction_id, p_units):
--   * OPENING bid (flat_bid_units is null): the caller's p_units sets the flat
--     amount (floored at 1, capped at 10,000,000 and the bidder's balance) and
--     locks the constant price = flat * increment_cents.
--   * SUBSEQUENT bids: the caller's p_units is ignored; the locked flat amount
--     is used. Price never changes.
--   * Every bid: deduct flat from bidder, credit the SELLER the flat amount
--     (auditable), set bidder as leader, reset clock to 30 min, record bid + event.
-- ---------------------------------------------------------------------------
create or replace function place_bid(p_auction_id uuid, p_units integer default 1)
returns table (
  ok boolean, price_cents integer, ends_at timestamptz,
  seq integer, bid_balance integer, error text
) language plpgsql security definer as $$
#variable_conflict use_column
declare
  v_org uuid; v_uid uuid := auth.uid();
  v_auction auctions%rowtype;
  v_balance integer; v_seq integer; v_new_end timestamptz;
  v_units integer := coalesce(p_units, 1);
  v_flat integer; v_opening boolean; v_price integer;
begin
  select om.org_id into v_org from org_members om where om.user_id = v_uid limit 1;
  if v_org is null then
    return query select false,0,null::timestamptz,0,0,'NO_ORG'; return;
  end if;

  -- SERIALIZE concurrent bidders on this row lock.
  select * into v_auction from auctions where id = p_auction_id for update;
  if not found then
    return query select false,0,null::timestamptz,0,0,'NOT_FOUND'; return;
  end if;

  if v_auction.status <> 'live' or now() >= v_auction.ends_at then
    return query select false, v_auction.price_cents, v_auction.ends_at, 0,0,'AUCTION_CLOSED'; return;
  end if;
  if v_auction.seller_org_id = v_org then
    return query select false, v_auction.price_cents, v_auction.ends_at, 0,0,'SELLER_CANNOT_BID'; return;
  end if;
  if v_auction.leader_org_id = v_org then
    return query select false, v_auction.price_cents, v_auction.ends_at, 0,0,'ALREADY_LEADING'; return;
  end if;

  -- Determine the flat amount: opening bid names it; later bids inherit it.
  if v_auction.flat_bid_units is null then
    v_opening := true;
    v_flat := greatest(1, least(coalesce(v_units,1), 10000000));
  else
    v_opening := false;
    v_flat := v_auction.flat_bid_units;
  end if;

  select w.bid_balance into v_balance from wallets w where w.org_id = v_org for update;
  if coalesce(v_balance,0) < v_flat then
    return query select false, v_auction.price_cents, v_auction.ends_at, 0,0,'INSUFFICIENT_BIDS'; return;
  end if;

  -- Reset the 30-min "going once" window on every bid. Price set once (opening).
  v_new_end := now() + (v_auction.extend_seconds || ' seconds')::interval;
  v_seq := v_auction.bid_count + 1;

  update auctions set
    flat_bid_units = coalesce(flat_bid_units, v_flat),
    price_cents    = case when flat_bid_units is null
                          then v_flat * increment_cents else price_cents end,
    bid_count      = v_seq,
    ends_at        = v_new_end,
    leader_org_id  = v_org
  where id = p_auction_id
  returning auctions.price_cents into v_price;

  -- Bidder: append the public bid record + spend the flat fee.
  insert into bids (auction_id, org_id, user_id, seq, price_after, ends_at_after)
    values (p_auction_id, v_org, v_uid, v_seq, v_price, v_new_end);
  insert into credit_entries (org_id, kind, bid_delta, auction_id, reason)
    values (v_org, 'bid_spend', -v_flat, p_auction_id,
            case when v_opening then 'opening bid #' || v_seq else 'bid #' || v_seq end);
  update wallets set bid_balance = bid_balance - v_flat, updated_at = now()
    where org_id = v_org returning bid_balance into v_balance;

  -- Seller: collects the flat bid fee in real time, auditably. Ensure a wallet
  -- exists for the seller (the house seller has none until now).
  insert into wallets (org_id, bid_balance, credit_cents)
    values (v_auction.seller_org_id, v_flat, 0)
    on conflict (org_id) do update
      set bid_balance = wallets.bid_balance + v_flat, updated_at = now();
  insert into credit_entries (org_id, kind, bid_delta, auction_id, reason)
    values (v_auction.seller_org_id, 'seller_proceeds', v_flat, p_auction_id,
            'bid #' || v_seq || ' proceeds to seller');

  insert into auction_events (auction_id, kind, payload)
    values (p_auction_id, 'bid', jsonb_build_object(
      'seq', v_seq, 'org', v_org, 'price', v_price, 'ends_at', v_new_end,
      'flat_units', v_flat, 'opening', v_opening));

  return query select true, v_price, v_new_end, v_seq, v_balance, null::text;
end $$;

-- ---------------------------------------------------------------------------
-- close_due_auctions(): last bidder wins. No reserve, no credit-back.
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
    if v_a.leader_org_id is null then
      -- nobody ever bid
      update auctions set status='failed', settled_at=now() where id=v_a.id;
      insert into auction_events(auction_id,kind) values (v_a.id,'failed');
    else
      update auctions set status='settled', winner_org_id=v_a.leader_org_id,
        settled_at=now() where id=v_a.id;
      update agent_instances set status='sold' where id = v_a.instance_id;
      insert into auction_events(auction_id,kind,payload)
        values (v_a.id,'settled', jsonb_build_object('winner', v_a.leader_org_id, 'price', v_a.price_cents));
    end if;
    v_n := v_n + 1;
  end loop;
  return v_n;
end $$;

-- ---------------------------------------------------------------------------
-- get_auction_state(): include flat_bid_units so the client knows whether the
-- opening bid has set the price yet.
-- ---------------------------------------------------------------------------
create or replace function get_auction_state(p_auction_id uuid)
returns jsonb language plpgsql security definer as $$
declare v_a auctions%rowtype; v_inst agent_instances%rowtype;
  v_leader text; v_seller text; v_bids jsonb;
begin
  perform close_due_auctions(p_auction_id);

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
      'reserve_cents', v_a.reserve_cents, 'flat_bid_units', v_a.flat_bid_units,
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
