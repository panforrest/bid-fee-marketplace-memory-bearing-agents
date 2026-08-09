import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatUsd(cents: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(cents / 100);
}

// Auction bidding currency: 1 Servitor token = $1.00 = 100 credits.
// Input is the same "cents" figure used by formatUsd (100 cents -> 1 token).
export function formatTokens(cents: number): string {
  const tokens = cents / 100;
  const isWhole = Number.isInteger(tokens);
  const n = isWhole ? tokens.toString() : tokens.toFixed(2);
  return `${n} Servitor token${tokens === 1 ? "" : "s"}`;
}
