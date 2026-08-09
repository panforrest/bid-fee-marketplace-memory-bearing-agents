import "server-only";
import { randomBytes } from "crypto";

// ============================================================================
// Rain — stablecoin (USDC) payment rail.
//
// "real-if-keyed, simulated-fallback": if RAIN_API_KEY is present we hit the
// live Rain sandbox; on any failure (or when no key is set) we fall back to a
// deterministic simulated settlement so the on-stage demo can never break.
// Every result is labelled `mode: "live" | "simulated"` for full honesty.
// ============================================================================

export type RainMode = "live" | "simulated";

export interface RainResult {
  reference: string;   // Rain payment/transfer id
  usdcAmount: number;  // stablecoin units moved (USDC, 6dp)
  network: string;     // settlement network (Rain is omni-chain)
  mode: RainMode;
  status: "confirmed" | "failed";
}

export interface RainChargeInput {
  amountCents: number;
  memo: string;
  kind: "allowance_topup" | "lot_settlement";
}

const NETWORK = process.env.RAIN_NETWORK || "base";

function centsToUsdc(cents: number): number {
  // USDC pegged 1:1 to USD; 6 decimals.
  return Math.round((cents / 100) * 1e6) / 1e6;
}

function simulate(input: RainChargeInput): RainResult {
  return {
    reference: `rain_sim_${randomBytes(8).toString("hex")}`,
    usdcAmount: centsToUsdc(input.amountCents),
    network: NETWORK,
    mode: "simulated",
    status: "confirmed",
  };
}

// Best-effort live call. The exact endpoint/payload can be tuned via env once
// the sandbox docs are in hand; any non-2xx or throw degrades to simulation.
async function callRain(input: RainChargeInput): Promise<RainResult> {
  const base = process.env.RAIN_API_BASE_URL!;
  const key = process.env.RAIN_API_KEY!;
  const path = process.env.RAIN_PAYMENTS_PATH || "/v1/payments";
  const usdc = centsToUsdc(input.amountCents);

  const res = await fetch(`${base.replace(/\/$/, "")}${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${key}`,
      "x-api-key": key,
    },
    body: JSON.stringify({
      accountId: process.env.RAIN_ACCOUNT_ID,
      userId: process.env.RAIN_USER_ID,
      amount: usdc,
      currency: "USDC",
      network: NETWORK,
      destination: process.env.RAIN_TREASURY_ADDRESS,
      memo: input.memo,
      metadata: { kind: input.kind },
    }),
    // don't let a slow sandbox stall the demo
    signal: AbortSignal.timeout(8000),
  });

  if (!res.ok) throw new Error(`Rain ${res.status}`);
  const data = (await res.json()) as Record<string, unknown>;

  return {
    reference:
      (data.id as string) ||
      (data.reference as string) ||
      (data.transferId as string) ||
      `rain_${randomBytes(6).toString("hex")}`,
    usdcAmount: usdc,
    network: (data.network as string) || NETWORK,
    mode: "live",
    status: "confirmed",
  };
}

export async function rainCharge(input: RainChargeInput): Promise<RainResult> {
  if (!process.env.RAIN_API_KEY || !process.env.RAIN_API_BASE_URL) {
    return simulate(input);
  }
  try {
    return await callRain(input);
  } catch (err) {
    console.warn("[rain] live call failed, using simulated rail:", err);
    return simulate(input);
  }
}

export function rainIsLive(): boolean {
  return Boolean(process.env.RAIN_API_KEY && process.env.RAIN_API_BASE_URL);
}
