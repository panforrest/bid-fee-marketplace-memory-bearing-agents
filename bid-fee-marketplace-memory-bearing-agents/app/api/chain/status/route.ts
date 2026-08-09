import { NextResponse } from "next/server";
import {
  MONAD_EXPLORER_URL,
  MONAD_RPC_URL,
  stripEnvValue,
} from "@/lib/monad/client";
import { resolveSellerAddress } from "@/lib/monad/transfer";

export const dynamic = "force-dynamic";

// GET /api/chain/status
// Demo-safe diagnostics: which keys are configured (booleans only, no secrets).
export async function GET() {
  return NextResponse.json({
    bidder1KeyConfigured: Boolean(stripEnvValue(process.env.BIDDER1_PRIVATE_KEY)),
    bidder2KeyConfigured: Boolean(stripEnvValue(process.env.BIDDER2_PRIVATE_KEY)),
    deployerKeyConfigured: Boolean(stripEnvValue(process.env.MONAD_DEPLOYER_PRIVATE_KEY)),
    sellerAddress: resolveSellerAddress(),
    rpcUrl: MONAD_RPC_URL,
    explorerUrl: MONAD_EXPLORER_URL,
  });
}
