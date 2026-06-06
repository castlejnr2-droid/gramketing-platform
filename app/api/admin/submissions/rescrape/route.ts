import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAuthWallet, isAdmin } from '@/lib/auth';
import { fetchTelegramPostMetrics } from '@/lib/telegram';
import { fetchTweetMetrics, extractTweetId } from '@/lib/twitter-api';
import { calculateXPoints, calculateTelegramPoints } from '@/lib/points';

export async function POST(req: NextRequest) {
  try {
    const walletAddress = await getAuthWallet(req);
    if (!walletAddress || !isAdmin(walletAddress)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { poolPostId } = await req.json();
    if (!poolPostId) return NextResponse.json({ error: 'Missing poolPostId' }, { status: 400 });

    const post = await prisma.poolPost.findUnique({ where: { id: poolPostId } });
    if (!post) return NextResponse.json({ error: 'Post not found' }, { status: 404 });

    let views = post.views, likes = post.likes, reposts = post.reposts,
        reactions = post.reactions, points = post.points;

    if (post.platform === 'X') {
      const tweetId = extractTweetId(post.postLink);
      if (tweetId) {
        const [result] = await fetchTweetMetrics([tweetId]);
        if (result.ok) {
          views = result.views; likes = result.likes; reposts = result.retweets;
          points = calculateXPoints(views, likes, reposts);
        }
      }
    } else {
      const m = await fetchTelegramPostMetrics(post.postLink);
      views = m.views; reactions = m.reactions;
      points = calculateTelegramPoints(views, reactions);
    }

    const updated = await prisma.poolPost.update({
      where: { id: poolPostId },
      data: { views, likes, reposts, reactions, points, lastScrapedAt: new Date() },
    });

    // Update participant aggregate points
    const participant = await prisma.poolParticipant.findUnique({
      where: { id: post.participantId },
      include: { poolPosts: true },
    });
    if (participant) {
      const xPts  = participant.poolPosts.filter((p) => p.platform === 'X').reduce((s, p) => s + (p.id === poolPostId ? points : p.points), 0);
      const tgPts = participant.poolPosts.filter((p) => p.platform === 'TELEGRAM').reduce((s, p) => s + (p.id === poolPostId ? points : p.points), 0);
      const total = xPts * participant.holderBoost * participant.referralMultiplier
                  + tgPts * participant.holderBoost * participant.referralMultiplier
                  + participant.referralBonusPoints;
      await prisma.poolParticipant.update({
        where: { id: participant.id },
        data: { xPoints: xPts, telegramPoints: tgPts, totalPoints: total },
      });
    }

    return NextResponse.json({
      success: true,
      post: {
        id: updated.id,
        views: updated.views,
        likes: updated.likes,
        reposts: updated.reposts,
        reactions: updated.reactions,
        points: updated.points,
        lastScrapedAt: updated.lastScrapedAt?.toISOString() ?? null,
      },
    });
  } catch (err) {
    console.error('POST /api/admin/submissions/rescrape error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
