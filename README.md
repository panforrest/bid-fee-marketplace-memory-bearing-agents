RELIQUARY — Hackathon Build Plan (Monad + Rain)

Feedback on the design docs

What's strong: the memory-as-scarcity thesis, agents-bidding-on-agents as the demo, the credit-back keystone, and the "Monad because a 20-second clock needs 0.3s blocks" argument. That last line is the one judges will remember. The grounded voice pitches (Addendum B) are the emotional payload — keep them.

Problems worth fixing before you build:





x402 per-bid round trip vs a 20-second clock. A bid that needs a 402 challenge, a signature, facilitator verify, settle, then a contract write will not reliably land inside a 20s window under contention — and a slow bid in front of judges reads as a broken product. Recommendation: buyers pre-fund a bid deposit in the auction contract once (that deposit can be topped up over x402), and each bid is then a single contract call. You keep the x402 story for the funding moment and get a sub-second bid.



onlyFacilitator on bid() destroys the trust claim. The whole "you don't have to trust the operator" argument dies if a single privileged address writes every bid. With pre-funded deposits, bid() becomes permissionless — the bidder calls it directly and block ordering does the sequencing. Strictly better and less code.



claimRebate() pays from an empty pot. Bid fees route to a treasury address off-contract (correct, for the legal reason stated), but then the contract holds no funds for rebates. Rebate credit must be either an explicit funded rebate pool in the contract, or platform credit tracked off-chain. Pick one and say which on the slide.



Other contract nits: _issueCredit is undeclared; reserve-not-met should refund the leader rather than silently emit a zero settle; add a depositOf view so the UI can show remaining bid budget.



Scope: cut Supabase entirely for the hackathon. Nothing in the 3-minute demo needs Postgres, RLS, KYB, or subscriptions. Lot metadata and manifests can be static seed data in the repo, hashed on-chain. This removes a day of work and a whole class of demo failure.



Rain is the differentiator — show it, don't mention it. "The agent arrives with a wallet" only lands if the judge sees a card, its scope, and a settled transaction on screen. Budget UI time for the card-issuance moment specifically.



Rehearsal risk. Two agents racing over public testnet RPC on venue wifi is the most likely failure mode. Build a demo-mode switch from day one, not day two.



What I'll build

A demoable single-app RELIQUARY: live auction UI, real Monad testnet contract, real Rain sandbox card issuance, and an autonomous bidder agent.

1. Contract — ReliquaryAuction (Monad testnet, chain 10143)

Revised per feedback: USDC bid deposits, permissionless bid(), permissionless settle(), funded rebate pool, house/seller blocklist set at deploy then renounced, Bid/Extended/Settled events. Compiled and deployed from the sandbox with three seeded lots (MERIDIAN, KESTREL, NIGHTJAR).

2. App surfaces





/ — lot grid, live countdowns driven by chain block.timestamp



/lot/:id — the live auction: price, clock, bid feed, Bid button, manifest + honest-limits panel



/audit/:id — Bid events read from chain, each linked to the Monad explorer



/settled/:id — winner, escrow release, Rain scoped card panel (card, scope, budget, live transactions)

3. Monad integration

viem client against Monad testnet RPC, event polling for the live feed, a burner/embedded wallet funded from faucet for the demo bidder, explorer deep links everywhere.

4. Rain integration (sandbox)

Server-side only, keys never in the browser: fund collateral → issue scoped card for the winning agent → simulate authorize → settle → list transactions. Surfaced as a "commissioning" step in the settled view, labelled sandbox on screen.

5. Autonomous bidder agent

A server-driven procurement agent with a stated mandate that reads each lot's manifest, scores it against the mandate, and bids on-chain when the lot fits and the price is under its ceiling. Start/stop from the UI so it can be triggered live on stage.

6. Demo mode

One switch that runs the whole flow against simulated chain state with identical UI. If wifi or the faucet fails, the demo still runs. Also covers pre-recorded voice fallback if we add Addendum B.



Technical notes





TanStack Start app; contract writes and Rain calls go through server functions/routes so no secret reaches the client.



Solidity compiled with solc in the sandbox, deployed via viem; ABI + address committed as generated artifacts.



Chain reads use a public Monad testnet RPC with polling (not websockets) for venue-network resilience.



Bid deposits and settlement in Monad testnet USDC (0x534b2f3A21130d7a60830c2Df862319e593943A3).



Lot metadata, manifests, benchmarks and honest-limits copy live as typed seed data in the repo; the manifest hash is anchored on-chain per lot.

What I need from you





A funded Monad testnet private key for deploy + the demo agent wallet (stored as a secret), or I build against demo mode and you deploy later.



Rain sandbox API key plus user/contract IDs.



Confirm whether the ElevenLabs voice pitches (Addendum B) are in this build or a follow-up.

Explicitly out of scope

KYB, Supabase/Postgres, subscriptions, Stripe, memory export validation, dispute resolution, ERC-8004 registry (the on-chain manifest hash stands in for it).
