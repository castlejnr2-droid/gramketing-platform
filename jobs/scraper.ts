import cron from 'node-cron';
import { PrismaClient } from '@prisma/client';
import axios from 'axios';
import {
  calculateXPoints,
  calculateTelegramPoints,
  calculateTotalPoints,
  REFERRAL_BASE_BONUS,
  CampaignType,
} from '../lib/points';

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

// ── Telegram scraping ─────────────────────────────────────────────────────
interface TelegramMetrics {
  views: number;
  reactions: number;
}

async function fetchTelegramPostMetrics(postUrl: string): Promise<TelegramMetrics> {
  const match = postUrl.match(/t\.me\/([^/]+)\/(\d+)/);
  if (!match) return { views: 0, reactions: 0 };
  const [, chat, msgId] = match;
  try {
    const res = await axios.get(
      `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/getChatHistory`,
      { params: { chat_id: `@${chat}`, from_message_id: parseInt(msgId, 10), limit: 1 } }
    );
    const messages = res.data?.result ?? [];
    if (messages.length > 0) {
      return {
        views: messages[0].views ?? 0,
        reactions: (messages[0].reactions?.results ?? []).reduce(
          (sum: number, r: { count: number }) => sum + (r.count ?? 0),
          0
        ),
      };
    }
    return { views: 0, reactions: 0 };
  } catch {
    return { views: 0, reactions: 0 };
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

  // Scrape active pools
  const activePools = await prisma.pool.findMany({
    where: { status: 'ACTIVE' },
    include: {
      participants: { include: { user: true } },
      submissions: { where: { status: { in: ['PENDING', 'VERIFIED'] } } },
    },
  });

  for (const pool of activePools) {
    console.log(`Scraping pool ${pool.id} (${pool.tokenSymbol})`);
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

    // ── Phase 5: Scrape submissions & compute points ───────────────────
    const submissionsByUser = new Map<string, typeof pool.submissions>();
    for (const sub of pool.submissions) {
      if (!submissionsByUser.has(sub.userId)) submissionsByUser.set(sub.userId, []);
      submissionsByUser.get(sub.userId)!.push(sub);
    }

    for (const participant of pool.participants) {
      const userId = participant.userId;
      const holderBoost = holderBoostMap.get(userId) ?? 1.0;
      const referralMultiplier = referralBoostMap.get(userId) ?? 1.0;

      let xPoints = 0;
      let telegramPoints = 0;

      const subs = submissionsByUser.get(userId) ?? [];
      for (const sub of subs) {
        if (sub.platform === 'X') {
          const { views, likes, reposts } = await fetchXPostMetrics(sub.postUrl);
          const pts = calculateXPoints(views, likes, reposts);
          xPoints += pts;
          await prisma.submission.update({
            where: { id: sub.id },
            data: {
              currentViews: views,
              likes,
              reposts,
              currentPoints: pts,
              lastScrapedAt: now,
              status: 'VERIFIED',
            },
          });
        } else {
          const { views, reactions } = await fetchTelegramPostMetrics(sub.postUrl);
          const pts = calculateTelegramPoints(views, reactions);
          telegramPoints += pts;
          await prisma.submission.update({
            where: { id: sub.id },
            data: {
              currentViews: views,
              reactions,
              currentPoints: pts,
              lastScrapedAt: now,
              status: 'VERIFIED',
            },
          });
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
  }

  console.log(`[${new Date().toISOString()}] Scrape cycle complete.`);
}

// Run on schedule every 30 minutes
cron.schedule('*/30 * * * *', scrapeAllActivePools);
console.log('Scraper started — running every 30 minutes');

if (require.main === module) {
  scrapeAllActivePools().catch(console.error);
}
