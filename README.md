# GRAMKETING — Web3 Performance Marketing on TON

## Overview

GRAMKETING is a performance-based Web3 marketing platform built on the TON blockchain. It connects:

- **Projects** that want to grow their community — by creating reward pools funded with their own tokens
- **Marketers** who want to earn rewards — by promoting projects on X (Twitter) and Telegram

Rewards are distributed **proportionally by points**. More views = more points = larger share of the prize pool. Everything runs on-chain: wallet authentication via TON Connect 2.0, access fees paid in TON or $mGRAM, and reward distribution via a Tact smart contract escrow.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Next.js 14 (App Router), Tailwind CSS, shadcn/ui primitives |
| Wallet | TON Connect 2.0 (`@tonconnect/ui-react`) |
| Blockchain | TON — smart contracts in Tact language |
| Backend | Next.js API routes (Node.js, TypeScript) |
| Database | PostgreSQL with Prisma ORM |
| Background Jobs | `node-cron` — scraping every 30 minutes |
| X API | Twitter API v2 (OAuth 2.0 + post view scraping) |
| Telegram API | Telegram Bot API for channel post scraping |
| Price Feed | CoinGecko API (TON/USD and mGRAM/USD live prices) |
| Auth | TON wallet signature-based auth (no passwords) |
| Language | TypeScript throughout |

---

## Getting Started

### Prerequisites

- Node.js 18+
- PostgreSQL database
- TON wallet (for testing — Tonkeeper recommended)

### Installation

```bash
# 1. Install dependencies
npm install

# 2. Copy and fill environment variables
cp .env.example .env
# Edit .env with your values (see Environment Variables section below)

# 3. Generate Prisma client
npx prisma generate

# 4. Push schema to database
npx prisma db push

# 5. Start development server
npm run dev
```

The app will be available at `http://localhost:3000`.

---

## Environment Variables

| Variable | Description | Required |
|---|---|---|
| `DATABASE_URL` | PostgreSQL connection string | Yes |
| `TWITTER_BEARER_TOKEN` | Twitter API v2 Bearer Token for post scraping | Yes |
| `TWITTER_CLIENT_ID` | Twitter OAuth 2.0 Client ID | For OAuth flow |
| `TWITTER_CLIENT_SECRET` | Twitter OAuth 2.0 Client Secret | For OAuth flow |
| `TELEGRAM_BOT_TOKEN` | Telegram Bot Token from @BotFather | Yes |
| `TON_ENDPOINT` | TON Center API endpoint | Yes |
| `ADMIN_WALLET_ADDRESS` | Platform admin TON wallet address | Yes |
| `TREASURY_WALLET_ADDRESS` | Platform treasury wallet (receives access fees) | Yes |
| `NEXT_PUBLIC_TONCONNECT_MANIFEST_URL` | Full URL to tonconnect-manifest.json | Yes |
| `JWT_SECRET` | Minimum 32-char secret for JWT signing | Yes |
| `COINGECKO_API_KEY` | CoinGecko API key (optional for higher rate limits) | Optional |
| `MGRAM_JETTON_MASTER_ADDRESS` | $mGRAM jetton master address (when token launches) | Future |
| `MGRAM_MINIMUM_HOLDING` | Minimum $mGRAM required for pool creation | Future |

---

## Running the Scraper

The scraper updates view counts and points for all active pools:

```bash
# Run once immediately
npx ts-node jobs/scraper.ts

# Or run in background (also schedules recurring job automatically)
npm run scraper
```

The scraper:
- Runs every **30 minutes** via `node-cron`
- Fetches X post impression counts via Twitter API v2
- Fetches Telegram post view counts via Bot API
- Checks token holdings via TON RPC
- Recalculates holder boosts and referral multipliers
- Saves leaderboard snapshots after each cycle
- Auto-marks expired pools as ENDED

In production, run this as a persistent process:
```bash
# With pm2
pm2 start "npx ts-node jobs/scraper.ts" --name gramketing-scraper

# Or with systemd, Docker, etc.
```

---

## Smart Contract Deployment (TON Testnet)

### Prerequisites

```bash
# Install Tact compiler
npm install -g @tact-lang/compiler

# Or use Blueprint (recommended)
npm create ton@latest
```

### Steps

1. **Compile the contract:**
   ```bash
   tact contracts/gramketing_pool.tact
   ```

