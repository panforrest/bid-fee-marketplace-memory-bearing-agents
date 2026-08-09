import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Memoria — The Marketplace for Memory-Bearing AI Agents",
  description:
    "Software copies for free. An AI agent with memory is one-of-one. The first live marketplace for memory-bearing agents — settled in stablecoins via Rain, audited on-chain via Monad.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body className="min-h-screen bg-ink text-bone antialiased">
        {children}
      </body>
    </html>
  );
}
