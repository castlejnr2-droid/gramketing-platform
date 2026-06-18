import { prisma } from '@/lib/prisma';
import { calculateTotalPoints, CampaignType, REFERRAL_BASE_BONUS } from '@/lib/points';
import { fetchTelegramPostMetrics } from '@/lib/telegram';
import { logAdminEvent } from '@/lib/admin-log';
import { fetchTweetMetrics, extractTweetId } from '@/lib/twitter-api';
import { getJettonBalance } from '@/lib/ton-balance';
import { deployAndInitPool } from '@/lib/gramketing-pool-contract';

// ── X / Twitter scraping ──────────────────────────────────────────────────────

export type XScrapeError = 'NOT_FOUND' | 'TOKEN_EXPIRED' | 'UNKNOWN';

export type XScrapeResult =
  | { ok: true; views: number; likes: number; reposts: number; error?: XScrapeError }
  | { ok: false; error: XScrapeError; views: number; likes: number; reposts: number };

/**
 * Fetches metrics for a single X post URL.
 * Thin wrapper around fetchTweetMetrics (which is cached + batched) kept for
 * backward compatibility with the legacy Submission rescrape route.
 */
export async function fetchXPostMetrics(
  postUrl: string,
  currentViews = 0,
  currentLikes = 0,
  currentReposts = 0,
): Promise<XScrapeResult> {
  const tweetId = extractTweetId(postUrl);
  if (!tweetId) {
    return { ok: false, error: 'UNKNOWN', views: currentViews, likes: currentLikes, reposts: currentReposts };
  }

  const [result] = await fetchTweetMetrics([tweetId]);

  if (result.ok) {
    return { ok: true, views: result.views, likes: result.likes, reposts: result.retweets };
  }

  const error: XScrapeError =
    result.error === 'NOT_FOUND' ? 'NOT_FOUND' :
    result.error === 'TOKEN_EXPIRED' ? 'TOKEN_EXPIRED' :
    'UNKNOWN';
  return { ok: false, error, views: currentViews, likes: currentLikes, reposts: currentReposts };
}

// ── Token balance check ───────────────────────────────────────────────────────

/**
 * Thin wrapper kept for external callers (admin rescrape route, backstop).
 * Throws on any error other than "wallet not created yet" (→ 0n).
 * Callers that can tolerate a transient failure should wrap in try/catch.
 */
export async function checkTokenBalance(
  walletAddress: string,
  jettonMasterAddress: string,
): Promise<bigint> {
  return getJettonBalance(walletAddress, jettonMasterAddress);
}

// ── Leaderboard snapshot ──────────────────────────────────────────────────────

export async function saveLeaderboardSnapshot(poolId: string) {
  const participants = await prisma.poolParticipant.findMany({
    where: { poolId },
    include: { user: true },
    orderBy: { totalPoints: 'desc' },
  });

  const rankings = participants.map((p, i) => ({
    rank: i + 1,
    userId: p.userId,
    walletAddress: p.user.walletAddress,
    username: p.user.username,
    xHandle: p.user.xHandle,
    totalPoints: p.totalPoints,
    xPoints: p.xPoints,
    telegramPoints: p.telegramPoints,
    referralBonusPoints: p.referralBonusPoints,
    referralMultiplier: p.referralMultiplier,
    holderBoost: p.holderBoost,
  }));

  await prisma.leaderboardSnapshot.create({ data: { poolId, rankings } });
}

// ── Scrape a single pool ──────────────────────────────────────────────────────

