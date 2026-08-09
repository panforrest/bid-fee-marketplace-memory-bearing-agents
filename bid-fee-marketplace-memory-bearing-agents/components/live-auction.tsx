"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { AuctionState, formatBytes, formatCount } from "@/lib/types";
import { formatTokens } from "@/lib/utils";
import { resolveBidderIdentity, shortWallet } from "@/lib/bidder";
import { Countdown } from "@/components/countdown";

type Toast = { id: number; msg: string; kind: "ok" | "err" | "info" };

interface SettleResult {
  status: string;
  price_cents: number;
  usdc: number;
  winner: { org_id: string; name: string | null } | null;
  seller: { org_id: string; name: string | null } | null;
  rain: {
    status: string;
    usdc: number;
    reference: string;
    network: string;
    mode: string;
  } | null;
  receipt: {
    tx_hash: string;
    explorer_url: string | null;
    mode: "live" | "simulated";
  } | null;
}

const ERROR_COPY: Record<string, string> = {
  AUCTION_CLOSED: "This auction has closed.",
  INSUFFICIENT_BIDS: "You're out of bids. Top up in your wallet.",
  ALREADY_LEADING: "You're already the highest bidder.",
  SELLER_CANNOT_BID: "Sellers can't bid on their own lot.",
  NO_ORG: "Still connecting your account — try again in a moment.",
  NOT_FOUND: "Auction not found.",
  BAD_UNITS: "Invalid bid amount.",
};
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
  const [openAmount, setOpenAmount] = useState<number>(1); // opening-bid entry in Servitor tokens (1 token = $1 = 100 credits)
  const [settling, setSettling] = useState(false);
  const [settleResult, setSettleResult] = useState<SettleResult | null>(null);
  const [bidderName, setBidderName] = useState<string | null>(null);
  const [bidderWallet, setBidderWallet] = useState<string | null>(null);
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
      const identity = resolveBidderIdentity();
      if (active) {
        setBidderName(identity.name);
        setBidderWallet(identity.wallet);
      }
      const { data: org } = await supabase.rpc("ensure_org", {
        p_display_name: identity.name,
      });
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
          pushToast(`Bid placed — you're leading at ${formatTokens(row.price_cents)}`, "ok");
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

  const endAuctionNow = useCallback(async () => {
    if (settling) return;
    setSettling(true);
    try {
      const res = await fetch("/api/auction/settle", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ auctionId }),
      });
      const json = await res.json();
      if (!res.ok) {
        pushToast(json.error || "Settle failed", "err");
      } else {
        setSettleResult(json as SettleResult);
        pushToast(
          (json as SettleResult).winner
            ? "Auction settled + anchored on Monad ✓"
            : "Auction closed with no winner",
          "ok"
        );
      }
    } catch (e) {
      pushToast(e instanceof Error ? e.message : "Settle failed", "err");
    } finally {
      setSettling(false);
      refetch();
    }
  }, [settling, auctionId, pushToast, refetch]);

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
  // Opening bid sets the flat amount; after that it's locked for everyone.
  const priceSet = a.flat_bid_units != null;
  const lockedUnits = a.flat_bid_units ?? 0;
  const flatPrice = lockedUnits * a.increment_cents; // constant once the price is set
  // amount the current click will spend (in credits): locked amount, or the
  // opening-bid entry. The entry is in Servitor tokens; 1 token = 100 credits.
  const openUnits = Number.isFinite(openAmount) && openAmount > 0 ? Math.floor(openAmount * 100) : 0;
  const spendUnits = priceSet ? lockedUnits : openUnits;
  const outOfBids = myBids != null && spendUnits > 0 && myBids < spendUnits;
  const canOpen = !priceSet && openUnits >= 1 && !(myBids != null && myBids < openUnits);
  const bidDisabled =
    !ready || placing || isClosed || isLeader || outOfBids || (!priceSet && !canOpen);

  // Winner/settlement view: prefer the fresh settle response, fall back to state.
  const settled = isClosed || settleResult != null;
  const hasWinner = settleResult ? settleResult.winner != null : a.winner_org_id != null;
  const winnerName = settleResult?.winner?.name ?? a.leader_name ?? "—";
  const winnerCents = settleResult?.price_cents ?? a.price_cents;

  return (
    <div className="container grid grid-cols-1 gap-6 py-8 lg:grid-cols-3">
      {/* ---------------- LEFT: the stage ---------------- */}
      <div className="lg:col-span-2">
        {/* header */}
        <div className="mb-4 flex items-center gap-3">
          <Link href="/" className="text-sm text-bone/50 hover:text-bone">← Lots</Link>
          {(bidderName || bidderWallet) && (
            <span className="ml-auto flex items-center gap-2 rounded-lg border border-cyan/30 bg-cyan/10 px-3 py-1.5 text-xs font-medium text-cyan">
              <span className="inline-block h-1.5 w-1.5 rounded-full bg-cyan" />
              You are <span className="text-bone/90">{bidderName ?? "Guest"}</span>
              {bidderWallet && <span className="font-mono text-cyan/80">{shortWallet(bidderWallet)}</span>}
            </span>
          )}
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
                {priceSet ? "Flat price · every bid" : "Awaiting opening bid"}
              </p>
              {priceSet ? (
                <p className="text-4xl font-semibold tabular-nums text-bone">
                  {formatTokens(flatPrice)}
                </p>
              ) : (
                <p className="mt-1 text-2xl font-semibold text-bone/70">
                  Opening bid sets the price
                </p>
              )}
              <p className="mt-1 text-xs text-bone/40">
                {a.bid_count} bids · leader:{" "}
                <span className={isLeader ? "text-cyan" : "text-bone/70"}>
                  {isLeader ? "You" : a.leader_name ?? "—"}
                </span>
              </p>
              {priceSet && (
                <p className="mt-0.5 text-[11px] text-gold/80">
                  seller pot: {formatTokens(a.bid_count * flatPrice)}
                </p>
              )}
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
              {!isClosed && a.bid_count > 0 && (
                <p className="mt-2 text-[11px] text-gold">going once — 2 min resets on each bid</p>
              )}
            </div>
          </div>

          {/* bid controls */}
          {!priceSet && !isClosed ? (
            /* OPENING BID: the first bidder names any amount and locks the price */
            <div className="mt-6">
              <label className="mb-1 block font-mono text-[11px] uppercase tracking-widest text-bone/40">
                Your opening bid (Servitor tokens) — locks the flat price for everyone
              </label>
              <div className="flex gap-3">
                <div className="relative flex-1">
                  <input
                    type="number"
                    min={1}
                    step={1}
                    value={openAmount}
                    onChange={(e) => setOpenAmount(parseFloat(e.target.value) || 0)}
                    className="w-full rounded-xl border border-border bg-white/5 px-4 py-4 text-lg tabular-nums text-bone outline-none focus:border-cyan"
                  />
                  <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-sm text-bone/40">
                    = {formatTokens(openUnits * a.increment_cents)}
                  </span>
                </div>
                <button
                  onClick={() => placeBid(openUnits)}
                  disabled={bidDisabled}
                  className={[
                    "shrink-0 rounded-xl px-6 py-4 text-lg font-semibold transition-all",
                    bidDisabled
                      ? "cursor-not-allowed bg-white/5 text-bone/40"
                      : "bg-cyan text-ink hover:bg-cyan-glow hover:shadow-[0_0_30px_rgba(31,200,222,0.4)]",
                  ].join(" ")}
                >
                  {!ready
                    ? "Connecting…"
                    : placing
                    ? "Opening…"
                    : outOfBids
                    ? "Out of bids"
                    : `Open the bidding · ${formatTokens(openUnits * a.increment_cents)}`}
                </button>
              </div>
            </div>
          ) : (
            /* LOCKED: every bid is the same amount the opener set */
            <button
              onClick={() => placeBid(lockedUnits)}
              disabled={bidDisabled}
              className={[
                "mt-6 w-full rounded-xl px-6 py-4 text-lg font-semibold transition-all",
                bidDisabled
                  ? "cursor-not-allowed bg-white/5 text-bone/40"
                  : "bg-cyan text-ink hover:bg-cyan-glow hover:shadow-[0_0_30px_rgba(31,200,222,0.4)]",
              ].join(" ")}
            >
              {!ready
                ? "Connecting…"
                : isClosed
                ? "Auction closed"
                : isLeader
                ? "You're the highest bidder"
                : outOfBids
                ? "Out of bids"
                : placing
                ? "Placing…"
                : `Place bid · ${formatTokens(flatPrice)}`}
            </button>
          )}

          <div className="mt-3 flex items-center justify-between text-xs text-bone/40">
            <span>
              {myBids != null ? (
                priceSet ? (
                  <>Your bids: <span className="text-bone/70">{myBids}</span> · each bid = {formatTokens(flatPrice)}, flat, same for everyone. Win if no one bids for 2 min.</>
                ) : (
                  <>Your bids: <span className="text-bone/70">{myBids}</span> · the opening bid sets one flat amount for the whole auction. Last bidder after 2 min wins.</>
                )
              ) : (
                "Connecting your guest wallet…"
              )}
            </span>
            {outOfBids && (
              <Link href="/wallet" className="text-cyan hover:underline">Top up →</Link>
            )}
          </div>

          {isLeader && !isClosed && !settled && (
            <div className="mt-4 rounded-lg border border-cyan/30 bg-cyan/5 px-4 py-2 text-center text-sm text-cyan">
              🏆 You&apos;re the highest bidder. Sit tight — you can&apos;t bid against yourself.
            </div>
          )}

          {/* DEMO CONTROL: force-settle to the last bidder + anchor on Monad */}
          {!settled && (
            <div className="mt-4">
              <button
                onClick={endAuctionNow}
                disabled={settling || a.bid_count === 0}
                className={[
                  "w-full rounded-xl border px-4 py-3 text-sm font-semibold transition-all",
                  settling || a.bid_count === 0
                    ? "cursor-not-allowed border-border bg-white/5 text-bone/40"
                    : "border-gold/40 bg-gold/10 text-gold hover:bg-gold/20",
                ].join(" ")}
              >
                {settling
                  ? "Settling + anchoring on Monad…"
                  : a.bid_count === 0
                  ? "End auction now (demo) — needs at least one bid"
                  : "⚡ End auction now (demo)"}
              </button>
              <p className="mt-1 text-center text-[11px] text-bone/40">
                Demo control · ends the clock, settles to the last bidder, and anchors the result on Monad.
              </p>
            </div>
          )}

          {/* WINNER + MONAD RECEIPT */}
          {settled && (
            <div className="mt-4 rounded-xl border border-gold/40 bg-gold/[0.06] px-4 py-4 text-center">
              {hasWinner ? (
                <p className="text-lg font-semibold text-gold">
                  🏆 Winner: {winnerName} · {formatTokens(winnerCents)}
                </p>
              ) : (
                <p className="text-lg font-semibold text-gold">
                  Auction closed — no bids, no winner.
                </p>
              )}
              {settleResult && hasWinner ? (
                <div className="mt-3 space-y-1.5 text-sm">
                  {settleResult.rain && (
                    <p className="text-cyan">
                      Paid seller{settleResult.seller?.name ? ` ${settleResult.seller.name}` : ""} $
                      {settleResult.usdc.toFixed(2)} USDC via Rain ✓{" "}
                      <span className="text-[11px] uppercase tracking-wide text-bone/40">
                        ({settleResult.rain.mode === "live" ? "Live" : "Sandbox"})
                      </span>
                    </p>
                  )}
                  {settleResult.receipt ? (
                    <p className="text-cyan">
                      Anchored on Monad ✓{" "}
                      <span className="text-[11px] uppercase tracking-wide text-bone/40">
                        ({settleResult.receipt.mode === "live" ? "On-chain" : "Sandbox"})
                      </span>
                      <br />
                      {settleResult.receipt.explorer_url ? (
                        <a
                          href={settleResult.receipt.explorer_url}
                          target="_blank"
                          rel="noreferrer"
                          className="font-mono text-[11px] text-cyan hover:underline"
                        >
                          tx {settleResult.receipt.tx_hash} ↗
                        </a>
                      ) : (
                        <span className="font-mono text-[11px] text-bone/50">
                          tx {settleResult.receipt.tx_hash}
                        </span>
                      )}
                    </p>
                  ) : null}
                  <Link
                    href={`/audit/${auctionId}`}
                    className="inline-block pt-1 text-[11px] text-cyan hover:underline"
                  >
                    Full audit trail →
                  </Link>
                </div>
              ) : (
                <Link
                  href={`/audit/${auctionId}`}
                  className="mt-2 inline-block text-sm text-cyan hover:underline"
                >
                  View settlement on the audit trail →
                </Link>
              )}
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
                        <td className="px-4 py-2 text-right tabular-nums text-bone">{formatTokens(b.price_after)}</td>
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
