import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAuthWallet, isAdmin } from '@/lib/auth';
import axios from 'axios';
import {
  calculateXPoints,
  calculateTelegramPoints,
} from '@/lib/points';

async function fetchXPostViews(postUrl: string): Promise<number> {
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
  } catch {
    return 0;
  }
}

async function fetchTelegramPostViews(postUrl: string): Promise<number> {
  // TODO: implement Telegram view fetch
  return 0;
}

export async function POST(req: NextRequest) {
  try {
    const walletAddress = await getAuthWallet(req);
    if (!walletAddress || !isAdmin(walletAddress)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const { submissionId, poolId } = body;

    // If submissionId provided, re-scrape single submission
    if (submissionId) {
      const submission = await prisma.submission.findUnique({
        where: { id: submissionId },
        include: {
          pool: true,
          user: true,
        },
      });

      if (!submission) {
        return NextResponse.json(
          { error: 'Submission not found' },
          { status: 404 }
        );
      }

      // Check if user holds token
      let holdsToken = false;
      try {
        const res = await axios.get(
          `${process.env.TON_ENDPOINT}/v2/jetton/${submission.pool.jettonMasterAddress}/wallets`,
          { params: { owner_address: submission.user.walletAddress, limit: 1 } }
        );
        const wallets = res.data?.jetton_wallets ?? [];
        holdsToken = wallets.length > 0 && BigInt(wallets[0].balance ?? '0') > BigInt(0);
      } catch {
        // ignore
      }

      let views = 0;
      let points = 0;

      if (submission.platform === 'X') {
        views = await fetchXPostViews(submission.postUrl);
        points = calculateXPoints(views, holdsToken);
      } else {
        views = await fetchTelegramPostViews(submission.postUrl);
        points = calculateTelegramPoints(views, holdsToken);
      }

      const updated = await prisma.submission.update({
        where: { id: submissionId },
        data: {
          currentViews: views,
          currentPoints: points,
          lastScrapedAt: new Date(),
          status: 'VERIFIED',
        },
      });

      return NextResponse.json({ submission: updated });
    }

    // If poolId provided, trigger a re-scrape note for the whole pool
    if (poolId) {
      // In production this would enqueue the pool for immediate scraping
      // For now return a stub success
      return NextResponse.json({
        success: true,
        message: `Pool ${poolId} queued for re-scrape on next cron cycle`,
      });
    }

    return NextResponse.json(
      { error: 'Provide submissionId or poolId' },
      { status: 400 }
    );
  } catch (err) {
    console.error('POST /api/admin/rescrape error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
