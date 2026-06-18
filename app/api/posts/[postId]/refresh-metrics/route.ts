/**
 * POST /api/posts/[postId]/refresh-metrics
 *
 * Force-refreshes metrics for a specific PoolPost, bypassing the 25-min cache.
 * Requires auth — only the post owner or an admin may call this.
 * Returns the updated metrics so the UI can reflect them immediately.
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAuthWallet, isAdmin } from '@/lib/auth';
import { fetchTweetMetrics, extractTweetId } from '@/lib/twitter-api';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ postId: string }> },
) {
  try {
    const { postId } = await params;
    const walletAddress = await getAuthWallet(req);
    if (!walletAddress) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Load the post with its participant's user
    const post = await prisma.poolPost.findUnique({
      where: { id: postId },
      include: {
        participant: {
          include: { user: { select: { walletAddress: true } } },
        },
      },
    });

    if (!post) {
      return NextResponse.json({ error: 'Post not found' }, { status: 404 });
    }

    // Only owner or admin
    const isOwner = post.participant.user.walletAddress === walletAddress;
    if (!isOwner && !isAdmin(walletAddress)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    if (post.platform !== 'X') {
      return NextResponse.json(
        { error: 'refresh-metrics is only supported for X posts' },
        { status: 400 },
      );
    }

    const tweetId = extractTweetId(post.postLink);
    if (!tweetId) {
      return NextResponse.json(
        { error: 'Cannot extract tweet ID from post URL' },
        { status: 400 },
      );
    }

    // ── Fetch fresh metrics, bypassing cache ──────────────────────────────────
    const [result] = await fetchTweetMetrics([tweetId], { bypassCache: true });

    if (!result.ok) {
      return NextResponse.json(
        { error: `Twitter API error: ${result.error}`, tweetId },
        { status: result.error === 'TOKEN_EXPIRED' ? 502 : 422 },
      );
    }

    // ── Recalculate points ────────────────────────────────────────────────────
    const pts =
      result.views >= 100
        ? result.views * 0.8 + result.likes * 0.1 + result.retweets * 0.1
        : post.points;

    const updated = await prisma.poolPost.update({
      where: { id: postId },
      data: {
        views: result.views,
        likes: result.likes,
        reposts: result.retweets,
        points: pts,
        lastScrapedAt: new Date(),
        scrapeError: null,
      },
    });

    console.log(
      `[refresh-metrics] post ${postId}: views=${result.views} likes=${result.likes} reposts=${result.retweets} pts=${pts.toFixed(0)} (was views=${post.views} pts=${post.points.toFixed(0)})`,
    );

    return NextResponse.json({
      postId,
      tweetId,
      fromCache: false,
      views: updated.views,
      likes: updated.likes,
      reposts: updated.reposts,
      points: updated.points,
      lastScrapedAt: updated.lastScrapedAt,
    });
  } catch (err) {
    console.error('POST /api/posts/[postId]/refresh-metrics error:', err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
