-- ============================================================================
-- Memoria — Migration 0004: custom bid increments
-- Bidders choose how much to raise the price (+$0.01 / +$0.10 / +$1.00).
-- Credits scale with the increment: raising the price by N cents spends N
-- credits (so the credit-back-at-par math stays exact).
-- Run AFTER 0001–0003 (Supabase SQL Editor -> paste -> Run).
-- ============================================================================

-- The old single-arg signature would be ambiguous with the new default arg,
-- so drop it first, then recreate with p_units.
drop function if exists place_bid(uuid);

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
  -- 1 unit = +1 increment step to price = 1 credit. Cap to a sane range.
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

  v_new_end := case
    when v_auction.ends_at - now() < (v_auction.extend_threshold || ' seconds')::interval
      then now() + (v_auction.extend_seconds || ' seconds')::interval
    else v_auction.ends_at end;

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
    values (v_org, 'bid_spend', -v_units, p_auction_id,
            v_units || ' credit(s) on bid #' || v_seq);

  update wallets set bid_balance = bid_balance - v_units, updated_at = now()
    where org_id = v_org returning bid_balance into v_balance;

  if v_new_end <> v_auction.ends_at then
    insert into auction_events (auction_id, kind, payload)
      values (p_auction_id, 'extended', jsonb_build_object('ends_at', v_new_end));
  end if;

  insert into auction_events (auction_id, kind, payload)
    values (p_auction_id, 'bid', jsonb_build_object(
      'seq', v_seq, 'org', v_org, 'price', v_auction.price_cents,
      'units', v_units, 'ends_at', v_new_end));

  return query select true, v_auction.price_cents, v_new_end, v_seq, v_balance, null::text;
end $$;

-- credit_back now SUMS credits spent (was counting bid rows), so multi-credit
-- bids refund at par: N credits spent -> N * bid_face_cents back.
create or replace function credit_back(p_auction_id uuid, p_exclude_org uuid)
returns void language plpgsql security definer as $$
declare r record; v_face integer;
begin
  select bid_face_cents into v_face from auctions where id = p_auction_id;
  for r in
    select ce.org_id, sum(-ce.bid_delta)::int as spent
    from credit_entries ce
    where ce.auction_id = p_auction_id and ce.kind = 'bid_spend'
      and (p_exclude_org is null or ce.org_id <> p_exclude_org)
    group by ce.org_id
  loop
    insert into credit_entries (org_id, kind, cents_delta, auction_id, reason)
      values (r.org_id, 'loser_creditback', r.spent * v_face, p_auction_id,
              'Credit-back at par: ' || r.spent || ' credits');
    update wallets set credit_cents = credit_cents + (r.spent * v_face), updated_at = now()
      where org_id = r.org_id;
  end loop;
end $$;
