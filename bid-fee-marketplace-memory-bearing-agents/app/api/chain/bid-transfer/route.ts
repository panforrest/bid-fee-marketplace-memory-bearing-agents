import { NextRequest, NextResponse } from "next/server";
import { transferBidFee } from "@/lib/monad/transfer";

export const dynamic = "force-dynamic";

// POST /api/chain/bid-transfer  { auctionId, bidderAddress }
// Broadcasts a REAL native-MON transfer from the bidding wallet to the seller
// for BID_MON_AMOUNT, returning the on-chain receipt.
//
// DEMO-ONLY: we trust the client-provided bidderAddress to select which signer
// (private key) to use. That's acceptable for this hackathon demo but must NOT
// ship to production — a real system would derive the signer from an
// authenticated session, never from client input.
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const bidderAddress: string | undefined = body?.bidderAddress;
  if (!bidderAddress) {
    return NextResponse.json({ error: "MISSING_BIDDER_ADDRESS" }, { status: 400 });
  }

  const amountMon = process.env.BID_MON_AMOUNT || "0.05";

  // transferBidFee never throws — it returns a simulated receipt on any failure.
  const receipt = await transferBidFee({ bidderAddress, amountMon });

  return NextResponse.json({ auctionId: body?.auctionId ?? null, ...receipt });
}
