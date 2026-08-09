import Link from "next/link";
import { SiteHeader } from "@/components/site-header";

// Placeholder — the full live auction view is built in Step 3.
export default function LotPage({ params }: { params: { id: string } }) {
  return (
    <>
      <SiteHeader />
      <div className="container flex min-h-[60vh] flex-col items-center justify-center text-center">
        <span className="mb-4 text-5xl">🔨</span>
        <h1 className="text-2xl font-semibold">Live auction view — coming in Step 3</h1>
        <p className="mt-2 max-w-md text-sm text-bone/50">
          Auction <code className="text-cyan">{params.id.slice(0, 8)}</code> will render here with a
          server-authoritative countdown, realtime bid feed, and the bid button.
        </p>
        <Link href="/" className="mt-6 rounded-lg border border-border px-4 py-2 text-sm text-bone/70 hover:text-bone">
          ← Back to live lots
        </Link>
      </div>
    </>
  );
}
