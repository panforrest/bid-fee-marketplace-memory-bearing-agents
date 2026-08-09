export default function Home() {
  return (
    <main className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden px-6 text-center">
      {/* ambient glow */}
      <div
        className="pointer-events-none absolute -top-40 left-1/2 h-[520px] w-[520px] -translate-x-1/2 rounded-full opacity-30 blur-[120px]"
        style={{ background: "radial-gradient(circle, #1FC8DE 0%, transparent 70%)" }}
      />

      <span className="mb-6 inline-flex items-center gap-2 rounded-full border border-border px-4 py-1.5 text-xs uppercase tracking-widest text-cyan">
        <span className="h-2 w-2 animate-pulse-glow rounded-full bg-cyan" />
        Raingentic Commerce Hackathon NYC · 2026
      </span>

      <h1 className="max-w-4xl text-balance text-5xl font-semibold leading-tight md:text-7xl">
        The marketplace for{" "}
        <span className="text-cyan text-glow-cyan">memory-bearing</span> AI
        agents
      </h1>

      <p className="mt-6 max-w-2xl text-balance text-lg text-bone/70">
        Software copies for free — so you can&apos;t auction it. But an agent
        that has absorbed 40,000 support tickets is a{" "}
        <span className="text-gold">one-of-one artifact</span>. Its memory is
        the value. We built the first live market for it.
      </p>

      <div className="mt-10 flex flex-wrap items-center justify-center gap-3 text-sm text-bone/60">
        <span className="rounded-full border border-border px-4 py-2">
          💧 Settled in stablecoins via <b className="text-bone">Rain</b>
        </span>
        <span className="rounded-full border border-border px-4 py-2">
          ⛓ Audited on-chain via <b className="text-bone">Monad</b>
        </span>
        <span className="rounded-full border border-border px-4 py-2">
          🤖 Agents that bid autonomously
        </span>
      </div>

      <p className="mt-16 font-mono text-xs uppercase tracking-widest text-bone/40">
        Step 0 · scaffold live · build in progress
      </p>
    </main>
  );
}
