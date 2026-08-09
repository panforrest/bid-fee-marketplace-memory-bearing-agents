import "server-only";
import {
  createWalletClient,
  createPublicClient,
  defineChain,
  getAddress,
  http,
  keccak256,
  stringToHex,
} from "viem";
import { privateKeyToAccount, mnemonicToAccount } from "viem/accounts";
import type { Account } from "viem";
import { sanitizeRpcError, type SimulationReason } from "@/lib/monad/reasons";

// ============================================================================
// Monad — on-chain audit receipts (BOUNTY).
//
// We anchor a keccak256 hash of the auction's canonical state as calldata in a
// self-transfer on Monad testnet. No contract to deploy: the transaction itself
// IS the tamper-evident receipt, verifiable on the public explorer.
//
// "real-if-keyed, simulated-fallback": with a funded MONAD_DEPLOYER_PRIVATE_KEY
// we broadcast for real; otherwise (or on failure) we return a labelled
// simulated receipt so the demo never breaks.
// ============================================================================

export type ChainMode = "live" | "simulated";

export interface AnchorResult {
  txHash: string;
  digest: string; // keccak256 of the canonical payload
  explorerUrl: string | null;
  network: string;
  mode: ChainMode;
  reason?: SimulationReason;
  reasonDetail?: string;
}

const CHAIN_ID = Number(process.env.NEXT_PUBLIC_MONAD_CHAIN_ID || 10143);

export function stripEnvValue(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  const val = raw.trim().replace(/^['"]|['"]$/g, "").trim();
  return val || undefined;
}

export function normalizeAddress(addr: string): string | null {
  try {
    return getAddress(addr.trim());
  } catch {
    return null;
  }
}

function safeExplorerUrl(): string {
  const raw =
    stripEnvValue(process.env.NEXT_PUBLIC_MONAD_EXPLORER_URL) ||
    "https://testnet.monadexplorer.com";
  if (/rpc/i.test(raw)) {
    console.warn(
      "[monad] NEXT_PUBLIC_MONAD_EXPLORER_URL looks like an RPC URL — using default explorer"
    );
    return "https://testnet.monadexplorer.com";
  }
  return raw;
}

export const MONAD_RPC_URL =
  stripEnvValue(process.env.NEXT_PUBLIC_MONAD_RPC_URL) ||
  "https://testnet-rpc.monad.xyz";
export const MONAD_EXPLORER_URL = safeExplorerUrl();

export const monadTestnet = defineChain({
  id: CHAIN_ID,
  name: "Monad Testnet",
  nativeCurrency: { name: "Monad", symbol: "MON", decimals: 18 },
  rpcUrls: { default: { http: [MONAD_RPC_URL] } },
  blockExplorers: { default: { name: "Monad Explorer", url: MONAD_EXPLORER_URL } },
});

function canonical(payload: Record<string, unknown>): string {
  // stable key order so the digest is reproducible for verification
  return JSON.stringify(payload, Object.keys(payload).sort());
}

export function digestOf(payload: Record<string, unknown>): string {
  return keccak256(stringToHex(canonical(payload)));
}

export function monadIsLive(): boolean {
  return Boolean(stripEnvValue(process.env.MONAD_DEPLOYER_PRIVATE_KEY));
}

// Accept either a raw private key (64 hex, with/without 0x) OR a seed phrase.
// Strips stray quotes/whitespace that sneak in from copy-paste.
export function resolveAccount(raw: string): Account {
  const val = stripEnvValue(raw);
  if (!val) {
    throw new Error("key is empty");
  }
  const hex = val.startsWith("0x") ? val.slice(2) : val;
  if (/^[0-9a-fA-F]{64}$/.test(hex)) {
    return privateKeyToAccount(`0x${hex}` as `0x${string}`);
  }
  // looks like a mnemonic (space-separated words)
  if (val.split(/\s+/).length >= 12) {
    return mnemonicToAccount(val);
  }
  throw new Error(
    "key is neither a 64-char hex private key nor a 12+ word seed phrase"
  );
}

function simulatedAnchor(
  digest: string,
  reason: SimulationReason,
  reasonDetail?: string
): AnchorResult {
  console.warn(`[monad] anchor sandbox: ${reason}`, reasonDetail ?? "");
  return {
    txHash: `0xsim_${digest.slice(2, 18)}`,
    digest,
    explorerUrl: null,
    network: "monad-testnet",
    mode: "simulated",
    reason,
    reasonDetail,
  };
}

export async function anchorReceipt(
  payload: Record<string, unknown>
): Promise<AnchorResult> {
  const digest = digestOf(payload);
  const pk = stripEnvValue(process.env.MONAD_DEPLOYER_PRIVATE_KEY);

  if (!pk) {
    return simulatedAnchor(digest, "missing_deployer_key");
  }

  let account: Account;
  try {
    account = resolveAccount(pk);
  } catch (err) {
    console.warn("[monad] anchor sandbox: invalid_deployer_key", err);
    return simulatedAnchor(digest, "invalid_deployer_key");
  }

  try {
    const wallet = createWalletClient({
      account,
      chain: monadTestnet,
      transport: http(MONAD_RPC_URL, { timeout: 10_000 }),
    });

    // self-transfer carrying the digest as calldata = the on-chain receipt
    const txHash = await wallet.sendTransaction({
      to: account.address,
      value: 0n,
      data: digest as `0x${string}`,
    });

    return {
      txHash,
      digest,
      explorerUrl: `${MONAD_EXPLORER_URL.replace(/\/$/, "")}/tx/${txHash}`,
      network: "monad-testnet",
      mode: "live",
    };
  } catch (err) {
    const reasonDetail = sanitizeRpcError(err);
    console.warn("[monad] anchor sandbox: rpc_send_failed", reasonDetail);
    return simulatedAnchor(digest, "rpc_send_failed", reasonDetail);
  }
}

// exported for potential balance/status reads
export function monadPublicClient() {
  return createPublicClient({
    chain: monadTestnet,
    transport: http(MONAD_RPC_URL, { timeout: 10_000 }),
  });
}
