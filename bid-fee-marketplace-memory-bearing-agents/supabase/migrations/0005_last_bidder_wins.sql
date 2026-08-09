-- ============================================================================
-- Memoria — Migration 0005: classic ascending auction
--   * Every bid raises the price by a fixed increment (1 credit each).
--   * NO reserve.
--   * NO credit-back (losing bids are not refunded).
--   * Each bid resets the clock to 15s; when it expires, the LAST bidder wins.
-- Run AFTER 0001–0004 (Supabase SQL Editor -> paste -> Run).
-- ============================================================================

-- Drop reserves entirely.
update auctions set reserve_cents = null;

-- ---------------------------------------------------------------------------
-- place_bid(): fixed increment, ALWAYS reset the clock to extend_seconds (15s)
-- on every bid ("going once, going twice"). No reserve logic here.
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
begin
  if v_units < 1 or v_units > 1000 then
    return query select false,0,null::timestamptz,0,0,'BAD_UNITS'; return;
  end if;

  select om.org_id into v_org from org_members om where om.user_id = v_uid limit 1;
  if v_org is null then
    return query select false,0,null::timestamptz,0,0,'NO_ORG'; return;
  end if;

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

  select w.bid_balance into v_balance from wallets w where w.org_id = v_org for update;
  if coalesce(v_balance,0) < v_units then
    return query select false, v_auction.price_cents, v_auction.ends_at, 0,0,'INSUFFICIENT_BIDS'; return;
  end if;

  -- ALWAYS reset the countdown to the 15s window on every bid.
  v_new_end := now() + (v_auction.extend_seconds || ' seconds')::interval;
  v_seq := v_auction.bid_count + 1;

  update auctions set
    price_cents   = price_cents + (v_units * increment_cents),
    bid_count     = v_seq,
    ends_at       = v_new_end,
    leader_org_id = v_org
  where id = p_auction_id
  returning auctions.price_cents into v_auction.price_cents;

  insert into bids (auction_id, org_id, user_id, seq, price_after, ends_at_after)
    values (p_auction_id, v_org, v_uid, v_seq, v_auction.price_cents, v_new_end);

  insert into credit_entries (org_id, kind, bid_delta, auction_id, reason)
    values (v_org, 'bid_spend', -v_units, p_auction_id, 'bid #' || v_seq);

  update wallets set bid_balance = bid_balance - v_units, updated_at = now()
    where org_id = v_org returning bid_balance into v_balance;

  insert into auction_events (auction_id, kind, payload)
    values (p_auction_id, 'bid', jsonb_build_object(
      'seq', v_seq, 'org', v_org, 'price', v_auction.price_cents, 'ends_at', v_new_end));

  return query select true, v_auction.price_cents, v_new_end, v_seq, v_balance, null::text;
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
