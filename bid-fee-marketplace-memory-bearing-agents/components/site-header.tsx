import Link from "next/link";

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-border bg-ink/80 backdrop-blur-lg">
      <div className="container flex h-16 items-center justify-between">
        <Link href="/" className="flex items-center gap-2.5">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-cyan/15 text-cyan">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 2a5 5 0 0 0-5 5v3a5 5 0 0 0-2 4 5 5 0 0 0 5 5h8a5 5 0 0 0 5-5 5 5 0 0 0-2-4V7a5 5 0 0 0-5-5z" />
              <circle cx="9" cy="10" r="1" fill="currentColor" />
              <circle cx="15" cy="10" r="1" fill="currentColor" />
            </svg>
          </span>
          <span className="text-lg font-semibold tracking-tight">
            Memoria
          </span>
        </Link>

        <nav className="flex items-center gap-1 text-sm">
          <Link href="/" className="rounded-lg px-3 py-2 text-bone/70 transition-colors hover:bg-white/5 hover:text-bone">
            Live Lots
          </Link>
          <Link href="/wallet" className="rounded-lg px-3 py-2 text-bone/70 transition-colors hover:bg-white/5 hover:text-bone">
            Wallet
          </Link>
          <a
            href="https://github.com/panforrest/bid-fee-marketplace-memory-bearing-agents"
            target="_blank"
            rel="noreferrer"
            className="ml-1 rounded-lg border border-border px-3 py-2 text-bone/70 transition-colors hover:border-cyan/40 hover:text-bone"
          >
            GitHub
          </a>
        </nav>
      </div>
    </header>
  );
}
