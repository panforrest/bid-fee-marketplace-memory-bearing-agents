import { NextResponse } from "next/server";
import { formatEther } from "viem";
import {
  MONAD_RPC_URL,
  monadPublicClient,
  normalizeAddress,
} from "@/lib/monad/client";
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
  error?: string;
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
      if (!t.address) {
        return { ...t, mon: null, error: "address_not_configured" };
      }
      const addr = normalizeAddress(t.address);
      if (!addr) {
        return { ...t, mon: null, error: "invalid_address" };
      }
      try {
        const wei = await client.getBalance({ address: addr as `0x${string}` });
        return { ...t, address: addr, mon: formatEther(wei) };
      } catch (err) {
        const msg = err instanceof Error ? err.message : "balance_read_failed";
        console.warn(`[monad] balance read failed for ${t.label}:`, err);
        return { ...t, address: addr, mon: null, error: msg };
      }
    })
  );

  return NextResponse.json({
    balances,
    rpcUrl: MONAD_RPC_URL,
    updatedAt: new Date().toISOString(),
  });
}
