import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAuthWallet, isAdmin } from '@/lib/auth';
import { fetchXPostMetrics, scrapePoolById } from '@/lib/pool-scraper';
import { calculateXPoints, calculateTelegramPoints } from '@/lib/points';
import { fetchTelegramPostMetrics } from '@/lib/telegram';
import { logAdminEvent } from '@/lib/admin-log';

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

        if (!result.ok) {
          await logAdminEvent({
            action: 'RESCRAPE',
            level: 'warn',
            poolId: submission.poolId,
            message: `Submission ${submissionId} scrape failed: ${result.error}`,
            details: { submissionId, error: result.error, postUrl: submission.postUrl },
          });
        }
      } else {
        try {
          const metrics = await fetchTelegramPostMetrics(submission.postUrl);
          views = metrics.views;
          reactions = metrics.reactions;
          points = calculateTelegramPoints(views, reactions);
        } catch (tgErr) {
          await logAdminEvent({
            action: 'RESCRAPE',
            level: 'warn',
            poolId: submission.poolId,
            message: `Telegram scrape failed for submission ${submissionId}: ${tgErr instanceof Error ? tgErr.message : String(tgErr)}`,
            details: { submissionId, postUrl: submission.postUrl },
          });
        }
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

      let scraped = 0;
      let errors: string[] = [];

      try {
        ({ scraped, errors } = await scrapePoolById(poolId));
      } catch (scrapeErr) {
        const errMsg = scrapeErr instanceof Error ? scrapeErr.message : String(scrapeErr);
        await logAdminEvent({
          action: 'RESCRAPE',
          level: 'error',
          poolId,
          message: `Pool re-scrape failed: ${errMsg}`,
          details: { error: errMsg },
        });
        return NextResponse.json(
          { error: `Re-scrape failed: ${errMsg}` },
          { status: 500 }
        );
      }

      if (errors.length > 0) {
        await logAdminEvent({
          action: 'RESCRAPE',
          level: 'warn',
          poolId,
          message: `Pool re-scrape completed with ${errors.length} error(s). ${scraped} posts updated.`,
          details: { scraped, errors },
        });
      } else {
        await logAdminEvent({
          action: 'RESCRAPE',
          level: 'info',
          poolId,
          message: `Pool re-scrape complete: ${scraped} posts updated`,
          details: { scraped },
        });
      }

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