export async function scrapePoolById(poolId: string): Promise<{ scraped: number; errors: string[] }> {
  const now = new Date();
  const errors: string[] = [];

  const pool = await prisma.pool.findUnique({
    where: { id: poolId },
    include: {
      participants: { include: { user: true } },
      project: true,
    },
  });

  if (!pool) {
    throw new Error(`Pool ${poolId} not found`);
  }

  const campaignType = (pool.campaignType as CampaignType) ?? 'both';

  // ── Phase 1: Fetch all participant token balances ──────────────────────────
  // balanceFailed tracks participants whose balance fetch threw (network/5xx/429).
  // These participants are excluded from balance-derived calculations this cycle;
  // their existing DB values (holderBoost, referralBoost) are preserved unchanged.
  const balanceMap = new Map<string, bigint>();
  const balanceFailed = new Set<string>();
  for (const participant of pool.participants) {
    try {
      const balance = await getJettonBalance(
        participant.user.walletAddress,
        pool.jettonMasterAddress,
      );
      balanceMap.set(participant.userId, balance);
    } catch (e) {
      errors.push(`Balance fetch failed for participant ${participant.userId}: ${e instanceof Error ? e.message : String(e)}`);
      balanceFailed.add(participant.userId);
    }
  }

  // ── Phase 2: Pool-wide holder boost (1.0x – 2.0x proportional) ─────────────
  // Only participants whose balance fetch succeeded contribute to the pool max.
  // Participants with a failed fetch keep their existing DB holderBoost value
  // (written in the Phase 5 participant update below).
  const maxBalance = pool.participants.reduce((max, p) => {
    if (balanceFailed.has(p.userId)) return max;
    const b = balanceMap.get(p.userId) ?? 0n;
    return b > max ? b : max;
  }, 0n);

  const holderBoostMap = new Map<string, number>();
  for (const participant of pool.participants) {
    if (balanceFailed.has(participant.userId)) {
      // Preserve existing holderBoost — don't overwrite with a stale 0 calculation
      holderBoostMap.set(participant.userId, participant.holderBoost ?? 1.0);
      continue;
    }
    const balance = balanceMap.get(participant.userId) ?? 0n;
    const boost =
      maxBalance === 0n ? 1.0 : 1.0 + Number(balance) / Number(maxBalance);
    holderBoostMap.set(participant.userId, boost);
  }

  // ── Phase 3: Update referral holdings, qualify referrals, tally totals ───────
  //
  // A referral QUALIFIES (contributes to bonus points and the multiplier) only
  // when BOTH conditions hold — re-evaluated every cycle so awards can be revoked:
  //   (1) referred wallet holds >= pool's holder-boost minimum (tier1Threshold);
  //       when tier1Threshold is unset (0), any positive holding (>= 1 token unit)
  //       qualifies — avoids a trivially-true ">= 0" check on a BigInt.
  //   (2) referred wallet has submitted >= 1 author-verified PoolPost in this pool.
  //
  // referralBonusPoints = qualifyingCount × 500  (RECOMPUTED, not incremented)
  // referredTotal for multiplier = sum of holdings of qualifying referrals only.
  //
  // All referralBoost writes for a given referrer are grouped into a single
  // Prisma transaction so a crash mid-participant leaves no partial state.
  const minHolding = pool.tier1Threshold > 0n ? pool.tier1Threshold : 1n;

  const referredTotalMap = new Map<string, bigint>();
  const referralBonusMap = new Map<string, number>(); // referrerId → bonus points this cycle

  for (const participant of pool.participants) {
    const referralBoosts = await prisma.referralBoost.findMany({
      where: { referrerId: participant.userId, poolId: pool.id },
      include: { referred: true },
    });

    let referredTotal = 0n;
    let qualifyingCount = 0;
    // Collect all referralBoost writes for this participant before committing
    const boostWrites: ReturnType<typeof prisma.referralBoost.update>[] = [];

    for (const boost of referralBoosts) {
      let holding: bigint;
      try {
        holding = await getJettonBalance(
          boost.referred.walletAddress,
          pool.jettonMasterAddress,
        );
      } catch (e) {
        // TonAPI transient error — skip updating this referral's holding this cycle
        // so we don't zero it out and incorrectly revoke the bonus.
        errors.push(`Referral balance fetch failed for ${boost.referredUserId}: ${e instanceof Error ? e.message : String(e)}`);
        // Still count prior qualifying state from DB if present
        const priorHolding = BigInt(boost.referredHolding ?? '0');
        if (priorHolding >= minHolding) {
          const postCount = await prisma.poolPost.count({
            where: { poolId: pool.id, participant: { userId: boost.referredUserId } },
          });
          if (postCount >= 1) {
            referredTotal += priorHolding;
            qualifyingCount++;
          }
        }
        continue;
      }

      // Condition (2): referred has >= 1 PoolPost in this pool
      const postCount = await prisma.poolPost.count({
        where: {
          poolId: pool.id,
          participant: { userId: boost.referredUserId },
        },
      });

      const qualifies = holding >= minHolding && postCount >= 1;

      boostWrites.push(
        prisma.referralBoost.update({
          where: { id: boost.id },
          data: { referredHolding: holding, updatedAt: now },
        }),
      );

      if (qualifies) {
        referredTotal += holding;
        qualifyingCount++;
      }
    }

    // Commit all referralBoost updates for this participant atomically
    if (boostWrites.length > 0) {
      await prisma.$transaction(boostWrites);
    }

    referredTotalMap.set(participant.userId, referredTotal);
    referralBonusMap.set(participant.userId, qualifyingCount * REFERRAL_BASE_BONUS);
  }

  // ── Phase 4: Pool-wide referral boost (1.0x – 2.0x proportional) ───────────
  const maxReferredTotal = [...referredTotalMap.values()].reduce(
    (max, v) => (v > max ? v : max),
    0n
  );

  const referralBoostMap = new Map<string, number>();
  for (const participant of pool.participants) {
    const total = referredTotalMap.get(participant.userId) ?? 0n;
    const boost =
      maxReferredTotal === 0n
        ? 1.0
        : 1.0 + Number(total) / Number(maxReferredTotal);
    referralBoostMap.set(participant.userId, boost);
  }

  // ── Phase 5: Scrape PoolPost records & compute points ─────────────────────
  const poolPosts = await prisma.poolPost.findMany({
    where: { poolId: pool.id },
    include: { participant: true },
  });

  const postsByUser = new Map<string, typeof poolPosts>();
  for (const post of poolPosts) {
    const uid = post.participant.userId;
    if (!postsByUser.has(uid)) postsByUser.set(uid, []);
    postsByUser.get(uid)!.push(post);
  }

  // ── Batch-fetch all X post metrics up-front ────────────────────────────────
  // Collect (post.id → tweetId) for every X post in this pool so we can call
  // the Twitter API once in batches of up to 100 instead of one call per post.
  const tweetIdByPostId = new Map<string, string>();
  const tweetIdsToFetch: string[] = [];

  for (const post of poolPosts) {
    if (post.platform === 'X') {
      const tweetId = extractTweetId(post.postLink);
      if (tweetId) {
        tweetIdByPostId.set(post.id, tweetId);
        tweetIdsToFetch.push(tweetId);
      }
    }
  }

  // fetchTweetMetrics deduplicates, checks the cache, and batches API calls
  const tweetResultsArr = await fetchTweetMetrics(tweetIdsToFetch);
  // Build a map from tweetId → result for O(1) lookup below
  const tweetResultMap = new Map(
    tweetIdsToFetch.map((id, i) => [id, tweetResultsArr[i]])
  );

  let scraped = 0;
  let xTokenExpired = false;

  for (const participant of pool.participants) {
    const userId = participant.userId;
    const holderBoost = holderBoostMap.get(userId) ?? 1.0;
    const referralMultiplier = referralBoostMap.get(userId) ?? 1.0;

    let xPoints = 0;
    let telegramPoints = 0;

    const posts = postsByUser.get(userId) ?? [];

    // Collect all DB writes for this participant before committing.
    // Executed atomically at the end of the participant loop so a timeout or
    // crash cannot leave this participant in a partially-updated state.
    const participantWrites: ReturnType<typeof prisma.poolPost.update | typeof prisma.poolParticipant.update>[] = [];

    for (const post of posts) {
      if (post.platform === 'X') {
        const tweetId = tweetIdByPostId.get(post.id);
        const result = tweetId ? tweetResultMap.get(tweetId) : undefined;

        if (!result) {
          // Could not extract a tweet ID from the URL - malformed link
          participantWrites.push(
            prisma.poolPost.update({
              where: { id: post.id },
              data: { scrapeError: 'UNKNOWN: could not parse tweet ID from URL', lastScrapedAt: now },
            }),
          );
          errors.push(`Cannot parse tweet ID from: ${post.postLink}`);
          xPoints += post.points;
          continue;
        }

        if (!result.ok && result.error === 'TOKEN_EXPIRED') {
          // Do not overwrite metrics; mark scrape error and keep existing points
          participantWrites.push(
            prisma.poolPost.update({
              where: { id: post.id },
              data: {
                scrapeError: 'TOKEN_EXPIRED: Twitter bearer token rejected (401/403)',
                lastScrapedAt: now,
              },
            }),
          );
          console.warn(`[scraper] TOKEN_EXPIRED for post ${post.id} — metrics frozen`);
          errors.push(`X token expired for post ${post.id} (${post.postLink})`);
          xTokenExpired = true;
          xPoints += post.points;
          continue;
        }

        if (!result.ok && result.error === 'NOT_FOUND') {
          participantWrites.push(
            prisma.poolPost.update({
              where: { id: post.id },
              data: { scrapeError: 'NOT_FOUND: post deleted or unavailable', lastScrapedAt: now },
            }),
          );
          console.warn(`[scraper] NOT_FOUND for post ${post.id}: ${post.postLink}`);
          errors.push(`X post not found: ${post.postLink}`);
          xPoints += post.points;
          continue;
        }

        if (!result.ok) {
          // RATE_LIMITED or UNKNOWN - keep existing metrics
          participantWrites.push(
            prisma.poolPost.update({
              where: { id: post.id },
              data: { scrapeError: `${result.error}: ${post.postLink}`, lastScrapedAt: now },
            }),
          );
          console.warn(`[scraper] ${result.error} for post ${post.id}: ${post.postLink}`);
          errors.push(`X scrape error (${result.error}) for post ${post.id}`);
          xPoints += post.points;
          continue;
        }

        // Successful fetch
        const pts =
          result.views >= 100
            ? result.views * 0.8 + result.likes * 0.1 + result.retweets * 0.1
            : post.points; // keep last valid score if below minimum view threshold

        console.log(`[scraper] post ${post.id}: views=${result.views} likes=${result.likes} reposts=${result.retweets} pts=${pts.toFixed(0)} (prev views=${post.views} pts=${post.points.toFixed(0)})`);

        participantWrites.push(
          prisma.poolPost.update({
            where: { id: post.id },
            data: {
              views: result.views,
              likes: result.likes,
              reposts: result.retweets,
              points: pts,
              lastScrapedAt: now,
              scrapeError: null,
            },
          }),
        );
        xPoints += pts;
        scraped++;
      } else {
        // TELEGRAM - fetched individually (no batch endpoint available);
        // metrics call is outside the transaction but the write is collected.
        try {
          const { views, reactions } = await fetchTelegramPostMetrics(post.postLink);
          const pts = views * 0.8 + reactions * 0.2;
          participantWrites.push(
            prisma.poolPost.update({
              where: { id: post.id },
              data: { views, reactions, points: pts, lastScrapedAt: now, scrapeError: null },
            }),
          );
          telegramPoints += pts;
          scraped++;
        } catch (e) {
          const errStr = `Telegram scrape error for post ${post.id}: ${e}`;
          errors.push(errStr);
          telegramPoints += post.points;
          participantWrites.push(
            prisma.poolPost.update({
              where: { id: post.id },
              data: { scrapeError: errStr, lastScrapedAt: now },
            }),
          );
        }
      }
    }

    // referralBonusPoints is RECOMPUTED this cycle (not read from DB) so that
    // a referral which no longer qualifies (wallet sold, post removed) is revoked.
    const referralBonusPoints = referralBonusMap.get(userId) ?? 0;

    const totalPoints = calculateTotalPoints({
      xPoints,
      telegramPoints,
      holderBoost,
      referralMultiplier,
      referralBonusPoints,
      campaignType,
    });

    participantWrites.push(
      prisma.poolParticipant.update({
        where: { id: participant.id },
        data: { xPoints, telegramPoints, holderBoost, referralMultiplier, referralBonusPoints, totalPoints },
      }),
    );

    // Commit all writes for this participant in one atomic transaction.
    // If the process is killed after the transaction commits, the next cycle
    // resumes from the next participant with no partial state.
    if (participantWrites.length > 0) {
      await prisma.$transaction(participantWrites);
    }
  }

  await saveLeaderboardSnapshot(pool.id);

  // Log errors to AdminLog if any occurred
  if (errors.length > 0) {
    await logAdminEvent({
      action: 'SCRAPE_ERROR',
      level: xTokenExpired ? 'error' : 'warn',
      poolId: pool.id,
      message: `Scrape completed with ${errors.length} error(s). ${scraped} posts updated.${xTokenExpired ? ' TWITTER_BEARER_TOKEN appears expired.' : ''}`,
      details: { scraped, errorCount: errors.length, errors: errors.slice(0, 20) },
    });
  }

  return { scraped, errors };
}

