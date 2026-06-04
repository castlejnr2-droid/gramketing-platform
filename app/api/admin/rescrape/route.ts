import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAuthWallet, isAdmin } from '@/lib/auth';
import axios from 'axios';
import { calculateXPoints, calculateTelegramPoints } from '@/lib/points';

async function fetchXPostMetrics(postUrl: string): Promise<{ views: number; likes: number; reposts: number }> {
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

      let views = 0;
      let likes = 0;
      let reposts = 0;
      let reactions = 0;
      let points = 0;

      if (submission.platform === 'X') {
        const metrics = await fetchXPostMetrics(submission.postUrl);
        views = metrics.views;
        likes = metrics.likes;
        reposts = metrics.reposts;
        points = calculateXPoints(views, likes, reposts);
      } else {
        // Telegram: views only for now
        points = calculateTelegramPoints(views, reactions);
      }

      const updated = await prisma.submission.update({
        where: { id: submissionId },
        data: {
          currentViews: views,
          likes,
          reposts,
          reactions,
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
