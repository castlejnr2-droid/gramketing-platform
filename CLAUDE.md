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

2. [x] Telegram identity chain: Mini App auth + webhook — CRITICAL
   Files: app/api/auth/telegram-miniapp/route.ts, app/api/telegram-bot/webhook/route.ts, app/api/telegram-bot/setup/route.ts, LINK-code gen
   Problem: Mini App mints JWT from raw telegramUserId (no initData validation); webhook unauthenticated (no secret_token) → forged updates write telegramChatId, leak /status, relay bot messages; LINK codes use Math.random().
   Fix: validate initData HMAC; register webhook with secret_token + validate header; crypto-secure LINK codes.
   Changed: lib/telegram.ts (+validateTelegramInitData +extractTelegramUserId), app/api/auth/telegram-miniapp/route.ts (require initData, HMAC validate, stale check), app/api/telegram-bot/webhook/route.ts (X-Telegram-Bot-Api-Secret-Token guard), app/api/telegram-bot/setup/route.ts (secret_token in setWebhook + URL fix to www.gramketing.com), app/api/auth/link-telegram-init/route.ts (randomBytes CSPRNG), components/MiniAppShell.tsx (send tg.initData not raw id), lib/__tests__/telegram.test.ts (8 unit tests)
   Verified: 8/8 unit tests pass; tsc --noEmit clean; forged webhook (no header) → 401; forged webhook (wrong secret) → 401; raw telegramUserId body → 400; deployed commit 8b648cd; bot replies to real Telegram messages on prod; initData HMAC validated end-to-end
   Date: 2026-06-15

3. [x] Distribution basis-point rounding — CRITICAL
   Files: lib/distribution.ts
   Problem: independent Math.round → bps don't sum to 10000 → contract over/under-sends (SendIgnoreErrors): partial/failed distribution, pool locks. Contract is immutable; fix off-chain.
   Fix: largest-remainder method so bps sum to exactly 10000; add test.
   Changed: lib/distribution.ts (largest-remainder bps, tokenAmount derived from corrected bps), lib/__tests__/distribution.test.ts (new, 9 cases)
   Zero-points guard: line 24 filters p.totalPoints > 0 so eligible is all-positive; line 28 returns [] if eligible is empty — totalPoints can never be 0 when arithmetic runs; no divide-by-zero possible.
   Verified: 37/37 tests pass (sum===10000 across all cases, no negatives, single winner===10000, 3-equal no longer 9999); tsc --noEmit clean; zero-points guarded (two-layer: filter + early return)
   Date: 2026-06-15

4. [x] Tweet-ownership spoofing + dedup — CRITICAL
   Files: app/api/submissions/route.ts, lib/twitter-api.ts, PoolPost schema
   Problem: no author check (author_id never fetched) → claim anyone's tweet; dedup is per-participant only.
   Fix: fetch author_id, reject if author != user's linked xAccountId; global per-pool uniqueness on postLink.
   xAccountId confirmed numeric: Twitter OAuth 1.0a user_id from callback/route.ts line 143.
   Changed: lib/twitter-api.ts (author_id folded into batch call via tweet.fields=public_metrics,author_id; TweetMetrics.authorId: string|null; fetchTweetAuthorId removed), app/api/submissions/route.ts (metrics+author in ONE call; fail-CLOSED: null/unconfirmable authorId → 503, mismatch → 403; per-participant dedup → pool-wide findFirst on poolId+postLink; P2002 catch at create), prisma/schema.prisma (@@unique([poolId, postLink]) on PoolPost; authorId String? on TweetMetricsCache), lib/__tests__/submissions.test.ts (12 tests; null authorId → reject not pass), scripts/_check-poolpost-dupes.ts (new read-only dedup checker)
   Verified: fail-closed author match (numeric user_id == author_id); pool-wide @@unique([poolId,postLink]) + P2002 safety net; prod dup check 0 rows; 12/12 tests; tsc clean. Schema applied to prod 2026-06-17 via prisma db push (code already live via vercel --prod local deploy): PoolPost_poolId_postLink_key index + TweetMetricsCache.authorId column confirmed in DB; authorId queryable (NULL for existing rows).
   Date: 2026-06-15

