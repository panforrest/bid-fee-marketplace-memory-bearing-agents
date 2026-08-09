"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { AuctionState, formatBytes, formatCount } from "@/lib/types";
import { formatUsd } from "@/lib/utils";
import { Countdown } from "@/components/countdown";

type Toast = { id: number; msg: string; kind: "ok" | "err" | "info" };

const ERROR_COPY: Record<string, string> = {
  AUCTION_CLOSED: "This auction has closed.",
  INSUFFICIENT_BIDS: "You're out of bids. Top up in your wallet.",
  ALREADY_LEADING: "You're already the highest bidder.",
  SELLER_CANNOT_BID: "Sellers can't bid on their own lot.",
  NO_ORG: "Still connecting your account — try again in a moment.",
  NOT_FOUND: "Auction not found.",
  BAD_UNITS: "Invalid bid amount.",
};

// Bid tiers: how many increment-steps (= credits) each click spends.
const BID_TIERS = [
  { units: 1, label: "+$0.01" },
  { units: 10, label: "+$0.10" },
  { units: 100, label: "+$1.00" },
];

export function LiveAuction({
  auctionId,
  initialState,
}: {
  auctionId: string;
  initialState: AuctionState | null;
}) {
  const supabase = useRef(createClient()).current;
  const [state, setState] = useState<AuctionState | null>(initialState);
  const [offsetMs, setOffsetMs] = useState(0);
  const [myOrgId, setMyOrgId] = useState<string | null>(null);
  const [myBids, setMyBids] = useState<number | null>(null);
  const [placing, setPlacing] = useState(false);
  const [ready, setReady] = useState(false);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const lastBidAt = useRef(0);

  const pushToast = useCallback((msg: string, kind: Toast["kind"] = "info") => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, msg, kind }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3200);
  }, []);

  const refetch = useCallback(async () => {
    const { data, error } = await supabase.rpc("get_auction_state", {
      p_auction_id: auctionId,
    });
    if (!error && data) {
      const s = data as AuctionState;
      setState(s);
      setOffsetMs(new Date(s.server_now).getTime() - Date.now());
    }
  }, [supabase, auctionId]);

  // Auth (anonymous) + provision wallet + initial fetch
  useEffect(() => {
    let active = true;
    (async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) {
        const { error } = await supabase.auth.signInAnonymously();
        if (error) {
          pushToast("Couldn't start a guest session. Is anonymous auth enabled?", "err");
        }
      }
      const { data: org } = await supabase.rpc("ensure_org", {});
      if (active && org && org[0]) {
        setMyOrgId(org[0].org_id);
        setMyBids(org[0].bid_balance);
      }
      await refetch();
      if (active) setReady(true);
    })();
    return () => {
      active = false;
    };
  }, [supabase, refetch, pushToast]);

  // Realtime: any new auction_event -> reconcile state
  useEffect(() => {
    const channel = supabase
      .channel(`auction:${auctionId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "auction_events",
          filter: `auction_id=eq.${auctionId}`,
        },
        () => {
          refetch();
        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [supabase, auctionId, refetch]);

  const placeBid = useCallback(async (units: number) => {
    const now = Date.now();
    if (now - lastBidAt.current < 400) return; // client-side debounce
    lastBidAt.current = now;
    setPlacing(true);
    try {
      const { data, error } = await supabase.rpc("place_bid", {
        p_auction_id: auctionId,
        p_units: units,
      });
      if (error) {
        pushToast(error.message, "err");
      } else if (data && data[0]) {
        const row = data[0] as {
          ok: boolean;
          price_cents: number;
          bid_balance: number;
          error: string | null;
        };
        if (row.ok) {
          setMyBids(row.bid_balance);
          pushToast(`Bid placed — you're leading at ${formatUsd(row.price_cents)}`, "ok");
        } else {
          pushToast(ERROR_COPY[row.error ?? ""] ?? row.error ?? "Bid failed", "err");
          if (row.bid_balance != null) setMyBids(row.bid_balance);
        }
      }
    } finally {
      setPlacing(false);
      refetch();
    }
  }, [supabase, auctionId, pushToast, refetch]);

  if (!state) {
    return (
      <div className="container py-24 text-center text-bone/50">
        Loading auction…
      </div>
    );
  }

  const a = state.auction;
  const inst = state.instance;
  const isLeader = myOrgId != null && a.leader_org_id === myOrgId;
  const isClosed = a.status !== "live";
  const outOfBids = myBids != null && myBids < 1;
  const reserveMet = a.reserve_cents == null || a.price_cents >= a.reserve_cents;
  const bidDisabled = !ready || placing || isClosed || isLeader;

  return (
    <div className="container grid grid-cols-1 gap-6 py-8 lg:grid-cols-3">
      {/* ---------------- LEFT: the stage ---------------- */}
      <div className="lg:col-span-2">
        {/* header */}
        <div className="mb-4 flex items-center gap-3">
          <Link href="/" className="text-sm text-bone/50 hover:text-bone">← Lots</Link>
        </div>
        <div className="flex items-start gap-4">
          <span className="flex h-16 w-16 items-center justify-center rounded-2xl bg-white/5 text-4xl">
            {inst.emoji}
          </span>
          <div>
            <h1 className="text-2xl font-semibold leading-tight">{inst.title}</h1>
            <p className="mt-1 font-mono text-xs uppercase tracking-wide text-bone/40">
              {inst.base_model} · {inst.framework} · {inst.memory_backend}
            </p>
            <p className="mt-2 max-w-xl text-sm text-bone/60">{inst.summary}</p>
          </div>
        </div>

        {/* the auction stage */}
        <div className="relative mt-6 overflow-hidden rounded-2xl border border-border bg-card p-6">
          <div
            className="pointer-events-none absolute -right-20 -top-20 h-64 w-64 rounded-full opacity-20 blur-[90px]"
            style={{ background: isLeader ? "#1FC8DE" : "#C9A227" }}
          />
          <div className="flex flex-wrap items-end justify-between gap-6">
            <div>
              <p className="font-mono text-[11px] uppercase tracking-widest text-bone/40">
                Current price
              </p>
              <p className="text-6xl font-semibold tabular-nums text-bone">
                {formatUsd(a.price_cents)}
              </p>
              <p className="mt-1 text-xs text-bone/40">
                {a.bid_count} bids · leader:{" "}
                <span className={isLeader ? "text-cyan" : "text-bone/70"}>
                  {isLeader ? "You" : a.leader_name ?? "—"}
                </span>
              </p>
            </div>
            <div className="text-right">
              <p className="font-mono text-[11px] uppercase tracking-widest text-bone/40">
                {isClosed ? "Ended" : "Time left"}
              </p>
              <Countdown
                endsAt={a.ends_at}
                serverOffsetMs={offsetMs}
                onExpire={refetch}
                className="mt-1 text-base"
              />
              {a.reserve_cents != null && (
                <p className={`mt-2 text-[11px] ${reserveMet ? "text-cyan" : "text-gold"}`}>
                  Reserve {formatUsd(a.reserve_cents)} · {reserveMet ? "met ✓" : "not met"}
                </p>
              )}
            </div>
          </div>

          {/* bid tiers */}
          {!ready ? (
            <div className="mt-6 w-full rounded-xl bg-white/5 px-6 py-4 text-center text-lg font-semibold text-bone/40">
              Connecting…
            </div>
          ) : isClosed ? (
            <div className="mt-6 w-full rounded-xl bg-white/5 px-6 py-4 text-center text-lg font-semibold text-bone/40">
              Auction closed
            </div>
          ) : isLeader ? (
            <div className="mt-6 w-full rounded-xl border border-cyan/30 bg-cyan/5 px-6 py-4 text-center text-lg font-semibold text-cyan">
              You&apos;re the highest bidder
            </div>
          ) : (
            <div className="mt-6 grid grid-cols-3 gap-3">
              {BID_TIERS.map((tier) => {
                const priceInc = tier.units * a.increment_cents;
                const cantAfford = myBids != null && myBids < tier.units;
                const tierDisabled = bidDisabled || cantAfford;
                return (
                  <button
                    key={tier.units}
                    onClick={() => placeBid(tier.units)}
                    disabled={tierDisabled}
                    className={[
                      "rounded-xl px-4 py-3 text-center transition-all",
                      tierDisabled
                        ? "cursor-not-allowed bg-white/5 text-bone/30"
                        : "bg-cyan text-ink hover:bg-cyan-glow hover:shadow-[0_0_30px_rgba(31,200,222,0.35)]",
                    ].join(" ")}
                  >
                    <span className="block text-lg font-semibold">{tier.label}</span>
                    <span className="block text-xs opacity-80">→ {formatUsd(a.price_cents + priceInc)}</span>
                    <span className="mt-0.5 block text-[11px] opacity-60">
                      {tier.units} credit{tier.units > 1 ? "s" : ""}
                    </span>
                  </button>
                );
              })}
            </div>
          )}

          <div className="mt-3 flex items-center justify-between text-xs text-bone/40">
            <span>
              {myBids != null ? (
                <>Your bids: <span className="text-bone/70">{myBids}</span> · 1 credit raises the price {formatUsd(a.increment_cents)}</>
              ) : (
                "Connecting your guest wallet…"
              )}
            </span>
            {outOfBids && (
              <Link href="/wallet" className="text-cyan hover:underline">Top up →</Link>
            )}
          </div>

          {isLeader && !isClosed && (
            <div className="mt-4 rounded-lg border border-cyan/30 bg-cyan/5 px-4 py-2 text-center text-sm text-cyan">
              🏆 You&apos;re the highest bidder. Sit tight — you can&apos;t bid against yourself.
            </div>
          )}
          {isClosed && (
            <div className="mt-4 rounded-lg border border-gold/30 bg-gold/5 px-4 py-3 text-center text-sm text-gold">
              Auction {a.status}. {a.winner_org_id ? "Winner assigned." : ""} Losing bids convert to store credit at par.
            </div>
          )}
        </div>

        {/* trust banner */}
        <div className="mt-4 flex items-center justify-between rounded-xl border border-border bg-white/[0.02] px-4 py-3 text-xs text-bone/50">
          <span>
            <span className="text-cyan">🔒 House accounts cannot bid</span> — enforced by a database constraint. Every bid is publicly auditable.
          </span>
          <Link href={`/audit/${auctionId}`} className="shrink-0 text-cyan hover:underline">
            Audit trail →
          </Link>
        </div>

        {/* bid feed */}
        <div className="mt-6">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-bone/50">
            Live bid feed
          </h2>
          <div className="overflow-hidden rounded-xl border border-border">
            {state.bids.length === 0 ? (
              <div className="p-6 text-center text-sm text-bone/40">
                No bids yet — be the first.
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead className="bg-white/[0.03] text-[11px] uppercase tracking-wide text-bone/40">
                  <tr>
                    <th className="px-4 py-2 text-left font-medium">#</th>
                    <th className="px-4 py-2 text-left font-medium">Bidder</th>
                    <th className="px-4 py-2 text-right font-medium">Price</th>
                    <th className="px-4 py-2 text-right font-medium">Time</th>
                  </tr>
                </thead>
                <tbody>
                  {state.bids.map((b) => {
                    return (
                      <tr key={b.seq} className="border-t border-border/60">
                        <td className="px-4 py-2 font-mono text-bone/40">{b.seq}</td>
                        <td className="px-4 py-2 text-bone/80">{b.org_name}</td>
                        <td className="px-4 py-2 text-right tabular-nums text-bone">{formatUsd(b.price_after)}</td>
                        <td className="px-4 py-2 text-right font-mono text-[11px] text-bone/40">
                          {new Date(b.placed_at).toLocaleTimeString()}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>

      {/* ---------------- RIGHT: the asset ---------------- */}
      <div className="space-y-4">
        <div className="rounded-2xl border border-border bg-card p-5">
          <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-bone/50">
            The memory
          </h3>
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between"><dt className="text-bone/50">Records</dt><dd className="tabular-nums text-bone">{formatCount(inst.memory_record_ct)}</dd></div>
            <div className="flex justify-between"><dt className="text-bone/50">Size</dt><dd className="tabular-nums text-bone">{formatBytes(inst.memory_bytes)}</dd></div>
            {inst.benchmark_score != null && (
              <div className="flex justify-between"><dt className="text-bone/50">{inst.benchmark_suite}</dt><dd className="tabular-nums text-cyan">{inst.benchmark_score}</dd></div>
            )}
            <div className="flex justify-between"><dt className="text-bone/50">Seller</dt><dd className="text-bone">{a.seller_name}</dd></div>
          </dl>

          {inst.memory_highlights?.length > 0 && (
            <div className="mt-4 space-y-1.5">
              {inst.memory_highlights.map((h, i) => (
                <p key={i} className="flex gap-2 text-xs text-bone/60">
                  <span className="text-cyan">▸</span> {h}
                </p>
              ))}
            </div>
          )}

          {inst.tool_scopes?.length > 0 && (
            <div className="mt-4 flex flex-wrap gap-1.5">
              {inst.tool_scopes.map((t) => (
                <span key={t} className="rounded-md bg-white/5 px-2 py-1 font-mono text-[10px] text-bone/50">{t}</span>
              ))}
            </div>
          )}
        </div>

        {/* Step 7 placeholder */}
        <div className="rounded-2xl border border-dashed border-border bg-card p-5 text-center">
          <p className="text-2xl">💬</p>
          <p className="mt-1 text-sm font-medium text-bone/70">Chat with its memory</p>
          <p className="mt-1 text-xs text-bone/40">Try the agent before you bid — coming in Step 7.</p>
        </div>
      </div>

      {/* ---------------- Toasts ---------------- */}
      <div className="fixed bottom-6 right-6 z-50 flex flex-col gap-2">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={[
              "animate-slide-up rounded-lg border px-4 py-3 text-sm shadow-lg backdrop-blur",
              t.kind === "ok"
                ? "border-cyan/40 bg-cyan/10 text-cyan"
                : t.kind === "err"
                ? "border-red-500/40 bg-red-500/10 text-red-300"
                : "border-border bg-white/5 text-bone/80",
            ].join(" ")}
          >
            {t.msg}
          </div>
        ))}
      </div>
    </div>
  );
}
