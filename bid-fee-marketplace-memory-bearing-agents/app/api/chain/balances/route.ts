import { NextResponse } from "next/server";
import { formatEther } from "viem";
import { monadPublicClient } from "@/lib/monad/client";
import {
  BIDDER1_ADDRESS,
  BIDDER2_ADDRESS,
  resolveSellerAddress,
} from "@/lib/monad/transfer";

export const dynamic = "force-dynamic";

interface BalanceEntry {
  label: string;
  role: "bidder" | "seller";
  address: string | null;
  mon: string | null; // formatted MON, null if unreadable
}

// GET /api/chain/balances
// Reads on-chain native MON balances for Bidder 1, Bidder 2, and the seller so
// the UI can show the bidders' MON go DOWN and the seller's go UP after bids.
export async function GET() {
  const client = monadPublicClient();
  const seller = resolveSellerAddress();

  const targets: { label: string; role: BalanceEntry["role"]; address: string | null }[] = [
    { label: "Bidder 1", role: "bidder", address: BIDDER1_ADDRESS },
    { label: "Bidder 2", role: "bidder", address: BIDDER2_ADDRESS },
    { label: "Deployer / seller", role: "seller", address: seller },
  ];

  const balances: BalanceEntry[] = await Promise.all(
    targets.map(async (t) => {
      if (!t.address) return { ...t, mon: null };
      try {
        const wei = await client.getBalance({ address: t.address as `0x${string}` });
        return { ...t, mon: formatEther(wei) };
      } catch (err) {
        console.warn(`[monad] balance read failed for ${t.label}:`, err);
        return { ...t, mon: null };
      }
    })
  );

  return NextResponse.json({ balances, updatedAt: new Date().toISOString() });
}
