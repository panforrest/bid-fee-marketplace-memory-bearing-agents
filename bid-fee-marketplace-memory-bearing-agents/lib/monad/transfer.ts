import "server-only";
import { createWalletClient, http, parseEther } from "viem";
import { sanitizeRpcError, type SimulationReason } from "@/lib/monad/reasons";
import {
  MONAD_EXPLORER_URL,
  MONAD_RPC_URL,
  monadTestnet,
  normalizeAddress,
  resolveAccount,
  stripEnvValue,
} from "@/lib/monad/client";

// ============================================================================
// Monad — REAL per-bid value movement (the money-shot).
//
// Each labelled bidder is mapped to a funded Monad testnet wallet. On every
// bid we broadcast a REAL native-MON transfer FROM that bidder's wallet TO the
// seller/auctioneer wallet, so the bidder's balance goes DOWN and the seller's
// goes UP — live and verifiable on the public explorer.
//
// "real-if-keyed, simulated-fallback": if the matching bidder key isn't set
// (or the broadcast fails) we return a clearly-labelled simulated receipt so
// the demo never hard-fails. We NEVER throw to the caller and NEVER log keys.
// ============================================================================

export type ChainMode = "live" | "simulated";

export interface TransferResult {
  txHash: string;
  explorerUrl: string | null;
  from: string;
  to: string;
  amountMon: string;
  mode: ChainMode;
  reason?: SimulationReason;
  reasonDetail?: string;
}

export const BIDDER1_ADDRESS =
  normalizeAddress(
    process.env.BIDDER1_ADDRESS || "0x0B58561F2325F9eAB95Ce6cCE5981255D82bc50b"
  ) ?? "0x0B58561F2325F9eAB95Ce6cCE5981255D82bc50b";
export const BIDDER2_ADDRESS =
  normalizeAddress(
    process.env.BIDDER2_ADDRESS || "0x77dDCFDbD24a04BC150bc5d7EA636c0c990936bd"
  ) ?? "0x77dDCFDbD24a04BC150bc5d7EA636c0c990936bd";

// The receiver of every bid fee: explicit SELLER_ADDRESS, else the address
// derived from MONAD_DEPLOYER_PRIVATE_KEY.
export function resolveSellerAddress(): string | null {
  const explicit = stripEnvValue(process.env.SELLER_ADDRESS);
  if (explicit) {
    return normalizeAddress(explicit) ?? explicit;
  }
  const dep = stripEnvValue(process.env.MONAD_DEPLOYER_PRIVATE_KEY);
  if (dep) {
    try {
      return resolveAccount(dep).address;
    } catch {
      return null;
    }
  }
  return null;
}

function lookupBidderKey(bidderAddress: string): {
  key?: string;
  expectedAddress?: string;
  reason?: SimulationReason;
} {
  const normalized = normalizeAddress(bidderAddress);
  if (!normalized) {
    return { reason: "unknown_bidder_address" };
  }

  const b1 = normalizeAddress(BIDDER1_ADDRESS);
  const b2 = normalizeAddress(BIDDER2_ADDRESS);

  if (b1 && normalized === b1) {
    const key = stripEnvValue(process.env.BIDDER1_PRIVATE_KEY);
    if (!key) return { reason: "missing_bidder_key", expectedAddress: b1 };
    return { key, expectedAddress: b1 };
  }
  if (b2 && normalized === b2) {
    const key = stripEnvValue(process.env.BIDDER2_PRIVATE_KEY);
    if (!key) return { reason: "missing_bidder_key", expectedAddress: b2 };
    return { key, expectedAddress: b2 };
  }
  return { reason: "unknown_bidder_address" };
}

function simulated(
  from: string,
  to: string,
  amountMon: string,
  reason: SimulationReason,
  reasonDetail?: string
): TransferResult {
  console.warn(`[monad] bid transfer sandbox: ${reason}`, reasonDetail ?? "");
  const seed = (from + to + amountMon).replace(/[^0-9a-fA-F]/g, "").slice(0, 16).padEnd(16, "0");
  return {
    txHash: `0xsim_${seed}`,
    explorerUrl: null,
    from,
    to,
    amountMon,
    mode: "simulated",
    reason,
    reasonDetail,
  };
}

// Send a REAL native MON transfer from the matched bidder wallet to the seller.
// Never throws: on any problem we return a labelled simulated receipt.
export async function transferBidFee({
  bidderAddress,
  amountMon,
}: {
  bidderAddress: string;
  amountMon: string;
}): Promise<TransferResult> {
  const seller = resolveSellerAddress();
  const from = normalizeAddress(bidderAddress) ?? bidderAddress.trim();
  const to = seller ?? "0x0000000000000000000000000000000000000000";

  if (!seller) {
    return simulated(from, to, amountMon, "missing_seller");
  }

  const lookup = lookupBidderKey(bidderAddress);
  if (!lookup.key) {
    return simulated(from, to, amountMon, lookup.reason ?? "unknown_bidder_address");
  }

  let account;
  try {
    account = resolveAccount(lookup.key);
  } catch (err) {
    console.warn("[monad] bid transfer sandbox: invalid_bidder_key", err);
    return simulated(from, to, amountMon, "invalid_bidder_key");
  }

  if (lookup.expectedAddress && account.address !== lookup.expectedAddress) {
    const reasonDetail = `key derives to ${account.address}, expected ${lookup.expectedAddress}`;
    console.warn("[monad] bid transfer sandbox: key_address_mismatch", reasonDetail);
    return simulated(from, to, amountMon, "key_address_mismatch", reasonDetail);
  }

  try {
    const wallet = createWalletClient({
      account,
      chain: monadTestnet,
      // transport-level timeout so a stalled RPC never hangs the bid UX (~10s)
      transport: http(MONAD_RPC_URL, { timeout: 10_000 }),
    });

    // Real native MON transfer: bidder -> seller. viem manages the nonce.
    const txHash = await wallet.sendTransaction({
      to: seller as `0x${string}`,
      value: parseEther(amountMon),
    });

    return {
      txHash,
      explorerUrl: `${MONAD_EXPLORER_URL.replace(/\/$/, "")}/tx/${txHash}`,
      from: account.address,
      to: seller,
      amountMon,
      mode: "live",
    };
  } catch (err) {
    const reasonDetail = sanitizeRpcError(err);
    console.warn("[monad] bid transfer sandbox: rpc_send_failed", reasonDetail);
    return simulated(from, to, amountMon, "rpc_send_failed", reasonDetail);
  }
}
