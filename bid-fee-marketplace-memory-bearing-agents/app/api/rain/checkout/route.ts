import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { rainCharge } from "@/lib/rain/client";
import { findPack } from "@/lib/rain/packs";

export const dynamic = "force-dynamic";

// POST /api/rain/checkout
//  - allowance_topup: { kind, orgId, packId }
//  - lot_settlement:  { kind, auctionId }
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body?.kind) {
    return NextResponse.json({ error: "MISSING_KIND" }, { status: 400 });
  }
  const admin = createAdminClient();

  if (body.kind === "allowance_topup") {
    const pack = findPack(String(body.packId));
    if (!pack) return NextResponse.json({ error: "BAD_PACK" }, { status: 400 });
    if (!body.orgId) return NextResponse.json({ error: "MISSING_ORG" }, { status: 400 });

    const rain = await rainCharge({
      amountCents: pack.amountCents,
      memo: `Bid allowance top-up (+${pack.bids} bids)`,
      kind: "allowance_topup",
    });

    const { data, error } = await admin.rpc("record_rain_topup", {
      p_org: body.orgId,
      p_bids: pack.bids,
      p_amount_cents: pack.amountCents,
      p_usdc: rain.usdcAmount,
      p_network: rain.network,
      p_reference: rain.reference,
      p_mode: rain.mode,
    });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ rain, result: data, pack });
  }

  if (body.kind === "lot_settlement") {
    if (!body.auctionId) {
      return NextResponse.json({ error: "MISSING_AUCTION" }, { status: 400 });
    }
    // read the settled price so we charge the exact final amount
    const { data: auction } = await admin
      .from("auctions")
      .select("price_cents, winner_org_id, status")
      .eq("id", body.auctionId)
      .single();

    if (!auction || !auction.winner_org_id) {
      return NextResponse.json({ error: "NO_WINNER" }, { status: 400 });
    }

    const rain = await rainCharge({
      amountCents: auction.price_cents,
      memo: `Lot settlement (auction ${body.auctionId})`,
      kind: "lot_settlement",
    });

    const { data, error } = await admin.rpc("record_rain_settlement", {
      p_auction: body.auctionId,
      p_usdc: rain.usdcAmount,
      p_network: rain.network,
      p_reference: rain.reference,
      p_mode: rain.mode,
    });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ rain, result: data });
  }

  return NextResponse.json({ error: "UNKNOWN_KIND" }, { status: 400 });
}
