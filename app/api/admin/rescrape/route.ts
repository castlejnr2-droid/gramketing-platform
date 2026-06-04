import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAuthWallet, isAdmin } from '@/lib/auth';
import { fetchXPostMetrics, scrapePoolById } from '@/lib/pool-scraper';
import { calculateXPoints, calculateTelegramPoints } from '@/lib/points';
import { fetchTelegramPostMetrics } from '@/lib/telegram';

export async function POST(req: NextRequest) {
  try {
    const walletAddress = await getAuthWallet(req);
    if (!walletAddress || !isAdmin(walletAddress)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const { submissionId, poolId } = body;

    // Re-scrape a single legacy Submission record
    if (submissionId) {
      const submission = await prisma.submission.findUnique({
        where: { id: submissionId },
        include: { pool: true, user: true },
      });

      if (!submission) {
        return NextResponse.json({ error: 'Submission not found' }, { status: 404 });
      }

      let views = 0, likes = 0, reposts = 0, reactions = 0, points = 0;

      if (submission.platform === 'X') {
        const result = await fetchXPostMetrics(submission.postUrl, submission.currentViews, submission.likes, submission.reposts);
        views = result.views;
        likes = result.likes;
        reposts = result.reposts;
        points = result.ok ? calculateXPoints(views, likes, reposts) : submission.currentPoints;
      } else {
        const metrics = await fetchTelegramPostMetrics(submission.postUrl);
        views = metrics.views;
        reactions = metrics.reactions;
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

    // Re-scrape an entire pool immediately
    if (poolId) {
      const pool = await prisma.pool.findUnique({ where: { id: poolId } });
      if (!pool) {
        return NextResponse.json({ error: 'Pool not found' }, { status: 404 });
      }

      const { scraped, errors } = await scrapePoolById(poolId);

      return NextResponse.json({
        success: true,
        message: `Pool ${poolId} re-scraped: ${scraped} posts updated`,
        errors: errors.length > 0 ? errors : undefined,
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
