-- ============================================================================
-- Memoria — Migration 0003: Rain stablecoin settlement (SPONSOR)
-- USDC top-ups for bid allowance + USDC settlement of won lots.
-- Append-only payments table = the money-movement audit trail.
-- Run AFTER 0001 + 0002.
-- ============================================================================

create type payment_kind   as enum ('allowance_topup','lot_settlement');
create type payment_status as enum ('pending','confirmed','failed');

-- APPEND ONLY: every USDC movement via Rain leaves a receipt here.
create table payments (
  id             bigserial primary key,
  org_id         uuid not null references organizations(id),
  kind           payment_kind not null,
  auction_id     uuid references auctions(id),
  amount_cents   integer not null,              -- USD face
  usdc_amount    numeric(20,6) not null,        -- stablecoin units moved
  network        text not null default 'base',  -- Rain is omni-chain
  rain_reference text not null,                  -- Rain payment/transfer id
  rain_mode      text not null default 'live',  -- 'live' | 'simulated'
  status         payment_status not null default 'confirmed',
  memo           text,
  created_at     timestamptz not null default now()
);
create index on payments (org_id, created_at desc);
create index on payments (auction_id);

-- append-only enforcement (reuse the guard from 0001)
create trigger t_payments_ro before update or delete on payments
  for each row execute function block_mutation();

alter table payments enable row level security;
create policy payments_public_read on payments for select using (true);

-- realtime so the wallet can react to settlements live
alter publication supabase_realtime add table payments;

-- ---------------------------------------------------------------------------
-- record_rain_topup(): fund a bid allowance after a confirmed USDC payment.
-- Called server-side (service role) once Rain confirms. Grants bids at par.
-- ---------------------------------------------------------------------------
create or replace function record_rain_topup(
  p_org uuid, p_bids integer, p_amount_cents integer,
  p_usdc numeric, p_network text, p_reference text, p_mode text
) returns jsonb language plpgsql security definer as $$
declare v_pid bigint; v_balance integer;
begin
  insert into payments (org_id, kind, amount_cents, usdc_amount, network, rain_reference, rain_mode, status, memo)
    values (p_org, 'allowance_topup', p_amount_cents, p_usdc, coalesce(p_network,'base'),
            p_reference, coalesce(p_mode,'live'), 'confirmed',
            p_bids || ' bids funded via Rain (USDC)')
    returning id into v_pid;

  insert into credit_entries (org_id, kind, bid_delta, reason)
    values (p_org, 'subscription_grant', p_bids,
            'Rain USDC top-up: +' || p_bids || ' bids');

  update wallets set bid_balance = bid_balance + p_bids, updated_at = now()
    where org_id = p_org returning bid_balance into v_balance;

  return jsonb_build_object('payment_id', v_pid, 'bid_balance', v_balance);
end $$;

-- ---------------------------------------------------------------------------
-- record_rain_settlement(): the winner pays the final price in USDC.
-- Idempotent per auction (one settlement receipt per lot).
-- ---------------------------------------------------------------------------
create or replace function record_rain_settlement(
  p_auction uuid, p_usdc numeric, p_network text, p_reference text, p_mode text
) returns jsonb language plpgsql security definer as $$
declare v_a auctions%rowtype; v_pid bigint; v_existing bigint;
begin
  select * into v_a from auctions where id = p_auction;
  if not found then return jsonb_build_object('error','NOT_FOUND'); end if;
  if v_a.winner_org_id is null then return jsonb_build_object('error','NO_WINNER'); end if;

  select id into v_existing from payments
    where auction_id = p_auction and kind = 'lot_settlement' limit 1;
  if v_existing is not null then
    return jsonb_build_object('payment_id', v_existing, 'already', true);
  end if;

  insert into payments (org_id, kind, auction_id, amount_cents, usdc_amount, network, rain_reference, rain_mode, status, memo)
    values (v_a.winner_org_id, 'lot_settlement', p_auction, v_a.price_cents, p_usdc,
            coalesce(p_network,'base'), p_reference, coalesce(p_mode,'live'), 'confirmed',
            'Lot settled in USDC via Rain')
    returning id into v_pid;

  insert into auction_events (auction_id, kind, payload)
    values (p_auction, 'rain_settled', jsonb_build_object(
      'reference', p_reference, 'usdc', p_usdc, 'network', p_network, 'mode', p_mode));

  return jsonb_build_object('payment_id', v_pid, 'winner', v_a.winner_org_id, 'amount_cents', v_a.price_cents);
end $$;

-- ---------------------------------------------------------------------------
-- get_org_payments(): receipts for a given org (wallet page).
-- ---------------------------------------------------------------------------
create or replace function get_org_payments(p_org uuid)
returns jsonb language plpgsql security definer as $$
declare v jsonb;
begin
  select coalesce(jsonb_agg(p order by p.created_at desc), '[]'::jsonb) into v from (
    select id, kind, auction_id, amount_cents, usdc_amount, network, rain_reference, rain_mode, status, memo, created_at
    from payments where org_id = p_org order by created_at desc limit 50
  ) p;
  return v;
end $$;
