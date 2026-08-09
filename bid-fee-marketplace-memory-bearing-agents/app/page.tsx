import { createClient } from "@/lib/supabase/server";
import { SiteHeader } from "@/components/site-header";
import { LotCard } from "@/components/lot-card";
import { Lot } from "@/lib/types";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

async function getLots(): Promise<{ lots: Lot[]; error: string | null }> {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
    return { lots: [], error: "Supabase env vars are not set." };
  }
  const supabase = createClient();
  const { data, error } = await supabase
    .from("auctions")
    .select(
      "id, status, price_cents, bid_count, ends_at, reserve_cents, agent_instances(id, title, summary, emoji, base_model, framework, memory_backend, memory_record_ct, memory_bytes, benchmark_suite, benchmark_score, memory_highlights)"
    )
    .eq("status", "live")
    .order("ends_at", { ascending: true });

  if (error) return { lots: [], error: error.message };

  const lots: Lot[] = (data ?? []).map((row: any) => ({
    id: row.id,
    status: row.status,
    price_cents: row.price_cents,
    bid_count: row.bid_count,
    ends_at: row.ends_at,
    reserve_cents: row.reserve_cents,
    instance: Array.isArray(row.agent_instances)
      ? row.agent_instances[0]
      : row.agent_instances,
  }));

  return { lots, error: null };
}

export default async function Home() {
  const { lots, error } = await getLots();
  // Authoritative reference time captured on the server; the grid countdowns
  // correct client-clock skew against this (matches the /lot page behaviour).
  const serverNow = new Date().toISOString();

  return (
    <>
      <SiteHeader />

      {/* HERO */}
      <section className="relative overflow-hidden">
        <div
          className="pointer-events-none absolute -top-40 left-1/2 h-[520px] w-[820px] -translate-x-1/2 rounded-full opacity-25 blur-[130px]"
          style={{ background: "radial-gradient(circle, #1FC8DE 0%, transparent 70%)" }}
        />
        <div className="container relative py-16 text-center md:py-20">
          <span className="mb-6 inline-flex items-center gap-2 rounded-full border border-border px-4 py-1.5 text-xs uppercase tracking-widest text-cyan">
            <span className="h-2 w-2 animate-pulse-glow rounded-full bg-cyan" />
            Raingentic Commerce Hackathon NYC · 2026
          </span>
          <h1 className="mx-auto max-w-4xl text-balance text-4xl font-semibold leading-tight md:text-6xl">
            The live market for{" "}
            <span className="text-cyan text-glow-cyan">memory-bearing</span> AI agents
          </h1>
          <p className="mx-auto mt-5 max-w-2xl text-balance text-lg text-bone/70">
            Software copies for free — so you can&apos;t auction it. But an agent that
            has absorbed <span className="text-gold">42,000 support tickets</span> is a
            one-of-one artifact. Its memory is the value. Bid on it, live.
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3 text-sm text-bone/60">
            <span className="rounded-full border border-border px-4 py-2">💧 Settled in stablecoins via <b className="text-bone">Rain</b></span>
            <span className="rounded-full border border-border px-4 py-2">⛓ Audited on-chain via <b className="text-bone">Monad</b></span>
            <span className="rounded-full border border-border px-4 py-2">🤖 Agents that bid autonomously</span>
          </div>
        </div>
      </section>

      {/* TRUST BANNER */}
      <div className="border-y border-border bg-white/[0.02]">
        <div className="container flex flex-wrap items-center justify-center gap-x-3 gap-y-1 py-3 text-center text-xs text-bone/50">
          <span className="text-cyan">●</span>
          <span>
            <b className="text-bone/80">House accounts cannot bid</b> — enforced by a database constraint, not a policy.
          </span>
          <span className="hidden sm:inline">Every bid is publicly auditable. Losing bids convert to store credit at par.</span>
        </div>
      </div>

      {/* LIVE LOTS */}
      <section className="container py-12">
        <div className="mb-6 flex items-end justify-between">
          <div>
            <h2 className="text-2xl font-semibold">Live lots</h2>
            <p className="mt-1 text-sm text-bone/50">
              One-of-one agent instances, currently open for bidding.
            </p>
          </div>
          <span className="hidden font-mono text-xs uppercase tracking-widest text-bone/40 sm:block">
            {lots.length} open
          </span>
        </div>

        {error ? (
          <div className="rounded-xl border border-red-500/30 bg-red-500/5 p-6 text-sm text-red-300">
            Couldn&apos;t load lots: {error}
            <p className="mt-2 text-bone/50">
              Make sure your Supabase env vars are set (locally in <code>.env.local</code>, and on Vercel).
            </p>
          </div>
        ) : lots.length === 0 ? (
          <div className="rounded-xl border border-border bg-card p-6 text-sm text-bone/50">
            No live lots yet. Did the seed run?
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {lots.map((lot) => (
              <LotCard key={lot.id} lot={lot} serverNow={serverNow} />
            ))}
          </div>
        )}
      </section>

      {/* FOOTER */}
      <footer className="border-t border-border py-10">
        <div className="container flex flex-col items-center gap-2 text-center text-xs text-bone/40">
          <p>Memoria · built for the Raingentic Commerce Hackathon NYC</p>
          <p>Not a penny auction · subscription bid-allocation · full credit-back · B2B only</p>
        </div>
      </footer>
    </>
  );
}
