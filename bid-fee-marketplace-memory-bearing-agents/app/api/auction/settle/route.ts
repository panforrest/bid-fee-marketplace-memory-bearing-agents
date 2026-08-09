import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { anchorReceipt } from "@/lib/monad/client";

export const dynamic = "force-dynamic";

// POST /api/auction/settle  { auctionId }
// DEMO control: force the auction to end NOW, let the existing engine settle it
// to the LAST bidder (leader -> winner), then anchor the final settled state on
// Monad. Returns the winner + final flat price + the Monad receipt so the UI can
// show "Winner + Monad transaction completed" in one shot.
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

  // 2) Settle via the existing engine (leader -> winner, or failed if no bids).
  await admin.rpc("close_due_auctions", { p_auction_id: body.auctionId });

  // 3) Read the settled state.
  const { data: a, error } = await admin
    .from("auctions")
    .select("id, price_cents, bid_count, status, leader_org_id, winner_org_id, ends_at")
    .eq("id", body.auctionId)
    .single();
  if (error || !a) {
    return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  }

  let winnerName: string | null = null;
  if (a.winner_org_id) {
    const { data: org } = await admin
      .from("organizations")
      .select("legal_name")
      .eq("id", a.winner_org_id)
      .single();
    winnerName = org?.legal_name ?? null;
  }

  // 4) Anchor the final settled receipt on Monad (real-if-keyed, else Sandbox).
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
    },
  });

  return NextResponse.json({
    auctionId: a.id,
    status: a.status,
    price_cents: a.price_cents,
    bid_count: a.bid_count,
    winner: a.winner_org_id ? { org_id: a.winner_org_id, name: winnerName } : null,
    receipt: {
      tx_hash: receipt.txHash,
      digest: receipt.digest,
      explorer_url: receipt.explorerUrl,
      network: receipt.network,
      mode: receipt.mode,
    },
  });
}
