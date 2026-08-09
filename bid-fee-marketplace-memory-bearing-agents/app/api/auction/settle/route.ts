import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { anchorReceipt } from "@/lib/monad/client";
import { rainCharge } from "@/lib/rain/client";

export const dynamic = "force-dynamic";

// POST /api/auction/settle  { auctionId }
// DEMO control — runs the full end-to-end transaction pipeline:
//   1) force the auction to end NOW and settle to the LAST bidder (leader -> winner)
//   2) Rain USDC settlement: the WINNER pays the SELLER the final flat price
//   3) Monad anchor of the final settled state
// Each step is robust to sandbox/failure and never blocks the others; all
// receipts are returned so the UI can show the whole chain as one transaction.
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body?.auctionId) {
    return NextResponse.json({ error: "MISSING_AUCTION" }, { status: 400 });
  }
  const admin = createAdminClient();

  // 1) Nudge the server clock past the end so the authoritative engine closes it.
  await admin
    .from("auctions")
    .update({ ends_at: new Date(Date.now() - 1000).toISOString() })
    .eq("id", body.auctionId)
    .eq("status", "live");

  await admin.rpc("close_due_auctions", { p_auction_id: body.auctionId });

  const { data: a, error } = await admin
    .from("auctions")
    .select("id, price_cents, bid_count, status, leader_org_id, winner_org_id, seller_org_id, ends_at")
    .eq("id", body.auctionId)
    .single();
  if (error || !a) {
    return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  }

  let winnerName: string | null = null;
  let sellerName: string | null = null;
  if (a.winner_org_id) {
    const [{ data: w }, { data: s }] = await Promise.all([
      admin.from("organizations").select("legal_name").eq("id", a.winner_org_id).single(),
      admin.from("organizations").select("legal_name").eq("id", a.seller_org_id).single(),
    ]);
    winnerName = w?.legal_name ?? null;
    sellerName = s?.legal_name ?? null;
  }

  // 2) Rain USDC settlement — winner pays seller the final flat price.
  let rain:
    | { status: string; usdc: number; reference: string; network: string; mode: string }
    | null = null;
  if (a.winner_org_id) {
    try {
      const charge = await rainCharge({
        amountCents: a.price_cents,
        memo: `Lot settlement — winner pays seller (auction ${a.id})`,
        kind: "lot_settlement",
      });
      await admin.rpc("record_rain_settlement", {
        p_auction: a.id,
        p_usdc: charge.usdcAmount,
        p_network: charge.network,
        p_reference: charge.reference,
        p_mode: charge.mode,
      });
      rain = {
        status: charge.status,
        usdc: charge.usdcAmount,
        reference: charge.reference,
        network: charge.network,
        mode: charge.mode,
      };
    } catch (e) {
      console.warn("[settle] rain settlement failed:", e);
      rain = { status: "failed", usdc: a.price_cents / 100, reference: "", network: "", mode: "simulated" };
    }
  }

  // 3) Monad anchor of the final settled state (incl. the Rain reference).
  let receipt: {
    tx_hash: string;
    digest: string;
    explorer_url: string | null;
    network: string;
    mode: "live" | "simulated";
  } | null = null;
  try {
    const payload = {
      kind: "memoria.auction.receipt",
      auctionId: a.id,
      price_cents: a.price_cents,
      bid_count: a.bid_count,
      status: a.status,
      leader_org_id: a.leader_org_id,
      winner_org_id: a.winner_org_id,
      rain_reference: rain?.reference ?? null,
      ends_at: a.ends_at,
      anchored_at: new Date().toISOString(),
    };
    const r = await anchorReceipt(payload);
    await admin.from("auction_events").insert({
      auction_id: a.id,
      kind: "monad_anchored",
      payload: {
        tx_hash: r.txHash,
        digest: r.digest,
        explorer_url: r.explorerUrl,
        network: r.network,
        mode: r.mode,
      },
    });
    receipt = {
      tx_hash: r.txHash,
      digest: r.digest,
      explorer_url: r.explorerUrl,
      network: r.network,
      mode: r.mode,
    };
  } catch (e) {
    console.warn("[settle] monad anchor failed:", e);
  }

  return NextResponse.json({
    auctionId: a.id,
    status: a.status,
    price_cents: a.price_cents,
    usdc: a.price_cents / 100,
    bid_count: a.bid_count,
    winner: a.winner_org_id ? { org_id: a.winner_org_id, name: winnerName } : null,
    seller: a.winner_org_id ? { org_id: a.seller_org_id, name: sellerName } : null,
    rain,
    receipt,
  });
}