2. **Deploy to testnet:**
   Using [Blueprint](https://github.com/ton-org/blueprint) or [TON CLI](https://github.com/ton-community/ton-cli):
   ```bash
   # With Blueprint
   npx blueprint deploy
   ```

3. **Copy the deployed contract address** to your dashboard when creating pools.

### Contract Functions

| Message | Description |
|---|---|
| `CreatePool` | Initialize pool parameters (duration, reward, slots) |
| `JettonTransferNotification` | Called by jetton wallet when tokens are deposited |
| `DistributeRewards` | Admin-only: distribute tokens to winners (basis points map) |
| `"endPool"` | Admin-only: mark pool as ended before duration |
| `"cancelPool"` | Admin-only: cancel pool and refund deposited tokens to owner |
| `poolInfo` (getter) | Returns full pool state |

---

## Pool Access Fees

Fees are dollar-pegged and calculated at live CoinGecko prices at payment time.

| Duration | Pay with $mGRAM | Pay with TON |
|---|---|---|
| 1 Week (7 days) | $100 | $125 |
| 2 Weeks (14 days) | $199 | $249 |
| 3 Weeks (21 days) | $299 | $374 |
| 4 Weeks (28 days) | $399 | $499 |

All fees are routed to `TREASURY_WALLET_ADDRESS`.

---

## Points System

### X (Twitter) Points
```
base = floor(views / 10)   [minimum 100 views to qualify]
xPoints = base × holderBoost
```

### Telegram Points
```
base = views × 2
telegramPoints = base × holderBoost
```

### Holder Boost
- Holding **any** amount of the pool's project token = **1.5x multiplier**
- Checked on every scrape cycle via TON RPC

### Referral Multiplier

| Referred friend's holding | Multiplier you earn |
|---|---|
| ≥ 1,000 tokens | 1.2x |
| ≥ 10,000 tokens | 1.5x |
| ≥ 100,000 tokens | 2.0x |

Multiple referrals stack additively. +500 bonus points per successful referral.

### Total Points Formula
```
total = (xPoints + telegramPoints) × holderBoost × referralMultiplier + referralBonusPoints
```

---

## Reward Distribution

Rewards are distributed proportionally:

```
winner_share = (winner_points / total_points) × total_reward
```

Example with 1,000,000 token pool, 3 reward slots:
- Alice: 5,000 pts → 50% → 500,000 tokens
- Bob: 3,000 pts → 30% → 300,000 tokens
- Carol: 2,000 pts → 20% → 200,000 tokens

Rounding dust is returned to the project owner.

---

## Architecture

```
Browser (TON Connect Wallet)
        │
        ▼
Next.js 14 Frontend (App Router)
  ├── /pools — Browse pools
  ├── /pools/[id] — Pool detail (leaderboard, submit, stats)
  ├── /create-pool — Multi-step pool creation
  ├── /dashboard — Marketer dashboard
  ├── /admin — Admin panel
  ├── /docs — Documentation
  └── /roadmap — Roadmap
        │
        ▼
Next.js API Routes (/app/api/)
  ├── /auth/verify — TON wallet signature auth → JWT cookie
  ├── /pools — CRUD for pools
  ├── /submissions — Submit/view posts
  ├── /referral — Referral tracking
  ├── /prices — Live CoinGecko prices
  └── /admin/* — Admin actions
        │
        ▼
PostgreSQL (via Prisma ORM)
  ├── Users, Projects, Pools
  ├── PoolParticipants, Submissions
  ├── ReferralBoosts, LeaderboardSnapshots
  └── PlatformRevenue
        ▲
        │ (reads/writes every 30 min)
node-cron Scraper (jobs/scraper.ts)
  ├── Twitter API v2 — X post views
  ├── Telegram Bot API — Telegram post views
  └── TON RPC — Token balance checks
        │
        ▼
TON Blockchain
  └── GramketingPool.tact — Escrow contract
        ├── Holds project tokens until pool ends
        ├── Distributes to winners (admin-triggered)
        └── Refunds on cancellation
```

---

## License

MIT — see LICENSE for details.

---

## Community

- Telegram: [https://t.me/Gramketing](https://t.me/Gramketing)
- X: [https://x.com/Gramketing](https://x.com/Gramketing)
