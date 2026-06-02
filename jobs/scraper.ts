import cron from 'node-cron';
import { PrismaClient } from '@prisma/client';
import axios from 'axios';
import {
  calculateXPoints,
  calculateTelegramPoints,
  calculateTotalPoints,
  getReferralTierMultiplier,
  calculateReferralMultiplier,
  REFERRAL_BASE_BONUS,
  HOLDER_BOOST,
} from '../lib/points';

const prisma = new PrismaClient();

// ── X / Twitter scraping ──────────────────────────────────────────────────
async function fetchXPostViews(postUrl: string): Promise<number> {
  // Extract tweet ID from URL: https://x.com/user/status/123456789
  const match = postUrl.match(/status\/(\d+)/);
  if (!match) return 0;
  const tweetId = match[1];

  try {
    const res = await axios.get(
      `https://api.twitter.com/2/tweets/${tweetId}?tweet.fields=public_metrics`,
      {
        headers: {
          Authorization: `Bearer ${process.env.TWITTER_BEARER_TOKEN}`,
        },
      }
    );
    return res.data?.data?.public_metrics?.impression_count ?? 0;
  } catch (err) {
    console.error(`Failed to fetch tweet ${tweetId}:`, err);
    return 0;
  }
}

// ── Telegram scraping ─────────────────────────────────────────────────────
async function fetchTelegramPostViews(postUrl: string): Promise<number> {
  // URL format: https://t.me/channelname/123
  const match = postUrl.match(/t\.me\/([^/]+)\/(\d+)/);
  if (!match) return 0;
  const [, chat, msgId] = match;

  try {
    // Telegram Bot API: getMessages via forwardMessage is not suitable for view counts.
    // The proper approach is to use the MTProto API (e.g., via gramjs/telethon) to call
    // messages.getHistory or channels.getMessages for the specific post.
    // TODO: implement full Telegram channel message view fetching using MTProto API.
    // For now, attempt a best-effort approach via the Bot API if the bot is an admin:
    const res = await axios.get(
      `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/getChatHistory`,
      {
        params: {
          chat_id: `@${chat}`,
          from_message_id: parseInt(msgId, 10),
          limit: 1,
        },
      }
    );
    const messages = res.data?.result ?? [];
    if (messages.length > 0 && messages[0].views !== undefined) {
      return messages[0].views;
    }
    return 0;
  } catch {
    // Graceful degradation: return 0 if Telegram API is unavailable or bot lacks permissions
    return 0;
  }
}

// ── Holder balance check ──────────────────────────────────────────────────
async function checkHoldsToken(
  walletAddress: string,
  jettonMasterAddress: string
): Promise<boolean> {
  // Query TON RPC to check if walletAddress holds any of jettonMasterAddress
  try {
    const res = await axios.get(
      `${process.env.TON_ENDPOINT}/v2/jetton/${jettonMasterAddress}/wallets`,
      { params: { owner_address: walletAddress, limit: 1 } }
    );
    const wallets = res.data?.jetton_wallets ?? [];
    return wallets.length > 0 && BigInt(wallets[0].balance ?? '0') > 0n;
  } catch {
    return false;
  }
}

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

  // End pools that have expired
  const expiredPools = await prisma.pool.findMany({
    where: { status: 'ACTIVE', endDate: { lte: now } },
  });

  for (const pool of expiredPools) {
    console.log(`Pool ${pool.id} expired — marking ENDED`);
    await saveLeaderboardSnapshot(pool.id);
    await prisma.pool.update({
      where: { id: pool.id },
      data: { status: 'ENDED' },
    });
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

    // Group submissions by participant
    const submissionsByUser = new Map<string, typeof pool.submissions>();
    for (const sub of pool.submissions) {
      if (!submissionsByUser.has(sub.userId))
        submissionsByUser.set(sub.userId, []);
      submissionsByUser.get(sub.userId)!.push(sub);
    }

    for (const participant of pool.participants) {
      const userId = participant.userId;
      const wallet = participant.user.walletAddress;

      // Check holder boost
      const holdsToken = await checkHoldsToken(wallet, pool.jettonMasterAddress);
      const holderBoost = holdsToken ? HOLDER_BOOST : 1.0;

      // Tally points from submissions
      let xPoints = 0;
      let telegramPoints = 0;

      const subs = submissionsByUser.get(userId) ?? [];
      for (const sub of subs) {
        if (sub.platform === 'X') {
          const views = await fetchXPostViews(sub.postUrl);
          const pts = calculateXPoints(views, holdsToken);
          xPoints += pts;
          await prisma.submission.update({
            where: { id: sub.id },
            data: {
              currentViews: views,
              currentPoints: pts,
              lastScrapedAt: now,
              status: 'VERIFIED',
            },
          });
        } else {
          const views = await fetchTelegramPostViews(sub.postUrl);
          const pts = calculateTelegramPoints(views, holdsToken);
          telegramPoints += pts;
          await prisma.submission.update({
            where: { id: sub.id },
            data: {
              currentViews: views,
              currentPoints: pts,
              lastScrapedAt: now,
              status: 'VERIFIED',
            },
          });
        }
      }

      // Recalculate referral multipliers
      const referralBoosts = await prisma.referralBoost.findMany({
        where: { referrerId: userId, poolId: pool.id },
      });

      // Update referred wallet holdings
      for (const boost of referralBoosts) {
        const refUser = await prisma.user.findUnique({
          where: { id: boost.referredUserId },
        });
        if (!refUser) continue;
        const holding = await checkTokenBalance(
          refUser.walletAddress,
          pool.jettonMasterAddress
        );
        const multiplier = getReferralTierMultiplier(holding);
        await prisma.referralBoost.update({
          where: { id: boost.id },
          data: {
            referredHolding: holding,
            boostMultiplier: multiplier,
            updatedAt: now,
          },
        });
      }

      const freshBoosts = await prisma.referralBoost.findMany({
        where: { referrerId: userId, poolId: pool.id },
      });
      const referralMultiplier = calculateReferralMultiplier(freshBoosts);

      const totalPoints = calculateTotalPoints({
        xPoints,
        telegramPoints,
        holderBoost,
        referralMultiplier,
        referralBonusPoints: participant.referralBonusPoints,
      });

      await prisma.poolParticipant.update({
        where: { id: participant.id },
        data: {
          xPoints,
          telegramPoints,
          holderBoost,
          referralMultiplier,
          totalPoints,
        },
      });
    }

    await saveLeaderboardSnapshot(pool.id);
  }

  console.log(`[${new Date().toISOString()}] Scrape cycle complete.`);
}

// Run on schedule every 30 minutes
cron.schedule('*/30 * * * *', scrapeAllActivePools);
console.log('Scraper started — running every 30 minutes');

// Run immediately on start if invoked directly
if (require.main === module) {
  scrapeAllActivePools().catch(console.error);
}
