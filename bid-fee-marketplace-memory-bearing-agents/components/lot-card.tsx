import Link from "next/link";
import { Lot, formatCount } from "@/lib/types";
import { formatUsd } from "@/lib/utils";
import { Countdown } from "@/components/countdown";

export function LotCard({ lot, serverNow }: { lot: Lot; serverNow?: string }) {
  const inst = lot.instance;
  return (
    <Link
      href={`/lot/${lot.id}`}
      className="group relative flex flex-col overflow-hidden rounded-2xl border border-border bg-card p-5 transition-all hover:border-cyan/40 hover:bg-white/[0.05]"
    >
      {/* header row */}
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-white/5 text-2xl">
            {inst.emoji}
          </span>
          <div>
            <h3 className="font-semibold leading-tight text-bone">{inst.title}</h3>
            <p className="mt-0.5 font-mono text-[11px] uppercase tracking-wide text-bone/40">
              {inst.base_model} · {inst.framework}
            </p>
          </div>
        </div>
        <Countdown endsAt={lot.ends_at} serverNow={serverNow} />
      </div>

      {/* summary */}
      <p className="mb-4 line-clamp-2 text-sm text-bone/60">{inst.summary}</p>

      {/* memory + benchmark stats */}
      <div className="mb-4 flex flex-wrap gap-2 text-[11px]">
        <span className="rounded-md bg-white/5 px-2 py-1 text-bone/70">
          🧠 {formatCount(inst.memory_record_ct)} memories
        </span>
        {inst.benchmark_score != null && (
          <span className="rounded-md bg-cyan/10 px-2 py-1 text-cyan">
            {inst.benchmark_suite} {inst.benchmark_score}
          </span>
        )}
        <span className="rounded-md bg-gold/10 px-2 py-1 text-gold">one-of-one</span>
      </div>

      {/* price footer */}
      <div className="mt-auto flex items-end justify-between border-t border-border pt-4">
        <div>
          <p className="font-mono text-[11px] uppercase tracking-wider text-bone/40">
            Current price
          </p>
          <p className="text-2xl font-semibold tabular-nums text-bone">
            {formatUsd(lot.price_cents)}
          </p>
          {lot.reserve_cents != null && (
            <p className={`mt-0.5 text-[11px] ${lot.price_cents >= lot.reserve_cents ? "text-cyan" : "text-gold"}`}>
              Reserve {formatUsd(lot.reserve_cents)} · {lot.price_cents >= lot.reserve_cents ? "met ✓" : "not met"}
            </p>
          )}
        </div>
        <div className="text-right">
          <p className="font-mono text-[11px] uppercase tracking-wider text-bone/40">
            Bids
          </p>
          <p className="text-lg font-semibold tabular-nums text-bone/80">
            {lot.bid_count}
          </p>
        </div>
      </div>

      <span className="pointer-events-none absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-cyan/50 to-transparent opacity-0 transition-opacity group-hover:opacity-100" />
    </Link>
  );
}
