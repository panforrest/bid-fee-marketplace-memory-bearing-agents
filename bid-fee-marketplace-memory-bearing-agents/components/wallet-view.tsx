"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { formatUsd } from "@/lib/utils";
import { formatCount } from "@/lib/types";

interface Entry {
  id: number;
  kind: string;
  bid_delta: number;
  cents_delta: number;
  auction_id: string | null;
  reason: string | null;
  created_at: string;
}
interface WalletData {
  org_id: string;
  wallet: { bid_balance: number; credit_cents: number; updated_at: string } | null;
  entries: Entry[];
}

const KIND_META: Record<string, { label: string; icon: string }> = {
  subscription_grant: { label: "Bid allowance granted", icon: "🎁" },
  bid_spend: { label: "Bid placed", icon: "🔨" },
  loser_creditback: { label: "Credit-back — bid returned at par", icon: "↩️" },
  purchase_applied: { label: "Store credit applied to purchase", icon: "🛒" },
  manual_adjustment: { label: "Manual adjustment", icon: "⚙️" },
};

export function WalletView() {
  const supabase = useRef(createClient()).current;
  const [data, setData] = useState<WalletData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) await supabase.auth.signInAnonymously();
      await supabase.rpc("ensure_org", {});
      const { data: w } = await supabase.rpc("get_my_wallet");
      setData((w as WalletData) ?? null);
      setLoading(false);
    })();
  }, [supabase]);

  if (loading) {
    return <div className="container py-24 text-center text-bone/50">Loading your wallet…</div>;
  }

  const bidBalance = data?.wallet?.bid_balance ?? 0;
  const creditCents = data?.wallet?.credit_cents ?? 0;
  const entries = data?.entries ?? [];
  const creditedBack = entries
    .filter((e) => e.kind === "loser_creditback")
    .reduce((s, e) => s + e.cents_delta, 0);

  return (
    <div className="container max-w-4xl py-8">
      <div className="mb-2 flex items-center gap-3">
        <Link href="/" className="text-sm text-bone/50 hover:text-bone">← Lots</Link>
      </div>
      <h1 className="text-2xl font-semibold">Your wallet</h1>
      <p className="mt-1 text-sm text-bone/50">
        The ledger is the source of truth — every entry is append-only. Balances are just a cached sum.
      </p>

      {/* stat cards */}
      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-2xl border border-border bg-card p-5">
          <p className="font-mono text-[11px] uppercase tracking-widest text-bone/40">Bid balance</p>
          <p className="mt-1 text-4xl font-semibold tabular-nums text-cyan">{formatCount(bidBalance)}</p>
          <p className="mt-1 text-xs text-bone/40">bids available</p>
        </div>
        <div className="rounded-2xl border border-border bg-card p-5">
          <p className="font-mono text-[11px] uppercase tracking-widest text-bone/40">Store credit</p>
          <p className="mt-1 text-4xl font-semibold tabular-nums text-gold">{formatUsd(creditCents)}</p>
          <p className="mt-1 text-xs text-bone/40">usable on any lot at par</p>
        </div>
        <div className="rounded-2xl border border-border bg-card p-5">
          <p className="font-mono text-[11px] uppercase tracking-widest text-bone/40">Credited back</p>
          <p className="mt-1 text-4xl font-semibold tabular-nums text-bone/80">{formatUsd(creditedBack)}</p>
          <p className="mt-1 text-xs text-bone/40">from lost auctions</p>
        </div>
      </div>

      {/* credit-back explainer */}
      <div className="mt-4 rounded-xl border border-gold/30 bg-gold/5 px-4 py-3 text-sm text-gold/90">
        <b>Nobody leaves with nothing.</b> This isn&apos;t a penny auction — every bid you spend on a
        lot you don&apos;t win converts to store credit <b>at par</b>, usable against any listing.
      </div>

      {/* ledger */}
      <h2 className="mb-3 mt-8 text-sm font-semibold uppercase tracking-wide text-bone/50">
        Ledger
      </h2>
      <div className="overflow-hidden rounded-xl border border-border">
        {entries.length === 0 ? (
          <div className="p-6 text-center text-sm text-bone/40">
            No activity yet. Place a bid to see your ledger fill in.
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-white/[0.03] text-[11px] uppercase tracking-wide text-bone/40">
              <tr>
                <th className="px-4 py-2 text-left font-medium">Activity</th>
                <th className="px-4 py-2 text-right font-medium">Bids</th>
                <th className="px-4 py-2 text-right font-medium">Credit</th>
                <th className="px-4 py-2 text-right font-medium">When</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((e) => {
                const meta = KIND_META[e.kind] ?? { label: e.kind, icon: "•" };
                return (
                  <tr key={e.id} className="border-t border-border/60">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <span>{meta.icon}</span>
                        <span className="text-bone/80">{e.reason || meta.label}</span>
                        {e.auction_id && (
                          <Link href={`/lot/${e.auction_id}`} className="text-[11px] text-cyan hover:underline">
                            lot →
                          </Link>
                        )}
                      </div>
                    </td>
                    <td className={`px-4 py-3 text-right tabular-nums ${e.bid_delta > 0 ? "text-cyan" : e.bid_delta < 0 ? "text-bone/50" : "text-bone/20"}`}>
                      {e.bid_delta > 0 ? `+${e.bid_delta}` : e.bid_delta < 0 ? e.bid_delta : "—"}
                    </td>
                    <td className={`px-4 py-3 text-right tabular-nums ${e.cents_delta > 0 ? "text-gold" : e.cents_delta < 0 ? "text-bone/50" : "text-bone/20"}`}>
                      {e.cents_delta !== 0 ? formatUsd(e.cents_delta) : "—"}
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-[11px] text-bone/40">
                      {new Date(e.created_at).toLocaleTimeString()}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