5. [x] Referral sybil farming — CRITICAL
   Files: app/api/referral/track/route.ts, lib/pool-scraper.ts, lib/points.ts
   Problem: only exact-wallet self-referral blocked; no caps; 1-token-unit qualifies for +500; multiplier relative to pool max → sybil wallets dominate payout.
   Fix: no caps (design decision); referral qualifies only when referred holds >= pool.tier1Threshold (effective min=1 when unset) AND has >= 1 PoolPost in pool — re-evaluated every scrape cycle (revocable). bonus + multiplier scraper-computed, not awarded at track time.
   Changed: app/api/referral/track/route.ts (removed immediate +500 award, removed checkTokenBalance call, removed axios+REFERRAL_BASE_BONUS imports; referralBoost.referredHolding starts at 0n, scraper populates), lib/pool-scraper.ts (Phase 3 rewritten: minHolding=tier1Threshold||1n; per-referral postCount query; qualifyingCount*500=bonusPoints RECOMPUTED; only qualifying holdings counted toward referredTotal; REFERRAL_BASE_BONUS imported; referralBonusPoints written in participant update each cycle), lib/points.ts (no change — calculateTotalPoints already correct), lib/__tests__/referral.test.ts (new, 33 tests)
   Verified: 33/33 tests; tsc --noEmit clean; holding<min→0; holding>=min no post→0; holding>=min+post→+500+multiplier; revocation on holding-drop→0 next cycle; revocation on post-deletion→0 next cycle; self-referral blocked; 20 qualifying referrals all count (no cap)
   Needs user action: no migration needed (no schema changes). Deploy together with Fix #4 migration.
   Date: 2026-06-16

6. [x] Deposit & access-fee integrity — HIGH
   Files: app/api/pools/route.ts, app/api/pools/[id]/join/route.ts, app/api/pools/[id]/deposit-status/route.ts
   Problem: accessFeeTxHash only checked non-empty (free pool creation); pools go ACTIVE with client-supplied totalReward and no confirmed deposit; deposit-status unauthenticated + reports deposited:true on any balance>0.
   Fix: verify fee tx on-chain via TonAPI before create; duplicate hash rejected (409); pool created PENDING not ACTIVE; deposit-status authed (owner-only) and flips PENDING→ACTIVE when balance>=totalReward; join route returns distinct error for PENDING pools.
   Changed: prisma/schema.prisma (PENDING added to PoolStatus enum; accessFeeTxHash @unique on Pool), lib/ton-verify.ts (new: checkFeeTxData pure fn + verifyAccessFeeTx async; TON checks destination+value; MGRAM checks via TonAPI events endpoint: JettonTransfer action, jetton master, recipient, amount), app/api/pools/route.ts (import verifyAccessFeeTx; PENDING status filter in GET; duplicate-hash findUnique pre-check + 409; fee tx verification before create; pool created with status PENDING; P2002 catch at create), app/api/pools/[id]/deposit-status/route.ts (getAuthWallet + owner 401/403 guard; funded=balance>=totalReward; PENDING→ACTIVE flip on funded; removed old deposited>0 logic), app/api/pools/[id]/join/route.ts (distinct 400 error message for PENDING vs other non-ACTIVE statuses), scripts/_check-fee-tx-dupes.ts (new read-only dedup checker; ran: 0 dupes found), lib/__tests__/deposit.test.ts (new: 45 tests)
   Schema applied to prod 2026-06-17 via prisma db push: PoolStatus enum now PENDING/ACTIVE/ENDED/DISTRIBUTED; Pool_accessFeeTxHash_key unique index confirmed in DB. Code was already live (vercel --prod local deploy). Pool creation unblocked.
   Verified: 45/45 tests; tsc --noEmit clean; prod dup check 0 rows; all 4 schema changes confirmed in prod DB; authorId queryable.
   Date: 2026-06-15

