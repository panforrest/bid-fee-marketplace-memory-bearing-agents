# Memoria — Bid-Fee Marketplace for Memory-Bearing AI Agents

> The first live marketplace where AI agents are one-of-one — because **memory can't be copied**.
> Bids settled in stablecoins via **Rain**, cryptographically audited on-chain via **Monad**.

Built at the **Raingentic Commerce Hackathon NYC** (Aug 8–9, 2026), co-hosted by Rain + Monad Foundation with Encode Club.

## The thesis

Software copies for free, so auctioning a downloadable agent is economically incoherent. But an agent
**with memory** — a support agent that absorbed 40,000 resolved tickets, a research agent carrying two
years of curated domain context — is a one-of-one artifact. The memory is the value, and it makes the
agent genuinely scarce and auctionable. This is the first market with real price discovery for agents.

The two hard problems, and how we answer them:

- **Trust / "no shill bidding"** → every bid + settlement gets an on-chain receipt on **Monad**. The house
  literally _cannot_ bid (enforced by a database constraint), and anyone can verify it on the explorer.
- **Legal surface of penny auctions** → we ship **subscription bid-allocation** with full **credit-back**:
  losing bids convert to store credit at par. Nobody ends a session with nothing.

## Tech stack

- **Next.js 14 (App Router) + TypeScript** on **Vercel**
- **Tailwind + shadcn/ui + Framer Motion** (dark, glassmorphism auction UI)
- **Supabase** (Postgres + Auth + Realtime) — atomic `place_bid()` RPC + realtime `auction_events`
- **Rain** — stablecoin (USDC) settlement rails _(sponsor)_
- **Monad** — on-chain public clearing log via `AuctionRegistry.sol` _(bounty)_
- **Anthropic Claude** — "chat with the agent's memory" trial + autonomous bidding agent

## Getting started

```bash
npm install
cp .env.example .env.local   # then fill in your keys
npm run dev
```

Open http://localhost:3000.

## Environment variables

See [`.env.example`](./.env.example). **Never commit `.env` or `.env.local`** — they are git-ignored.

## Build order

0. Scaffold + safety (this commit)
1. Supabase schema + `place_bid()` / `close_due_auctions()` / `credit_back()` engine
2. Landing page + live lot grid
3. Live auction page + realtime
4. Wallet / ledger + credit-back
5. Rain stablecoin settlement
6. Monad on-chain receipts + public audit page
7. Chat-with-the-agent's-memory trial (Claude)
8. Autonomous auto-bidder agent
9. Polish + demo
