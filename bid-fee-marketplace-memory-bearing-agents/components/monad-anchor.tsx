"use client";

import { useState } from "react";
import { humanizeSandboxReason } from "@/lib/monad/reasons";

export interface AnchorReceipt {
  tx_hash: string;
  digest: string;
  explorer_url: string | null;
  network: string;
  mode: "live" | "simulated";
  reason?: string | null;
  at?: string;
}

export function MonadAnchor({
  auctionId,
  initial,
}: {
  auctionId: string;
  initial: AnchorReceipt[];
}) {
  const [receipts, setReceipts] = useState<AnchorReceipt[]>(initial);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function anchor() {
    if (pending) return;
    setPending(true);
    setError(null);
    try {
      const res = await fetch("/api/monad/anchor", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ auctionId }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Anchor failed");
      const r = json.receipt;
      setReceipts((prev) => [
        {
          tx_hash: r.txHash,
          digest: r.digest,
          explorer_url: r.explorerUrl,
          network: r.network,
          mode: r.mode,
          reason: r.reason ?? null,
          at: new Date().toISOString(),
        },
        ...prev,
      ]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Anchor failed");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="rounded-2xl border border-cyan/25 bg-cyan/[0.04] p-5">
      <div className="flex items-center justify-between">
        <div>
          <p className="font-mono text-[11px] uppercase tracking-widest text-cyan/70">
            Tamper-evident audit
          </p>
          <h3 className="mt-0.5 text-lg font-semibold">Anchor this auction on Monad</h3>
        </div>
        <span className="flex items-center gap-1.5 rounded-full border border-cyan/30 px-2.5 py-1 text-[11px] font-medium text-cyan">
          <span className="inline-block h-1.5 w-1.5 rounded-full bg-cyan" />
          Monad testnet
        </span>
      </div>
      <p className="mt-1 text-xs text-bone/50">
        Writes a keccak256 digest of the auction&apos;s canonical state on-chain. Anyone can verify
        the bid history was never altered after the fact.
      </p>

      <button
        onClick={anchor}
        disabled={pending}
        className="mt-4 rounded-xl bg-cyan px-5 py-2.5 text-sm font-semibold text-ink transition-colors hover:bg-cyan-glow disabled:cursor-not-allowed disabled:opacity-50"
      >
        {pending ? "Anchoring on-chain…" : "Anchor receipt →"}
      </button>

      {error && <p className="mt-3 text-sm text-red-400">{error}</p>}

      {receipts.length > 0 && (
        <div className="mt-4 space-y-2">
          {receipts.map((r, i) => (
            <div
              key={`${r.tx_hash}-${i}`}
              className="rounded-lg border border-border bg-card/60 p-3 font-mono text-[11px]"
            >
              <div className="flex items-center justify-between">
                <span className="text-bone/50">receipt #{receipts.length - i}</span>
                <span
                  className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${
                    r.mode === "live" ? "bg-cyan/20 text-cyan" : "bg-white/10 text-bone/60"
                  }`}
                >
                  {r.mode === "live" ? "On-chain" : "Sandbox"}
                </span>
              </div>
              {r.mode === "simulated" && r.reason && (
                <p className="mt-1 text-[10px] text-bone/45">
                  Sandbox — {humanizeSandboxReason(r.reason)}
                </p>
              )}
              <p className="mt-1 truncate text-bone/70" title={r.digest}>
                digest {r.digest}
              </p>
              {r.explorer_url ? (
                <a
                  href={r.explorer_url}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-0.5 block truncate text-cyan hover:underline"
                  title={r.tx_hash}
                >
                  tx {r.tx_hash} ↗
                </a>
              ) : (
                <p className="mt-0.5 truncate text-bone/50" title={r.tx_hash}>
                  tx {r.tx_hash}
                </p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