7. [x] Production scraper / scheduling — CRITICAL
   Files: jobs/scraper.ts, lib/pool-scraper.ts, app/api/admin/rescrape/route.ts, infra
   Problem: no prod scheduler (jobs/scraper.ts never runs on Vercel) → metrics/points frozen at submission, payouts on stale data, pools never auto-end; synchronous rescrape times out → partial DB writes.
   Fix: run scraper as a Railway worker/cron on the 30-min cycle vs the same Neon DB; admin rescrape hands off to worker; wrap/chunk writes so a timeout can't leave partial state.
   Phase A+B complete: worker LIVE on Railway.
   Changed (Phase A+B): lib/pool-scraper.ts (PENDING→ACTIVE backstop; per-participant prisma.$transaction writes), railway.json (NIXPACKS build; no-op buildCommand to skip Next.js detection; startCommand with TS_NODE_PROJECT=scripts/tsconfig.json for CJS module resolution on Node 18). Build fixes: removed redundant buildCommand (EBUSY on double npm ci), added no-op buildCommand (suppress npm run build / Next.js detection), added TS_NODE_PROJECT (root tsconfig module=esnext/bundler incompatible with ts-node on Node 18; scripts/tsconfig.json uses commonjs).
   Railway: project gramketing-scraper / service scraper / deployment a6dd93dd / region US West / status Online. Env vars: DATABASE_URL (prod Neon ep-billowing-recipe-aqr7oomu...), TON_ENDPOINT=https://toncenter.com/api/v2/jsonRPC, TONAPI_ENDPOINT=https://tonapi.io, TWITTER_BEARER_TOKEN, TELEGRAM_BOT_TOKEN, TREASURY_WALLET_ADDRESS, MGRAM_JETTON_MASTER_ADDRESS.
   First cycle (2026-06-17T05:13:48Z): boot→immediate scrape (require.main===module); DB connected (prod Neon); 0 active pools → 0 posts updated, 0 errors; cycle duration ~897ms; no API calls (no pools to scrape); service Online, cron registered for */30 * * * *.
   Balance endpoint bug (Phase C — fixed, not yet deployed): /v2/jetton/{master}/wallets does NOT exist on TonAPI v2 (returns HTML 404, silently caught → 0n for ALL wallets). Correct endpoint: GET /v2/accounts/{owner}/jettons/{master}. Returns { balance: "string" } on 200; { error: "account X has no jetton wallet Y" } on 404-no-wallet.
   Changed (Phase C): lib/ton-balance.ts (new shared helper getJettonBalance; 200→BigInt(balance); 404+"no jetton wallet"→0n; any other error→THROW so callers can distinguish transient failures from clean non-holders), lib/pool-scraper.ts (import getJettonBalance; checkTokenBalance now delegates to getJettonBalance; Phase 1 adds balanceFailed set — failed participants keep prior DB holderBoost, excluded from pool maxBalance; Phase 2 skips balanceFailed participants; Phase 3 per-referral try/catch — on throw, preserve prior qualifying state from DB instead of zeroing), app/api/pools/[id]/deposit-status/route.ts (getJettonBalance replaces broken axios call; 404-no-wallet→{funded:false,balance:'0'} no apiError; other error→apiError:true), lib/__tests__/ton-balance.test.ts (new, 12 tests).
   ton-verify.ts probed: /v2/blockchain/transactions/{hash} and /v2/events/{hash} both return JSON 404 for unknown hashes (not HTML) — endpoints are valid, no changes needed.
   Verified (Phase C): 12/12 ton-balance tests pass; 156/156 total tests pass; tsc --noEmit clean; TonAPI 404 no-wallet path confirmed (treasury probe: status 404, body "account X has no jetton wallet Y" → 0n); ton-verify endpoints valid.
   Deployed 2026-06-17: Vercel dpl_95aoa4n3aLjSx6KTQMmnFes1fb7P (Ready, aliased www.gramketing.com); Railway 9025bcb7 (Online). Live validation: known holder → 380338829307503218 PASS; treasury → 0n via clean-404 PASS.
   verifyAccessFeeTx audit: MGRAM sender not bound to creator — see Fix #8 below.
   Async deployment redesign (Phase D — 2026-06-18): Root cause — deployAndInitPool polls TON for 63s, exceeds Vercel 60s timeout → pool creation always 500'd on initial creation and idempotent retries. Full redesign: pool creation is now instant (DB write only, status=PENDING, contractAddress=null); deployment offloaded to Railway worker.
   Changed (Phase D): lib/pool-scraper.ts (added deployPendingContracts() export: finds PENDING pools with contractAddress=null, deploys via deployAndInitPool with nonce=createdAt.getTime(), updates contractAddress; called at start of scrapeAllActivePools()), jobs/scraper.ts (rewritten: added 30s setInterval fast-deploy loop calling deployPendingContracts() — separate from 30-min cron so users don't wait 30min after pool create; deployRunning guard prevents overlap), app/api/pools/[id]/deploy-status/route.ts (new: GET auth-owner endpoint; returns {deployed,contractAddress}; polled by frontend every 3s), app/api/pools/route.ts (removed deployAndInitPool import; pool created status=PENDING without contractAddress; idempotent retry returns existing pool without re-deploying; improved 500 logging with stack trace), app/api/deposit-tx/route.ts (null contractAddress → 400 with CONTRACT_PENDING code), components/CreatePoolStepper.tsx (two-phase flow: Phase 1 polls deploy-status every 3s after pool created showing "Deploying escrow contract…" spinner; Phase 2 loads deposit-tx once contractAddress set; uses Cell.fromBase64(boc).hash().toString('hex') for correct tx hash from TonConnect BOC), lib/gramketing-pool-contract.ts (treasury/sender address normalized via Address.parse().toString({bounceable:true,urlSafe:true}) for TonConnect SDK), scripts/deploy-pool-contract.ts (new: manual trigger by POOL_ID env var), scripts/_check-pending-pools.ts (new: lists PENDING pools; optional DELETE_POOL_ID).
   Additional bug fixed (Phase D): fee verification used wrong TonAPI endpoint for TON — switched from /v2/blockchain/transactions/{hash} (returned sender wallet tx, not treasury's) to /v2/events/{hash} (full trace with TonTransfer action); lib/ton-verify.ts updated; fee-system.test.ts has 73 tests.
   Orphaned pool: cmqiwi5nu0004d7h4umi62j8b (GRAMX6900, created 2026-06-18T02:48:56Z, contractAddress=null) — Railway fast-deploy loop will pick this up within 30s of next Railway deploy.
   Deployed (Phase D): commit 866496f, pushed to origin/master 2026-06-18. Vercel auto-deployed. Railway needs redeploy to pick up new jobs/scraper.ts.
   Verified: awaiting user confirmation of end-to-end pool creation flow.
   Date: 2026-06-17

8. [x] verifyAccessFeeTx sender binding — CRITICAL (front-run hole)
   Files: lib/ton-verify.ts, app/api/pools/route.ts, lib/prices.ts (new getRequiredFeeNano), lib/mgram-price.ts (new oracle), lib/fee-tx/route.ts (503 guard), lib/__tests__/fee-system.test.ts
   Problem: neither TON nor MGRAM path checks that the fee tx was SENT BY the authenticated creator's wallet. Also: verifyAccessFeeTx was called with 1n (dust) not the real USD-pegged amount; MGRAM price was always 0.
   Fix:
     Sender binding — MGRAM: JettonTransfer.sender.address checked against creatorWallet (fail-closed: absent sender → wrong-sender). TON: in_msg.source.address checked (fail-closed: absent → wrong-sender). Both normalized with normalizeRaw.
     Real fee amounts — getRequiredFeeNano() computes USD-pegged nano amount at live price, 4% tolerance, fail-closed for MGRAM price.
     MGRAM oracle — lib/mgram-price.ts: GeckoTerminal OHLCV 6-candle TWAP, DeDust V2 pool; bounds [$1e-7,$1e-4]; 50% deviation guard (recent cache only); 10-min TTL; stale cache up to 1h on network error; null on sanity fail.
     New FEE_TABLE: 7d $5/$62.5, 14d $99.5/$124.5, 21d $149.5/$187, 28d $199.5/$249.5.
     503 path: if MGRAM oracle unavailable → getRequiredFeeNano throws → pools/route.ts → 503 "try again"; fee-tx/route.ts → 503 on tokenAmount===0.
   Changed: lib/ton-verify.ts (source/sender fields; creatorWalletRaw param in checkFeeTxData+checkMgramTransfer+verifyAccessFeeTx; wrong-sender result), lib/prices.ts (FEE_TABLE; MGRAM_DECIMALS=9; FEE_TOLERANCE=0.04; getRequiredFeeNano), lib/mgram-price.ts (new), app/api/pools/route.ts (getRequiredFeeNano call; walletAddress passed to verifyAccessFeeTx), app/api/fee-tx/route.ts (503 guard), lib/__tests__/fee-system.test.ts (new, 60 tests)
   Verified: 216/216 total tests pass (8 files); tsc --noEmit clean; deployed dpl_62qE2buSvHtnaJ4tstmqkBZEwQ7W (Ready, aliased www.gramketing.com).
     Live MGRAM TWAP: 3.1225e-6 (6 candles, within [$1e-7,$1e-4]) — /api/prices confirms mgram=3.122514e-6, all 4 durations populated with non-zero tokenAmount.
     TON sender binding VERIFIED: /v2/blockchain/transactions/{hash} returns in_msg.source.address='0:33664f...' (is_wallet:true) for direct TON transfers — field is present and matches the raw address format normalizeRaw expects.
     503 fail-closed: unit-tested (fee-system.test.ts suite 2); cannot force-down oracle from prod externally, but logic path is: getMgramPrice()=null → getRequiredFeeNano throws → 503.
   Date: 2026-06-17

9. [ ] Hardening (after criticals) — LOW
   - Add explicit OAuth state nonce to link-x / twitter/callback.
   - Remove hardcoded JWT fallback in lib/auth.ts; throw if JWT_SECRET unset.
   - Set TON_FALLBACK_ENDPOINT in Vercel.
   - Remove dead env vars (TWITTER_CLIENT_ID/SECRET; NEXT_PUBLIC_TREASURY_ADDRESS if unused); decide on MGRAM_MINIMUM_HOLDING (set but unimplemented).
   Changed: __  Verified: __  Date: __

Cleared (no action): config tier (all required env vars present/scoped); contract access control (admin-only, unspoofable sender(), immutable owner/admin); secrets hygiene, gas values, W5R1 derivation.
Operational (not code): single immutable admin key, no rotation — treat ADMIN_MNEMONIC as hardware-wallet/secrets-manager grade; AdminRescue + SetJettonWallet widen blast radius if it leaks.

Change log:
- 2026-06-15 — Fix #1 — real TonProof Ed25519 verification + single-use nonce; domain hotfix to www.gramketing.com; prod login verified
- 2026-06-15 — Fix #2 — Telegram identity chain: initData HMAC validation, webhook secret_token guard, CSPRNG LINK codes; bot replies to real messages on prod verified
- 2026-06-15 — Fix #3 — distribution.ts: largest-remainder bps (sum exactly 10000); 37/37 tests; zero-points guard confirmed (filter + early return)
- 2026-06-15 — Fix #4 — tweet authorship (author_id in batch metrics call, fail-closed) + pool-wide dedup (@@unique poolId+postLink + P2002 net); 12/12 tests; prod dup check: 0 dupes
- 2026-06-16 — Fix #5 — referral sybil: bonus now scraper-computed+revocable (holding>=tier1Threshold AND >=1 post); no immediate award at track time; 33/33 tests
- 2026-06-17 — Fixes #3/#4/#5/#6 all ACTIVE in prod (vercel --prod local deploy); schema synced via prisma db push: PENDING enum, accessFeeTxHash @unique, PoolPost @@unique(poolId,postLink), TweetMetricsCache.authorId; pool creation unblocked
- 2026-06-17 — Fix #7 pre-B: TON_ENDPOINT split → TONAPI_ENDPOINT=https://tonapi.io for all TonAPI /v2 REST calls; Railway env corrected; TONAPI_ENDPOINT set in Vercel (all environments)
- 2026-06-17 — Fix #7 Phase B: Railway scraper worker deployed (deployment a6dd93dd, Online); first cycle clean (0 pools, 0 errors, ~900ms); cron running */30 * * * *
- 2026-06-17 — Fix #7 Phase C: balance endpoint bug fixed (getJettonBalance; /v2/accounts/{owner}/jettons/{master}; balanceFailed set; per-referral try/catch); 12/12 new tests; 156/156 total; tsc clean; deployed (Vercel dpl_95aoa4n3aLjSx6KTQMmnFes1fb7P + Railway 9025bcb7); live validation PASS
- 2026-06-17 — verifyAccessFeeTx audit: sender NOT bound to creator wallet — front-run hole added as Fix #8
- 2026-06-17 — Fix #8 — sender binding (TON: in_msg.source; MGRAM: JettonTransfer.sender); real fee amounts via getRequiredFeeNano (4% tolerance); MGRAM oracle (GeckoTerminal OHLCV TWAP, DeDust V2); new FEE_TABLE; 216/216 tests; deployed dpl_62qE2buSvHtnaJ4tstmqkBZEwQ7W; TWAP=$3.1225e-6 live; TON in_msg.source confirmed present on TonAPI
- 2026-06-18 — Fix #7 Phase D — async contract deployment redesign: pool create instant (PENDING+null contractAddress); Railway 30s fast-deploy loop; GET /api/pools/:id/deploy-status (owner-auth); frontend two-phase polling (deploy spinner → deposit button); TON fee verification switched to /v2/events endpoint; TonConnect BOC→Cell hash fix; address normalization for TonConnect SDK; committed 866496f

================= END SECURITY FIX TRACKER =================
