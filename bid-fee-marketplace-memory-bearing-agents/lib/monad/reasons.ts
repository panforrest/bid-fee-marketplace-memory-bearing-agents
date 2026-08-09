export type SimulationReason =
  | "missing_bidder_key"
  | "unknown_bidder_address"
  | "missing_seller"
  | "invalid_deployer_key"
  | "invalid_bidder_key"
  | "rpc_send_failed"
  | "missing_deployer_key"
  | "key_address_mismatch";

export const SANDBOX_REASON_LABELS: Record<SimulationReason, string> = {
  missing_bidder_key: "bidder private key not configured",
  unknown_bidder_address: "address does not match a configured bidder",
  missing_seller: "seller / deployer address not configured",
  invalid_deployer_key: "deployer key is invalid",
  invalid_bidder_key: "bidder key is invalid",
  rpc_send_failed: "RPC broadcast failed",
  missing_deployer_key: "deployer private key not configured",
  key_address_mismatch: "bidder key derives to a different address",
};

export function humanizeSandboxReason(reason: string | undefined | null): string | null {
  if (!reason) return null;
  return SANDBOX_REASON_LABELS[reason as SimulationReason] ?? reason.replace(/_/g, " ");
}

/** Strip secrets/HTML from RPC errors before surfacing in UI or logs. */
export function sanitizeRpcError(err: unknown): string {
  let raw = "";
  if (err instanceof Error) {
    const e = err as Error & { shortMessage?: string };
    raw = e.shortMessage ?? e.message ?? String(err);
  } else if (typeof err === "object" && err !== null) {
    const o = err as { shortMessage?: string; message?: string };
    raw = o.shortMessage ?? o.message ?? String(err);
  } else {
    raw = String(err);
  }

  raw = raw.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
  raw = raw.replace(/0x[0-9a-fA-F]{64}/g, "[redacted]");
  raw = raw.replace(/0x[0-9a-fA-F]{40,}/g, "[hex]");

  const statusMatch = raw.match(/Status:\s*(\d+)/i);
  if (statusMatch) return `HTTP ${statusMatch[1]}`;

  if (raw.length > 120) return `${raw.slice(0, 117)}...`;
  return raw;
}

export function formatSandboxReason(
  reason: string | undefined | null,
  detail?: string | null
): string | null {
  const label = humanizeSandboxReason(reason);
  if (!label) return detail ?? null;
  if (detail) return `${label} — ${detail}`;
  return label;
}
