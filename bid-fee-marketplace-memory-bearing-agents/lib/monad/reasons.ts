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