// ── Scrape all active pools ───────────────────────────────────────────────────

/**
 * Deploys escrow contracts for any PENDING pools that have contractAddress=null.
 *
 * Called by the fast deploy loop (every 30 s) and also at the start of each
 * 30-minute scrape cycle.  deployAndInitPool polls TON for up to 63 seconds —
 * acceptable here since the Railway worker has no execution time limit.
 */
export async function deployPendingContracts(): Promise<void> {
  const undeployedPools = await prisma.pool.findMany({
    where: { status: 'PENDING', contractAddress: null },
    include: { project: true },
  });

  if (undeployedPools.length === 0) return;

  console.log(`[deploy] ${undeployedPools.length} PENDING pool(s) without a contract — deploying...`);

  for (const pool of undeployedPools) {
    try {
      const adminAddress = process.env.ADMIN_WALLET_ADDRESS;
      if (!adminAddress) throw new Error('ADMIN_WALLET_ADDRESS not configured');
      const { contractAddress: deployedAddress } = await deployAndInitPool({
        ownerAddress: pool.project.ownerWalletAddress,
        adminAddress,
        jettonMasterAddress: pool.jettonMasterAddress,
        totalReward: pool.totalReward,
        durationDays: pool.durationDays,
        rewardSlots: pool.rewardSlots,
        nonce: BigInt(pool.createdAt.getTime()),
      });
      await prisma.pool.update({
        where: { id: pool.id },
        data: { contractAddress: deployedAddress },
      });
      console.log(`[deploy] Pool ${pool.id}: deployed at ${deployedAddress}`);
      await logAdminEvent({
        action: 'DEPLOY_CONTRACT',
        level: 'info',
        poolId: pool.id,
        message: `Scraper deployed contract for pool ${pool.id}: ${deployedAddress}`,
        details: { contractAddress: deployedAddress },
      });
    } catch (deployErr) {
      const errMsg = deployErr instanceof Error ? deployErr.message : String(deployErr);
      console.error(`[deploy] Pool ${pool.id}: deployment failed — ${errMsg}`);
      await logAdminEvent({
        action: 'DEPLOY_CONTRACT',
        level: 'error',
        poolId: pool.id,
        message: `Scraper failed to deploy contract for pool ${pool.id}: ${errMsg}`,
        details: { error: errMsg },
      }).catch(() => {});
    }
  }
}

