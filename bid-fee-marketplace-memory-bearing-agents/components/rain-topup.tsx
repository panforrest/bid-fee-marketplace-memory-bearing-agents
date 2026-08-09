"use client";

import { useState } from "react";
import { formatUsd } from "@/lib/utils";
import { BID_PACKS } from "@/lib/rain/packs";

interface Receipt {
  reference: string;
  usdcAmount: number;
  network: string;
  mode: "live" | "simulated";
}

export function RainTopup({
  orgId,
  onFunded,
}: {
  orgId: string | null;
  onFunded: () => void | Promise<void>;
}) {
  const [pending, setPending] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function buy(packId: string) {
    if (!orgId || pending) return;
    setPending(packId);
    setError(null);
    try {
      const res = await fetch("/api/rain/checkout", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ kind: "allowance_topup", orgId, packId }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Payment failed");
      setReceipt(json.rain as Receipt);
      await onFunded();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Payment failed");
    } finally {
      setPending(null);
    }
  }

  return (
    <div className="rounded-2xl border border-cyan/25 bg-cyan/[0.04] p-5">
      <div className="flex items-center justify-between">
        <div>
          <p className="font-mono text-[11px] uppercase tracking-widest text-cyan/70">
            Fund with stablecoin
          </p>
          <h3 className="mt-0.5 text-lg font-semibold">Top up bid allowance in USDC</h3>
        </div>
        <span className="flex items-center gap-1.5 rounded-full border border-cyan/30 px-2.5 py-1 text-[11px] font-medium text-cyan">
          <span className="inline-block h-1.5 w-1.5 rounded-full bg-cyan" />
          Powered by Rain
        </span>
      </div>

      <p className="mt-1 text-xs text-bone/50">
        Settled in USDC, 24/7 on stablecoin rails. Fund your bid allowance instantly — each bid
        raises the price a fixed step, and the last bidder wins.
      </p>

      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
        {BID_PACKS.map((p) => (
          <button
            key={p.id}
            onClick={() => buy(p.id)}
            disabled={!orgId || !!pending}
            className="group rounded-xl border border-border bg-card p-4 text-left transition-colors hover:border-cyan/50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <p className="text-xs uppercase tracking-wide text-bone/40">{p.label}</p>
            <p className="mt-1 text-2xl font-semibold tabular-nums text-cyan">+{p.bids}</p>
            <p className="text-xs text-bone/40">bids</p>
            <p className="mt-2 font-mono text-sm text-bone/80">
              {pending === p.id ? "Settling…" : `${formatUsd(p.amountCents)} USDC`}
            </p>
          </button>
        ))}
      </div>

      {error && <p className="mt-3 text-sm text-red-400">{error}</p>}

      {receipt && (
        <div className="mt-4 rounded-xl border border-gold/30 bg-gold/[0.05] p-4 text-sm">
          <div className="flex items-center justify-between">
            <span className="font-semibold text-gold">USDC settled via Rain ✓</span>
            <span
              className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${
                receipt.mode === "live"
                  ? "bg-cyan/20 text-cyan"
                  : "bg-white/10 text-bone/60"
              }`}
            >
              {receipt.mode === "live" ? "Live" : "Sandbox"}
            </span>
          </div>
          <dl className="mt-2 space-y-1 font-mono text-[11px] text-bone/60">
            <div className="flex justify-between gap-4">
              <dt>Amount</dt>
              <dd className="text-bone/90">{receipt.usdcAmount} USDC</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt>Network</dt>
              <dd className="text-bone/90">{receipt.network}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt>Reference</dt>
              <dd className="truncate text-bone/90" title={receipt.reference}>
                {receipt.reference}
              </dd>
            </div>
          </dl>
        </div>
      )}
    </div>
  );
}
