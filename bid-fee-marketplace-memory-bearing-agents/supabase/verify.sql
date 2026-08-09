-- ============================================================================
-- Memoria — Step 1 verification. Run AFTER 0001 + 0002. Read-only / safe.
-- Watch the "Messages"/NOTICE output for PASS/FAIL lines.
-- ============================================================================

-- 1) Seed loaded?
select
  (select count(*) from organizations)   as orgs,
  (select count(*) from agent_instances) as instances,
  (select count(*) from auctions)        as auctions,
  (select count(*) from bids)            as bids,
  (select count(*) from wallets)         as wallets;

-- 2) House can NEVER bid (must raise HOUSE_BID_FORBIDDEN)
do $$ begin
  begin
    insert into bids (auction_id, org_id, seq, price_after, ends_at_after)
      values ('40000000-0000-0000-0000-000000000001',
              '10000000-0000-0000-0000-000000000001', 999999, 1, now());
    raise notice 'FAIL house-invariant: a house bid was ALLOWED';
  exception when others then
    raise notice 'PASS house-invariant: blocked with "%"', sqlerrm;
  end;
end $$;

-- 3) bids are append-only (update must raise APPEND_ONLY_TABLE)
do $$ begin
  begin
    update bids set price_after = 0 where id = (select id from bids limit 1);
    raise notice 'FAIL append-only: a bid UPDATE was allowed';
  exception when others then
    raise notice 'PASS append-only: blocked with "%"', sqlerrm;
  end;
end $$;

-- 4) live-auction state fetch returns structured JSON
select jsonb_pretty(get_auction_state('40000000-0000-0000-0000-000000000001'));

-- 5) ledger integrity: each demo buyer's bid_balance == 300 + sum(bid_delta)
select o.legal_name, w.bid_balance,
       300 + coalesce(sum(ce.bid_delta),0) as expected
from organizations o
join wallets w on w.org_id = o.id
left join credit_entries ce on ce.org_id = o.id and ce.kind = 'bid_spend'
where o.id in ('20000000-0000-0000-0000-000000000001',
               '20000000-0000-0000-0000-000000000002',
               '20000000-0000-0000-0000-000000000003')
group by o.legal_name, w.bid_balance;
