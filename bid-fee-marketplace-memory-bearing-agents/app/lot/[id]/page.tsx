import { createClient } from "@/lib/supabase/server";
import { SiteHeader } from "@/components/site-header";
import { LiveAuction } from "@/components/live-auction";
import { AuctionState } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function LotPage({ params }: { params: { id: string } }) {
  const supabase = createClient();
  const { data } = await supabase.rpc("get_auction_state", {
    p_auction_id: params.id,
  });
  const initialState = (data as AuctionState | null) ?? null;

  return (
    <>
      <SiteHeader />
      {initialState ? (
        <LiveAuction auctionId={params.id} initialState={initialState} />
      ) : (
        <div className="container flex min-h-[50vh] flex-col items-center justify-center text-center">
          <span className="mb-3 text-4xl">🕵️</span>
          <h1 className="text-xl font-semibold">Auction not found</h1>
          <p className="mt-2 text-sm text-bone/50">This lot may have been withdrawn.</p>
        </div>
      )}
    </>
  );
}
