// Bid-allowance packs. Priced at par with the credit-back face value
// (bid_face_cents = 60 => $0.60/bid), so "buy at par, lose at par" holds.
export interface BidPack {
  id: string;
  bids: number;
  amountCents: number;
  label: string;
}

export const BID_PACKS: BidPack[] = [
  { id: "starter", bids: 50, amountCents: 3000, label: "Starter" },
  { id: "pro", bids: 150, amountCents: 9000, label: "Pro" },
  { id: "scale", bids: 400, amountCents: 24000, label: "Scale" },
];

export function findPack(id: string): BidPack | undefined {
  return BID_PACKS.find((p) => p.id === id);
}
