"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

// Live countdown chip. For the grid we use the client clock (good enough for
// "feel"); the /lot page uses a server-clock offset for the authoritative timer.
// `remaining === null` until mounted, so server + first client render match
// (avoids hydration mismatch on time-based content).
export function Countdown({
  endsAt,
  className,
  serverOffsetMs = 0,
  serverNow,
  onExpire,
}: {
  endsAt: string;
  className?: string;
  serverOffsetMs?: number;
  // ISO timestamp captured on the server at render; used to correct for a
  // skewed client clock (so the grid matches the authoritative /lot timer).
  serverNow?: string;
  onExpire?: () => void;
}) {
  const [remaining, setRemaining] = useState<number | null>(null);

  useEffect(() => {
    const end = new Date(endsAt).getTime();
    // Prefer a server timestamp if provided; otherwise fall back to an explicit
    // offset, then to the raw client clock.
    const offset = serverNow
      ? new Date(serverNow).getTime() - Date.now()
      : serverOffsetMs;
    const tick = () => {
      const rem = Math.max(0, end - (Date.now() + offset));
      setRemaining(rem);
      if (rem <= 0 && onExpire) onExpire();
    };
    tick();
    const id = setInterval(tick, 250);
    return () => clearInterval(id);
  }, [endsAt, serverOffsetMs, serverNow, onExpire]);

  const mounted = remaining !== null;
  const totalSec = Math.floor((remaining ?? 0) / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  const urgent = mounted && totalSec <= 30 && totalSec > 0;
  const closed = mounted && totalSec <= 0;

  const label = !mounted
    ? "··:··"
    : closed
    ? "CLOSED"
    : h > 0
    ? `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`
    : `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;

  return (
    <span
      suppressHydrationWarning
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 font-mono text-xs tabular-nums",
        closed
          ? "bg-white/5 text-bone/40"
          : urgent
          ? "animate-pulse-glow bg-gold/15 text-gold"
          : "bg-cyan/10 text-cyan",
        className
      )}
    >
      <span
        className={cn(
          "h-1.5 w-1.5 rounded-full",
          closed ? "bg-bone/30" : urgent ? "bg-gold" : "bg-cyan"
        )}
      />
      {label}
    </span>
  );
}
