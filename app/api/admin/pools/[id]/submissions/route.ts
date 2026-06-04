import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAuthWallet, isAdmin } from '@/lib/auth';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const walletAddress = await getAuthWallet(req);
    if (!walletAddress || !isAdmin(walletAddress)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id: poolId } = await params;
    const { searchParams } = new URL(req.url);
    const platform = searchParams.get('platform'); // X | TELEGRAM | null

    const posts = await prisma.poolPost.findMany({
      where: {
        poolId,
        ...(platform ? { platform: platform as 'X' | 'TELEGRAM' } : {}),
      },
      include: {
        participant: {
          include: {
            user: {
              select: {
                walletAddress: true,
                username: true,
                xHandle: true,
                telegramHandle: true,
              },
            },
          },
        },
      },
      orderBy: { points: 'desc' },
    });

    const submissions = posts.map((p) => ({
      id: p.id,
      platform: p.platform,
      postUrl: p.postLink,
      views: p.views,
      likes: p.likes,
      reposts: p.reposts,
      reactions: p.reactions,
      points: p.points,
      submittedAt: p.submittedAt.toISOString(),
      lastScrapedAt: p.lastScrapedAt?.toISOString() ?? null,
      participant: {
        walletAddress: p.participant.user.walletAddress,
        username: p.participant.user.username,
        xHandle: p.participant.user.xHandle,
        telegramHandle: p.participant.user.telegramHandle,
      },
    }));

    return NextResponse.json({ submissions });
  } catch (err) {
    console.error('GET /api/admin/pools/[id]/submissions error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
