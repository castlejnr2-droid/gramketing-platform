import axios from 'axios';
import { prisma } from '@/lib/prisma';
import { calculateTotalPoints, CampaignType } from '@/lib/points';
import { fetchTelegramPostMetrics } from '@/lib/telegram';
import { logAdminEvent } from '@/lib/admin-log';
import { fetchTweetMetrics, extractTweetId } from '@/lib/twitter-api';

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

export async function checkTokenBalance(
  walletAddress: string,
  jettonMasterAddress: string
): Promise<bigint> {
  try {
    const res = await axios.get(
      `${process.env.TON_ENDPOINT}/v2/jetton/${jettonMasterAddress}/wallets`,
      { params: { owner_address: walletAddress, limit: 1 }, timeout: 8_000 }
    );
    const wallets = res.data?.jetton_wallets ?? [];
    if (wallets.length === 0) return 0n;
    return BigInt(wallets[0].balance ?? '0');
  } catch {
    return 0n;
  }
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
  const balanceMap = new Map<string, bigint>();
  for (const participant of pool.participants) {
    const balance = await checkTokenBalance(
      participant.user.walletAddress,
      pool.jettonMasterAddress
    );
    balanceMap.set(participant.userId, balance);
  }

  // ── Phase 2: Pool-wide holder boost (1.0x – 2.0x proportional) ─────────────
  const maxBalance = pool.participants.reduce((max, p) => {
    const b = balanceMap.get(p.userId) ?? 0n;
    return b > max ? b : max;
  }, 0n);

  const holderBoostMap = new Map<string, number>();
  for (const participant of pool.participants) {
    const balance = balanceMap.get(participant.userId) ?? 0n;
    const boost =
      maxBalance === 0n ? 1.0 : 1.0 + Number(balance) / Number(maxBalance);
    holderBoostMap.set(participant.userId, boost);
  }

  // ── Phase 3: Update referral holdings & tally referred totals ──────────────
  const referredTotalMap = new Map<string, bigint>();
  for (const participant of pool.participants) {
    const referralBoosts = await prisma.referralBoost.findMany({
      where: { referrerId: participant.userId, poolId: pool.id },
      include: { referred: true },
    });

    let referredTotal = 0n;
    for (const boost of referralBoosts) {
      const holding = await checkTokenBalance(
        boost.referred.walletAddress,
        pool.jettonMasterAddress
      );
      await prisma.referralBoost.update({
        where: { id: boost.id },
        data: { referredHolding: holding, updatedAt: now },
      });
      if (holding > 0n) referredTotal += holding;
    }
    referredTotalMap.set(participant.userId, referredTotal);
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

    for (const post of posts) {
      if (post.platform === 'X') {
        const tweetId = tweetIdByPostId.get(post.id);
        const result = tweetId ? tweetResultMap.get(tweetId) : undefined;

        if (!result) {
          // Could not extract a tweet ID from the URL - malformed link
          await prisma.poolPost.update({
            where: { id: post.id },
            data: { scrapeError: 'UNKNOWN: could not parse tweet ID from URL', lastScrapedAt: now },
          });
          errors.push(`Cannot parse tweet ID from: ${post.postLink}`);
          xPoints += post.points;
          continue;
        }

        if (!result.ok && result.error === 'TOKEN_EXPIRED') {
          // Do not overwrite metrics; mark scrape error and keep existing points
          await prisma.poolPost.update({
            where: { id: post.id },
            data: {
              scrapeError: 'TOKEN_EXPIRED: Twitter bearer token rejected (401/403)',
              lastScrapedAt: now,
            },
          });
          errors.push(`X token expired for post ${post.id} (${post.postLink})`);
          xTokenExpired = true;
          xPoints += post.points;
          continue;
        }

        if (!result.ok && result.error === 'NOT_FOUND') {
          await prisma.poolPost.update({
            where: { id: post.id },
            data: { scrapeError: 'NOT_FOUND: post deleted or unavailable', lastScrapedAt: now },
          });
          errors.push(`X post not found: ${post.postLink}`);
          xPoints += post.points;
          continue;
        }

        if (!result.ok) {
          // RATE_LIMITED or UNKNOWN - keep existing metrics
          await prisma.poolPost.update({
            where: { id: post.id },
            data: { scrapeError: `${result.error}: ${post.postLink}`, lastScrapedAt: now },
          });
          errors.push(`X scrape error (${result.error}) for post ${post.id}`);
          xPoints += post.points;
          continue;
        }

        // Successful fetch
        const pts =
          result.views >= 100
            ? result.views * 0.8 + result.likes * 0.1 + result.retweets * 0.1
            : post.points; // keep last valid score if below minimum view threshold

        await prisma.poolPost.update({
          where: { id: post.id },
          data: {
            views: result.views,
            likes: result.likes,
            reposts: result.retweets,
            points: pts,
            lastScrapedAt: now,
            scrapeError: null,
          },
        });
        xPoints += pts;
        scraped++;
      } else {
        // TELEGRAM - still fetched individually (no batch endpoint available)
        try {
          const { views, reactions } = await fetchTelegramPostMetrics(post.postLink);
          const pts = views * 0.8 + reactions * 0.2;
          await prisma.poolPost.update({
            where: { id: post.id },
            data: { views, reactions, points: pts, lastScrapedAt: now, scrapeError: null },
          });
          telegramPoints += pts;
          scraped++;
        } catch (e) {
          const errStr = `Telegram scrape error for post ${post.id}: ${e}`;
          errors.push(errStr);
          telegramPoints += post.points;
          await prisma.poolPost.update({
            where: { id: post.id },
            data: { scrapeError: errStr, lastScrapedAt: now },
          });
        }
      }
    }

    const totalPoints = calculateTotalPoints({
      xPoints,
      telegramPoints,
      holderBoost,
      referralMultiplier,
      referralBonusPoints: participant.referralBonusPoints,
      campaignType,
    });

    await prisma.poolParticipant.update({
      where: { id: participant.id },
      data: { xPoints, telegramPoints, holderBoost, referralMultiplier, totalPoints },
    });
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

export async function scrapeAllActivePools() {
  const cycleStart = new Date();
  console.log(`[${cycleStart.toISOString()}] Starting scrape cycle...`);
  const now = cycleStart;

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
      if (errors.length > 0) poolsWithErrors.push(pool.id);
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