export async function scrapeAllActivePools() {
  const cycleStart = new Date();
  console.log(`[${cycleStart.toISOString()}] Starting scrape cycle...`);
  const now = cycleStart;

  // Deploy any pools that are waiting for their contract (also runs in fast loop,
  // but we run it here too so a fresh deploy doesn't wait for the next fast tick).
  await deployPendingContracts();

  // ── PENDING → ACTIVE backstop ─────────────────────────────────────────────
  // If the pool creator deposited the reward but never re-hit deposit-status
  // (or the API call failed), the pool stays stuck as PENDING forever.
  // Each cycle we check: if on-chain balance >= totalReward, flip to ACTIVE.
  const pendingPools = await prisma.pool.findMany({
    where: { status: 'PENDING', contractAddress: { not: null } },
  });
  for (const pool of pendingPools) {
    try {
      const balance = await checkTokenBalance(pool.contractAddress!, pool.jettonMasterAddress);
      if (balance >= BigInt(pool.totalReward)) {
        console.log(`[backstop] Pool ${pool.id} is funded — flipping PENDING → ACTIVE`);
        await prisma.pool.update({ where: { id: pool.id }, data: { status: 'ACTIVE' } });
      }
    } catch (e) {
      console.error(`[backstop] Failed to check balance for pending pool ${pool.id}:`, e);
    }
  }

  // End expired pools
  const expiredPools = await prisma.pool.findMany({
    where: { status: 'ACTIVE', endDate: { lte: now } },
  });
  for (const pool of expiredPools) {
    console.log(`Pool ${pool.id} expired - marking ENDED`);
    await saveLeaderboardSnapshot(pool.id);
    await prisma.pool.update({ where: { id: pool.id }, data: { status: 'ENDED' } });
  }

  // Notify participants of pools ending within ~24 hours
  const in23h = new Date(now.getTime() + 23 * 60 * 60 * 1000);
  const in25h = new Date(now.getTime() + 25 * 60 * 60 * 1000);
  const endingSoonPools = await prisma.pool.findMany({
    where: { status: 'ACTIVE', endDate: { gte: in23h, lte: in25h } },
    include: { participants: true, project: true },
  });
  for (const pool of endingSoonPools) {
    const { notifyPoolEndingSoon } = await import('@/lib/telegram-notify');
    const hoursLeft = Math.round((pool.endDate.getTime() - now.getTime()) / 3_600_000);
    const poolName = pool.project.name;
    for (const participant of pool.participants) {
      await notifyPoolEndingSoon(participant.userId, poolName, hoursLeft);
    }
  }

  // Scrape active pools
  const activePools = await prisma.pool.findMany({
    where: { status: 'ACTIVE' },
    include: { project: true },
  });

  let totalScraped = 0;
  let totalErrors = 0;
  const poolsWithErrors: string[] = [];

  for (const pool of activePools) {
    console.log(`Scraping pool ${pool.id} (${pool.tokenSymbol})`);

    // Capture previous rankings to detect rank drops
    const prevSnapshot = await prisma.leaderboardSnapshot.findFirst({
      where: { poolId: pool.id },
      orderBy: { snapshotAt: 'desc' },
    });
    const prevRankMap = new Map<string, number>();
    if (prevSnapshot) {
      const rankings = prevSnapshot.rankings as Array<{ userId: string; rank: number }>;
      for (const r of rankings) prevRankMap.set(r.userId, r.rank);
    }

    try {
      const { scraped, errors } = await scrapePoolById(pool.id);
      totalScraped += scraped;
      totalErrors += errors.length;
      if (errors.length > 0) {
        poolsWithErrors.push(pool.id);
        console.warn(`[scraper] Pool ${pool.id} (${pool.tokenSymbol}): ${scraped} posts OK, ${errors.length} error(s): ${errors.slice(0, 3).join(' | ')}`);
      } else {
        console.log(`[scraper] Pool ${pool.id} (${pool.tokenSymbol}): ${scraped} posts updated OK`);
      }
    } catch (e) {
      console.error(`Error scraping pool ${pool.id}:`, e);
      totalErrors++;
      poolsWithErrors.push(pool.id);
      await logAdminEvent({
        action: 'SCRAPE_ERROR',
        level: 'error',
        poolId: pool.id,
        message: `Scrape cycle failed for pool ${pool.id}: ${e instanceof Error ? e.message : String(e)}`,
        details: { error: String(e) },
      });
    }

    // Detect rank drops and notify outranked participants
    if (prevRankMap.size > 0) {
      const { notifyOutranked } = await import('@/lib/telegram-notify');
      const newSnapshot = await prisma.leaderboardSnapshot.findFirst({
        where: { poolId: pool.id },
        orderBy: { snapshotAt: 'desc' },
      });
      if (newSnapshot) {
        const newRankings = newSnapshot.rankings as Array<{ userId: string; rank: number }>;
        const poolName = pool.project.name;
        for (const r of newRankings) {
          const prevRank = prevRankMap.get(r.userId);
          if (prevRank !== undefined && r.rank > prevRank) {
            await notifyOutranked(r.userId, poolName, r.rank);
          }
        }
      }
    }
  }

  const cycleEnd = new Date();
  const durationMs = cycleEnd.getTime() - cycleStart.getTime();
  console.log(`[${cycleEnd.toISOString()}] Scrape cycle complete. ${totalScraped} posts updated, ${totalErrors} errors across ${activePools.length} pools.`);

  // Log cycle summary to AdminLog
  await logAdminEvent({
    action: 'SCRAPE_CYCLE',
    level: totalErrors > 0 ? 'warn' : 'info',
    message: `Scrape cycle: ${activePools.length} pools, ${totalScraped} posts updated, ${totalErrors} error(s) in ${Math.round(durationMs / 1000)}s`,
    details: {
      pools: activePools.length,
      postsScraped: totalScraped,
      errors: totalErrors,
      poolsWithErrors,
      durationMs,
    },
  });
}
