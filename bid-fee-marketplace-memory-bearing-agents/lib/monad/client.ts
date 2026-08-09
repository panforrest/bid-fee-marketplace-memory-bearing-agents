import "server-only";
import {
  createWalletClient,
  createPublicClient,
  defineChain,
  http,
  keccak256,
  stringToHex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";

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
}

const CHAIN_ID = Number(process.env.NEXT_PUBLIC_MONAD_CHAIN_ID || 10143);
const RPC_URL =
  process.env.NEXT_PUBLIC_MONAD_RPC_URL || "https://testnet-rpc.monad.xyz";
const EXPLORER =
  process.env.NEXT_PUBLIC_MONAD_EXPLORER_URL || "https://testnet.monadexplorer.com";

export const monadTestnet = defineChain({
  id: CHAIN_ID,
  name: "Monad Testnet",
  nativeCurrency: { name: "Monad", symbol: "MON", decimals: 18 },
  rpcUrls: { default: { http: [RPC_URL] } },
  blockExplorers: { default: { name: "Monad Explorer", url: EXPLORER } },
});

function canonical(payload: Record<string, unknown>): string {
  // stable key order so the digest is reproducible for verification
  return JSON.stringify(payload, Object.keys(payload).sort());
}

export function digestOf(payload: Record<string, unknown>): string {
  return keccak256(stringToHex(canonical(payload)));
}

export function monadIsLive(): boolean {
  return Boolean(process.env.MONAD_DEPLOYER_PRIVATE_KEY);
}

export async function anchorReceipt(
  payload: Record<string, unknown>
): Promise<AnchorResult> {
  const digest = digestOf(payload);
  const pk = process.env.MONAD_DEPLOYER_PRIVATE_KEY;

  if (!pk) {
    return {
      txHash: `0xsim_${digest.slice(2, 18)}`,
      digest,
      explorerUrl: null,
      network: "monad-testnet",
      mode: "simulated",
    };
  }

  try {
    const account = privateKeyToAccount(
      (pk.startsWith("0x") ? pk : `0x${pk}`) as `0x${string}`
    );
    const wallet = createWalletClient({
      account,
      chain: monadTestnet,
      transport: http(RPC_URL),
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
      explorerUrl: `${EXPLORER.replace(/\/$/, "")}/tx/${txHash}`,
      network: "monad-testnet",
      mode: "live",
    };
  } catch (err) {
    console.warn("[monad] live anchor failed, using simulated receipt:", err);
    return {
      txHash: `0xsim_${digest.slice(2, 18)}`,
      digest,
      explorerUrl: null,
      network: "monad-testnet",
      mode: "simulated",
    };
  }
}

// exported for potential balance/status reads
export function monadPublicClient() {
  return createPublicClient({ chain: monadTestnet, transport: http(RPC_URL) });
}
