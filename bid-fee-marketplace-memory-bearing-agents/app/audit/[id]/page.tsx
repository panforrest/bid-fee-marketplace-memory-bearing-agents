import Link from "next/link";
import { createAdminClient } from "@/lib/supabase/admin";
import { SiteHeader } from "@/components/site-header";
import { MonadAnchor, AnchorReceipt } from "@/components/monad-anchor";
import { AuctionState } from "@/lib/types";
import { formatTokens } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function AuditPage({ params }: { params: { id: string } }) {
  const admin = createAdminClient();

  const { data: stateData } = await admin.rpc("get_auction_state", {
    p_auction_id: params.id,
  });
  const state = (stateData as AuctionState | null) ?? null;

  const { data: events } = await admin
    .from("auction_events")
    .select("payload, at")
    .eq("auction_id", params.id)
    .eq("kind", "monad_anchored")
    .order("at", { ascending: false });

  const receipts: AnchorReceipt[] = (events ?? []).map((e) => {
    const p = (e.payload ?? {}) as Record<string, string>;
    return {
      tx_hash: p.tx_hash,
      digest: p.digest,
      explorer_url: p.explorer_url ?? null,
      network: p.network,
      mode: (p.mode as "live" | "simulated") ?? "simulated",
      at: e.at as string,
    };
  });

  if (!state) {
    return (
      <>
        <SiteHeader />
        <div className="container flex min-h-[50vh] flex-col items-center justify-center text-center">
          <span className="mb-3 text-4xl">🔍</span>
          <h1 className="text-xl font-semibold">Auction not found</h1>
          <Link href="/" className="mt-2 text-sm text-cyan hover:underline">← Back to lots</Link>
        </div>
      </>
    );
  }

  const a = state.auction;
  const inst = state.instance;

  return (
    <>
      <SiteHeader />
      <div className="container max-w-4xl py-8">
        <div className="mb-2 flex items-center gap-3">
          <Link href={`/lot/${params.id}`} className="text-sm text-bone/50 hover:text-bone">
            ← Back to auction
          </Link>
        </div>
        <h1 className="flex items-center gap-2 text-2xl font-semibold">
          <span>{inst.emoji}</span> Public audit trail
        </h1>
        <p className="mt-1 text-sm text-bone/50">
          {inst.title} — every bid is append-only and publicly verifiable. Flat price{" "}
          <span className="text-bone/80">
            {a.flat_bid_units != null ? formatTokens(a.price_cents) : "not set yet"}
          </span>{" "}
          · {a.bid_count} bids · <span className="uppercase">{a.status}</span>
        </p>

        {/* settled winner */}
        {a.status === "settled" && a.winner_org_id && (
          <div className="mt-4 rounded-xl border border-gold/40 bg-gold/[0.06] px-4 py-3 text-sm font-semibold text-gold">
            🏆 Winner: {a.leader_name ?? "—"} · {formatTokens(a.price_cents)}
          </div>
        )}

        {/* on-chain anchoring */}
        <div className="mt-6">
          <MonadAnchor auctionId={params.id} initial={receipts} />
        </div>

        {/* full bid history */}
        <h2 className="mb-3 mt-8 text-sm font-semibold uppercase tracking-wide text-bone/50">
          Bid history
        </h2>
        <div className="overflow-hidden rounded-xl border border-border">
          {state.bids.length === 0 ? (
            <div className="p-6 text-center text-sm text-bone/40">No bids recorded.</div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-white/[0.03] text-[11px] uppercase tracking-wide text-bone/40">
                <tr>
                  <th className="px-4 py-2 text-left font-medium">#</th>
                  <th className="px-4 py-2 text-left font-medium">Bidder</th>
                  <th className="px-4 py-2 text-right font-medium">Price after</th>
                  <th className="px-4 py-2 text-right font-medium">Time</th>
                </tr>
              </thead>
              <tbody>
                {state.bids.map((b) => (
                  <tr key={b.seq} className="border-t border-border/60">
                    <td className="px-4 py-2 font-mono text-bone/40">{b.seq}</td>
                    <td className="px-4 py-2 text-bone/80">{b.org_name}</td>
                    <td className="px-4 py-2 text-right tabular-nums text-bone">{formatTokens(b.price_after)}</td>
                    <td className="px-4 py-2 text-right font-mono text-[11px] text-bone/40">
                      {new Date(b.placed_at).toLocaleTimeString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </>
  );
}
