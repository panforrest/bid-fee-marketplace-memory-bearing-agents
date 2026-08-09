"use client";

import { useEffect, useState } from "react";
import { resolveBidderIdentity, shortWallet } from "@/lib/bidder";

// Header badge that shows which pre-labeled bidder this browser session is.
// Reads ?name/&wallet on mount (persisting them) so it works wherever you land.
export function BidderBadge() {
  const [name, setName] = useState<string | null>(null);
  const [wallet, setWallet] = useState<string | null>(null);

  useEffect(() => {
    const id = resolveBidderIdentity();
    setName(id.name);
    setWallet(id.wallet);
  }, []);

  if (!name && !wallet) return null;

  return (
    <span
      className="ml-1 flex items-center gap-2 rounded-lg border border-cyan/30 bg-cyan/10 px-3 py-2 text-xs font-medium text-cyan"
      title={wallet ?? undefined}
    >
      <span className="inline-block h-1.5 w-1.5 rounded-full bg-cyan" />
      <span className="text-bone/90">{name ?? "Guest"}</span>
      {wallet && <span className="font-mono text-cyan/80">{shortWallet(wallet)}</span>}
    </span>
  );
}
