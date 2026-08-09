// Pre-labeled bidder identity from URL params, persisted per-browser so it
// sticks across navigation. Usage: open ?name=Bidder%201&wallet=0x... — the
// guest wallet is then provisioned/named with that display name.
//
// NOTE: Supabase anon auth stores ONE session per browser storage context, so
// two labeled URLs in the SAME browser are the SAME bidder. Open each URL in a
// separate session (normal window + incognito/second profile) for two bidders.

export interface BidderIdentity {
  name: string | null;
  wallet: string | null;
}

const NAME_KEY = "memoria_bidder_name";
const WALLET_KEY = "memoria_bidder_wallet";

// Reads ?name / ?wallet from the URL (if present, persists them), otherwise
// falls back to localStorage. Safe to call on the client only.
export function resolveBidderIdentity(): BidderIdentity {
  if (typeof window === "undefined") return { name: null, wallet: null };
  const params = new URLSearchParams(window.location.search);
  const qpName = params.get("name");
  const qpWallet = params.get("wallet");

  if (qpName) window.localStorage.setItem(NAME_KEY, qpName);
  if (qpWallet) window.localStorage.setItem(WALLET_KEY, qpWallet);

  const name = qpName ?? window.localStorage.getItem(NAME_KEY);
  const wallet = qpWallet ?? window.localStorage.getItem(WALLET_KEY);
  return { name: name || null, wallet: wallet || null };
}

// 0x0B58561F…D82bc50b -> 0x0B58…c50b
export function shortWallet(wallet: string | null): string {
  if (!wallet) return "";
  const w = wallet.trim();
  if (w.length <= 12) return w;
  return `${w.slice(0, 6)}…${w.slice(-4)}`;
}
