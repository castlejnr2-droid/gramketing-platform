import cron from 'node-cron';
import { PrismaClient } from '@prisma/client';
import axios from 'axios';
import {
  calculateTotalPoints,
  CampaignType,
} from '../lib/points';
import { fetchTelegramPostMetrics } from '../lib/telegram';
import { notifyOutranked, notifyPoolEndingSoon } from '../lib/telegram-notify';

const prisma = new PrismaClient();

// ── X / Twitter scraping ──────────────────────────────────────────────────
interface XMetrics {
  views: number;
  likes: number;
  reposts: number;
}

async function fetchXPostMetrics(postUrl: string): Promise<XMetrics> {
  const match = postUrl.match(/status\/(\d+)/);
  if (!match) return { views: 0, likes: 0, reposts: 0 };
  const tweetId = match[1];
  try {
    const res = await axios.get(
      `https://api.twitter.com/2/tweets/${tweetId}?tweet.fields=public_metrics`,
      { headers: { Authorization: `Bearer ${process.env.TWITTER_BEARER_TOKEN}` } }
    );
    const m = res.data?.data?.public_metrics ?? {};
    return {
      views: m.impression_count ?? 0,
      likes: m.like_count ?? 0,
      reposts: m.retweet_count ?? 0,
    };
  } catch {
    return { views: 0, likes: 0, reposts: 0 };
  }
}

// ── Token balance check ───────────────────────────────────────────────────
async function checkTokenBalance(
  walletAddress: string,
  jettonMasterAddress: string
): Promise<bigint> {
  try {
    const res = await axios.get(
      `${process.env.TON_ENDPOINT}/v2/jetton/${jettonMasterAddress}/wallets`,
      { params: { owner_address: walletAddress, limit: 1 } }
    );
    const wallets = res.data?.jetton_wallets ?? [];
    if (wallets.length === 0) return 0n;
    return BigInt(wallets[0].balance ?? '0');
  } catch {
    return 0n;
  }
}

// ── Leaderboard snapshot ──────────────────────────────────────────────────
async function saveLeaderboardSnapshot(poolId: string) {
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

// ── Main scrape function ──────────────────────────────────────────────────
async function scrapeAllActivePools() {
  console.log(`[${new Date().toISOString()}] Starting scrape cycle...`);
  const now = new Date();

  // End expired pools
  const expiredPools = await prisma.pool.findMany({
    where: { status: 'ACTIVE', endDate: { lte: now } },
  });
  for (const pool of expiredPools) {
    console.log(`Pool ${pool.id} expired — marking ENDED`);
    await saveLeaderboardSnapshot(pool.id);
    await prisma.pool.update({ where: { id: pool.id }, data: { status: 'ENDED' } });
  }

  // Notify participants of pools ending within ~24 hours (fire once: 23–25 h window)
  const in23h = new Date(now.getTime() + 23 * 60 * 60 * 1000);
  const in25h = new Date(now.getTime() + 25 * 60 * 60 * 1000);
  const endingSoonPools = await prisma.pool.findMany({
    where: { status: 'ACTIVE', endDate: { gte: in23h, lte: in25h } },
    include: { participants: true, project: true },
  });
  for (const pool of endingSoonPools) {
    const hoursLeft = Math.round((pool.endDate.getTime() - now.getTime()) / 3_600_000);
    const poolName = pool.project.name;
    for (const participant of pool.participants) {
      await notifyPoolEndingSoon(participant.userId, poolName, hoursLeft);
    }
  }

  // Scrape active pools
  const activePools = await prisma.pool.findMany({
    where: { status: 'ACTIVE' },
    include: {
      participants: { include: { user: true } },
      project: true,
    },
  });

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
    const campaignType = (pool.campaignType as CampaignType) ?? 'both';

    // ── Phase 1: Fetch all participant token balances ──────────────────
    const balanceMap = new Map<string, bigint>();
    for (const participant of pool.participants) {
      const balance = await checkTokenBalance(
        participant.user.walletAddress,
        pool.jettonMasterAddress
      );
      balanceMap.set(participant.userId, balance);
    }

    // ── Phase 2: Pool-wide holder boost (1.0x – 2.0x proportional) ────
    const maxBalance = pool.participants.reduce((max, p) => {
      const b = balanceMap.get(p.userId) ?? 0n;
      return b > max ? b : max;
    }, 0n);

    const holderBoostMap = new Map<string, number>();
    for (const participant of pool.participants) {
      const balance = balanceMap.get(participant.userId) ?? 0n;
      const boost =
        maxBalance === 0n
          ? 1.0
          : 1.0 + Number(balance) / Number(maxBalance);
      holderBoostMap.set(participant.userId, boost);
    }

    // ── Phase 3: Update referral holdings & tally referred totals ──────
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

    // ── Phase 4: Pool-wide referral boost (1.0x – 2.0x proportional) ──
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

    // ── Phase 5: Scrape PoolPost records & compute points ─────────────
    // Only the specific post links participants submitted are scraped —
    // never entire channels or X accounts.
    const poolPosts = await prisma.poolPost.findMany({
      where: { poolId: pool.id },
      include: { participant: true },
    });

    // Group posts by userId for easy lookup
    const postsByUser = new Map<string, typeof poolPosts>();
    for (const post of poolPosts) {
      const uid = post.participant.userId;
      if (!postsByUser.has(uid)) postsByUser.set(uid, []);
      postsByUser.get(uid)!.push(post);
    }

    for (const participant of pool.participants) {
      const userId = participant.userId;
      const holderBoost = holderBoostMap.get(userId) ?? 1.0;
      const referralMultiplier = referralBoostMap.get(userId) ?? 1.0;

      let xPoints = 0;
      let telegramPoints = 0;

      const posts = postsByUser.get(userId) ?? [];

      for (const post of posts) {
        if (post.platform === 'X') {
          const { views, likes, reposts } = await fetchXPostMetrics(post.postLink);
          // Keep last valid score if views drop below 100 threshold
          const pts = views >= 100
            ? views * 0.8 + likes * 0.1 + reposts * 0.1
            : post.points;
          await prisma.poolPost.update({
            where: { id: post.id },
            data: { views, likes, reposts, points: pts, lastScrapedAt: now },
          });
          xPoints += pts;
        } else {
          // TELEGRAM
          const { views, reactions } = await fetchTelegramPostMetrics(post.postLink);
          const pts = views * 0.8 + reactions * 0.2;
          await prisma.poolPost.update({
            where: { id: post.id },
            data: { views, reactions, points: pts, lastScrapedAt: now },
          });
          telegramPoints += pts;
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

    // Detect rank drops and notify outranked participants
    if (prevRankMap.size > 0) {
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

  console.log(`[${new Date().toISOString()}] Scrape cycle complete.`);
}

// Run on schedule every 30 minutes
cron.schedule('*/30 * * * *', scrapeAllActivePools);
console.log('Scraper started — running every 30 minutes');

if (require.main === module) {
  scrapeAllActivePools().catch(console.error);
}
