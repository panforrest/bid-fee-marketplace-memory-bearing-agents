import "server-only";
import { createWalletClient, http, parseEther } from "viem";
import { privateKeyToAccount, mnemonicToAccount } from "viem/accounts";
import type { Account } from "viem";
import { monadTestnet } from "@/lib/monad/client";

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
}

const RPC_URL =
  process.env.NEXT_PUBLIC_MONAD_RPC_URL || "https://testnet-rpc.monad.xyz";
const EXPLORER =
  process.env.NEXT_PUBLIC_MONAD_EXPLORER_URL ||
  "https://testnet.monadexplorer.com";

export const BIDDER1_ADDRESS =
  process.env.BIDDER1_ADDRESS || "0x0B58561F2325F9eAB95Ce6cCE5981255D82bc50b";
export const BIDDER2_ADDRESS =
  process.env.BIDDER2_ADDRESS || "0x77dDCFDbD24a04BC150bc5d7EA636c0c990936bd";

// Accept either a raw private key (64 hex, with/without 0x) OR a seed phrase.
// Strips stray quotes/whitespace that sneak in from copy-paste.
function resolveAccount(raw: string): Account {
  const val = raw.trim().replace(/^['"]|['"]$/g, "").trim();
  const hex = val.startsWith("0x") ? val.slice(2) : val;
  if (/^[0-9a-fA-F]{64}$/.test(hex)) {
    return privateKeyToAccount(`0x${hex}` as `0x${string}`);
  }
  if (val.split(/\s+/).length >= 12) {
    return mnemonicToAccount(val);
  }
  throw new Error("bidder key is neither a 64-char hex private key nor a seed phrase");
}

// The receiver of every bid fee: explicit SELLER_ADDRESS, else the address
// derived from MONAD_DEPLOYER_PRIVATE_KEY.
export function resolveSellerAddress(): string | null {
  const explicit = process.env.SELLER_ADDRESS?.trim().replace(/^['"]|['"]$/g, "").trim();
  if (explicit) return explicit;
  const dep = process.env.MONAD_DEPLOYER_PRIVATE_KEY;
  if (dep) {
    try {
      return resolveAccount(dep).address;
    } catch {
      return null;
    }
  }
  return null;
}

// Map a client-provided bidder address to its configured private key.
function keyForBidder(bidderAddress: string): string | undefined {
  const addr = bidderAddress.trim().toLowerCase();
  if (addr === BIDDER1_ADDRESS.trim().toLowerCase()) {
    return process.env.BIDDER1_PRIVATE_KEY;
  }
  if (addr === BIDDER2_ADDRESS.trim().toLowerCase()) {
    return process.env.BIDDER2_PRIVATE_KEY;
  }
  return undefined;
}

function simulated(from: string, to: string, amountMon: string): TransferResult {
  const seed = (from + to + amountMon).replace(/[^0-9a-fA-F]/g, "").slice(0, 16).padEnd(16, "0");
  return {
    txHash: `0xsim_${seed}`,
    explorerUrl: null,
    from,
    to,
    amountMon,
    mode: "simulated",
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
  const from = bidderAddress;
  const to = seller ?? "0x0000000000000000000000000000000000000000";

  const pk = keyForBidder(bidderAddress);
  if (!pk || !seller) {
    // No matching key or no configured receiver -> simulate so the demo runs.
    return simulated(from, to, amountMon);
  }

  try {
    const account = resolveAccount(pk);
    const wallet = createWalletClient({
      account,
      chain: monadTestnet,
      // transport-level timeout so a stalled RPC never hangs the bid UX (~10s)
      transport: http(RPC_URL, { timeout: 10_000 }),
    });

    // Real native MON transfer: bidder -> seller. viem manages the nonce.
    const txHash = await wallet.sendTransaction({
      to: seller as `0x${string}`,
      value: parseEther(amountMon),
    });

    return {
      txHash,
      explorerUrl: `${EXPLORER.replace(/\/$/, "")}/tx/${txHash}`,
      from: account.address,
      to: seller,
      amountMon,
      mode: "live",
    };
  } catch (err) {
    console.warn("[monad] live bid transfer failed, using simulated receipt:", err);
    return simulated(from, to, amountMon);
  }
}
