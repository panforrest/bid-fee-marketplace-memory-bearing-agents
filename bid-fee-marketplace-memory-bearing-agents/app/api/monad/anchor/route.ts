import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { anchorReceipt } from "@/lib/monad/client";

export const dynamic = "force-dynamic";

// POST /api/monad/anchor  { auctionId }
// Anchors a keccak256 digest of the auction's canonical state on Monad testnet
// and records a 'monad_anchored' event (which fans out over realtime).
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body?.auctionId) {
    return NextResponse.json({ error: "MISSING_AUCTION" }, { status: 400 });
  }
  const admin = createAdminClient();

  const { data: a, error } = await admin
    .from("auctions")
    .select("id, price_cents, bid_count, status, leader_org_id, winner_org_id, ends_at")
    .eq("id", body.auctionId)
    .single();
  if (error || !a) {
    return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  }

  const payload = {
    kind: "memoria.auction.receipt",
    auctionId: a.id,
    price_cents: a.price_cents,
    bid_count: a.bid_count,
    status: a.status,
    leader_org_id: a.leader_org_id,
    winner_org_id: a.winner_org_id,
    ends_at: a.ends_at,
    anchored_at: new Date().toISOString(),
  };

  const receipt = await anchorReceipt(payload);

  await admin.from("auction_events").insert({
    auction_id: a.id,
    kind: "monad_anchored",
    payload: {
      tx_hash: receipt.txHash,
      digest: receipt.digest,
      explorer_url: receipt.explorerUrl,
      network: receipt.network,
      mode: receipt.mode,
      reason: receipt.reason ?? null,
    },
  });

  return NextResponse.json({ receipt, payload });
}
