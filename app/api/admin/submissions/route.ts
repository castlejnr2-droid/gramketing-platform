import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAuthWallet, isAdmin } from '@/lib/auth';

const PAGE_SIZE = 50;

export async function GET(req: NextRequest) {
  try {
    const walletAddress = await getAuthWallet(req);
    if (!walletAddress || !isAdmin(walletAddress)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const platform  = searchParams.get('platform');   // X | TELEGRAM
    const poolId    = searchParams.get('poolId');
    const search    = searchParams.get('search');      // post URL or wallet
    const sortBy    = searchParams.get('sortBy') ?? 'submittedAt'; // points | views | submittedAt
    const page      = Math.max(1, parseInt(searchParams.get('page') ?? '1'));

    const where: Record<string, unknown> = {};

    if (platform && ['X', 'TELEGRAM'].includes(platform)) {
      where.platform = platform;
    }
    if (poolId) {
      where.poolId = poolId;
    }
    if (search) {
      where.OR = [
        { postLink: { contains: search, mode: 'insensitive' } },
        { participant: { user: { walletAddress: { contains: search, mode: 'insensitive' } } } },
        { participant: { user: { xHandle:        { contains: search, mode: 'insensitive' } } } },
        { participant: { user: { telegramHandle: { contains: search, mode: 'insensitive' } } } },
      ];
    }

    const orderBy =
      sortBy === 'points'      ? { points: 'desc' as const } :
      sortBy === 'views'       ? { views: 'desc' as const }  :
      sortBy === 'lastScraped' ? { lastScrapedAt: 'desc' as const } :
                                 { submittedAt: 'desc' as const };

    const [posts, total] = await Promise.all([
      prisma.poolPost.findMany({
        where,
        orderBy,
        skip: (page - 1) * PAGE_SIZE,
        take: PAGE_SIZE,
        include: {
          pool: {
            select: {
              id: true,
              tokenSymbol: true,
              status: true,
              project: { select: { name: true } },
            },
          },
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
      }),
      prisma.poolPost.count({ where }),
    ]);

    // Aggregate stats (unfiltered totals for the header)
    const [statsTotal, statsX, statsTG, statsPoints] = await Promise.all([
      prisma.poolPost.count(),
      prisma.poolPost.count({ where: { platform: 'X' } }),
      prisma.poolPost.count({ where: { platform: 'TELEGRAM' } }),
      prisma.poolPost.aggregate({ _avg: { points: true }, _sum: { points: true } }),
    ]);

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
      pool: {
        id: p.pool.id,
        name: p.pool.project.name,
        tokenSymbol: p.pool.tokenSymbol,
        status: p.pool.status,
      },
      participant: {
        walletAddress: p.participant.user.walletAddress,
        username: p.participant.user.username,
        xHandle: p.participant.user.xHandle,
        telegramHandle: p.participant.user.telegramHandle,
      },
    }));

    return NextResponse.json({
      submissions,
      pagination: {
        page,
        pageSize: PAGE_SIZE,
        total,
        totalPages: Math.ceil(total / PAGE_SIZE),
      },
      stats: {
        total: statsTotal,
        x: statsX,
        telegram: statsTG,
        avgPoints: Math.round(statsPoints._avg.points ?? 0),
        totalPoints: Math.round(statsPoints._sum.points ?? 0),
      },
    });
  } catch (err) {
    console.error('GET /api/admin/submissions error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
