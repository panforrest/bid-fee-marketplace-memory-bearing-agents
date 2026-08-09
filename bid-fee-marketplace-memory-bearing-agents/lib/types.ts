export interface AgentInstance {
  id: string;
  title: string;
  summary: string;
  emoji: string;
  base_model: string;
  framework: string;
  memory_backend: string;
  memory_record_ct: number;
  memory_bytes: number;
  benchmark_suite: string | null;
  benchmark_score: number | null;
  memory_highlights: string[];
}

export interface Lot {
  id: string; // auction id
  status: string;
  price_cents: number;
  bid_count: number;
  ends_at: string;
  reserve_cents: number | null;
  flat_bid_units: number | null;
  instance: AgentInstance;
}

// get_auction_state() JSON shape
export interface AuctionState {
  server_now: string;
  auction: {
    id: string;
    status: string;
    ends_at: string;
    opens_at: string;
    price_cents: number;
    bid_count: number;
    increment_cents: number;
    bid_face_cents: number;
    reserve_cents: number | null;
    flat_bid_units: number | null;
    leader_org_id: string | null;
    leader_name: string | null;
    seller_name: string | null;
    winner_org_id: string | null;
  };
  instance: AgentInstance & {
    memory_bytes: number;
    tool_scopes: string[];
  };
  bids: Array<{
    seq: number;
    price_after: number;
    placed_at: string;
    org_name: string;
  }>;
}

export function formatBytes(bytes: number): string {
  if (bytes >= 1_073_741_824) return `${(bytes / 1_073_741_824).toFixed(1)} GB`;
  if (bytes >= 1_048_576) return `${(bytes / 1_048_576).toFixed(0)} MB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${bytes} B`;
}

export function formatCount(n: number): string {
  return new Intl.NumberFormat("en-US").format(n);
}
