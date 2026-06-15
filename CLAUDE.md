# Claude Code Rules — gramketing-platform

## Smart Contract Rules (TON/Tact, Solidity, or any chain)

NEVER deploy any smart contract without first:

1. Printing the complete list of all functions in the contract
2. Confirming ALL of the following are present:
   - Core business logic functions
   - Admin/owner access control on all sensitive functions
   - Emergency rescue or withdrawal function (admin can recover stuck funds/tokens)
   - Any chain-specific requirements (e.g. jetton wallet address setter for TON)
3. Checking all hardcoded addresses are real verified addresses (not placeholders or test values)
4. Checking the deployer wallet has sufficient gas/TON/ETH for deployment + operations
5. Running a full audit summary — list any missing functions, risks, or unknowns
6. Waiting for the user to explicitly type "yes deploy" before proceeding

This rule applies to ALL deployments: new contracts, redeployments, upgrades, and test deployments on any network including mainnet, testnet, and local.

If any checklist item is unclear or missing, STOP and ask before proceeding.

================= SECURITY FIX TRACKER (do not delete) =================

Ground rules:
- Fix ONE item at a time, in the order below (dependency-safe).
- Do NOT start an item until the previous one is [x] VERIFIED.
- When you finish an item: set it to [~] IN PROGRESS, fill Changed + Verified, then STOP.
  Present to the user (a) the diff / files changed, (b) what you did, (c) the verification
  evidence (test output, curl result, reproduction). Then WAIT.
- Do NOT mark an item [x] VERIFIED and do NOT start the next item until the user explicitly
  reviews and approves it. The user validates; you never self-approve.
- "Verified" means tested/reproduced, not "looks fixed".
- Never bundle fixes or touch items below the current one.

Status legend: [ ] TODO  ·  [~] IN PROGRESS (awaiting user validation)  ·  [x] VERIFIED (user-approved)

1. [x] Real TonProof signature verification — CRITICAL
   Files: lib/tonConnect.ts, app/api/auth/verify/route.ts, client connect flow, payload nonce
   Problem: verifyTonWalletSignature is a stub returning true for any non-empty input — total auth bypass.
   Fix: real ton_proof Ed25519 verification (domain + timestamp + single-use payload nonce + key/address binding); client sends a genuine ton_proof.
   Changed: lib/tonConnect.ts (rewritten), app/api/auth/verify/route.ts (new proof body), app/api/auth/challenge/route.ts (new), prisma/schema.prisma (TonProofChallenge model), components/Providers.tsx (real ton_proof flow), lib/__tests__/tonConnect.test.ts (9 unit tests)
   Hotfix (2026-06-15) RESOLVED: canonical host aligned to www.gramketing.com — manifest url+iconUrl, manifestUrl in Providers.tsx, TON_PROOF_DOMAIN all set to www.gramketing.com. Apex 308-redirects to www. Deployed commit 692c019.
   Verified: 9/9 unit tests pass; tsc --noEmit clean; old bypass body returns 400 (missing fields); DB migration applied; real-wallet login on prod (www.gramketing.com) works, no phishing, ton_proof verified end-to-end
   Date: 2026-06-15

2. [ ] Telegram identity chain: Mini App auth + webhook — CRITICAL
   Files: app/api/auth/telegram-miniapp/route.ts, app/api/telegram-bot/webhook/route.ts, app/api/telegram-bot/setup/route.ts, LINK-code gen
   Problem: Mini App mints JWT from raw telegramUserId (no initData validation); webhook unauthenticated (no secret_token) → forged updates write telegramChatId, leak /status, relay bot messages; LINK codes use Math.random().
   Fix: validate initData HMAC; register webhook with secret_token + validate header; crypto-secure LINK codes.
   Changed: __  Verified: __  Date: __

3. [ ] Distribution basis-point rounding — CRITICAL
   Files: lib/distribution.ts
   Problem: independent Math.round → bps don't sum to 10000 → contract over/under-sends (SendIgnoreErrors): partial/failed distribution, pool locks. Contract is immutable; fix off-chain.
   Fix: largest-remainder method so bps sum to exactly 10000; add test.
   Changed: __  Verified: __  Date: __

4. [ ] Tweet-ownership spoofing + dedup — CRITICAL
   Files: app/api/submissions/route.ts, lib/twitter-api.ts, PoolPost schema
   Problem: no author check (author_id never fetched) → claim anyone's tweet; dedup is per-participant only.
   Fix: fetch author_id, reject if author != user's linked xAccountId; global per-pool uniqueness on postLink.
   Changed: __  Verified: __  Date: __

5. [ ] Referral sybil farming — CRITICAL
   Files: app/api/referral/track/route.ts, lib/pool-scraper.ts, lib/points.ts
   Problem: only exact-wallet self-referral blocked; no caps; 1-token-unit qualifies for +500; multiplier relative to pool max → sybil wallets dominate payout.
   Fix (has product decisions): cap referrals + bonus points; meaningful holding threshold / require real participation; rate-limit; revisit multiplier formula.
   Changed: __  Verified: __  Date: __

6. [ ] Deposit & access-fee integrity — HIGH
   Files: app/api/pools/route.ts, app/api/fee-tx/route.ts, app/api/pools/[id]/join/route.ts, app/api/pools/[id]/deposit-status/route.ts
   Problem: accessFeeTxHash only checked non-empty (free pool creation); pools go ACTIVE with client-supplied totalReward and no confirmed deposit; deposit-status unauthenticated + reports deposited:true on any balance>0.
   Fix: verify fee tx on-chain before create; gate ACTIVE/join on confirmed deposit >= totalReward; authenticate/scope deposit-status and compare vs totalReward.
   Changed: __  Verified: __  Date: __

7. [ ] Production scraper / scheduling — CRITICAL
   Files: jobs/scraper.ts, lib/pool-scraper.ts, app/api/admin/rescrape/route.ts, infra
   Problem: no prod scheduler (jobs/scraper.ts never runs on Vercel) → metrics/points frozen at submission, payouts on stale data, pools never auto-end; synchronous rescrape times out → partial DB writes.
   Fix: run scraper as a Railway worker/cron on the 30-min cycle vs the same Neon DB; admin rescrape hands off to worker; wrap/chunk writes so a timeout can't leave partial state.
   Changed: __  Verified: __  Date: __

8. [ ] Hardening (after criticals) — LOW
   - Add explicit OAuth state nonce to link-x / twitter/callback.
   - Remove hardcoded JWT fallback in lib/auth.ts; throw if JWT_SECRET unset.
   - Set TON_FALLBACK_ENDPOINT in Vercel.
   - Remove dead env vars (TWITTER_CLIENT_ID/SECRET; NEXT_PUBLIC_TREASURY_ADDRESS if unused); decide on MGRAM_MINIMUM_HOLDING (set but unimplemented).
   Changed: __  Verified: __  Date: __

Cleared (no action): config tier (all required env vars present/scoped); contract access control (admin-only, unspoofable sender(), immutable owner/admin); secrets hygiene, gas values, W5R1 derivation.
Operational (not code): single immutable admin key, no rotation — treat ADMIN_MNEMONIC as hardware-wallet/secrets-manager grade; AdminRescue + SetJettonWallet widen blast radius if it leaks.

Change log:
- 2026-06-15 — Fix #1 — real TonProof Ed25519 verification + single-use nonce; domain hotfix to www.gramketing.com; prod login verified

================= END SECURITY FIX TRACKER =================
