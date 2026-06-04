import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAuthWallet, isAdmin } from '@/lib/auth';

export async function GET(req: NextRequest) {
  try {
    const walletAddress = await getAuthWallet(req);
    if (!walletAddress || !isAdmin(walletAddress)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const [
      poolCounts,
      totalParticipants,
      totalSubmissions,
      needsAction,
      revenue,
      bannedCount,
    ] = await Promise.all([
      // Pool counts by status
      prisma.pool.groupBy({ by: ['status'], _count: { _all: true } }),

      // Total participants across all pools
      prisma.poolParticipant.count(),

      // Total submissions
      prisma.poolPost.count(),

      // Pools needing admin action: ENDED (ready to distribute) or ACTIVE past end date
      prisma.pool.findMany({
        where: {
          OR: [
            { status: 'ENDED' },
            { status: 'ACTIVE', endDate: { lte: new Date() } },
          ],
        },
        include: {
          project: { select: { name: true, logoUrl: true } },
          _count: { select: { participants: true } },
        },
        orderBy: { endDate: 'asc' },
        take: 10,
      }),

      // Revenue totals
      prisma.platformRevenue.findMany({ orderBy: { createdAt: 'desc' }, take: 20 }),

      // Banned count
      prisma.bannedMarketer.count(),
    ]);

    // Aggregate pool counts
    const counts: Record<string, number> = { ACTIVE: 0, ENDED: 0, DISTRIBUTED: 0 };
    for (const g of poolCounts) counts[g.status] = g._count._all;

    // Revenue totals
    const tonRecords    = revenue.filter((r) => r.currency === 'TON');
    const mgramRecords  = revenue.filter((r) => r.currency === 'MGRAM');
    const tonUsd        = tonRecords.reduce((s, r) => s + r.usdValueAtTime, 0);
    const mgramUsd      = mgramRecords.reduce((s, r) => s + r.usdValueAtTime, 0);
    const tonTokens     = tonRecords.reduce((s, r) => s + parseFloat(r.tokenAmount), 0);
    const mgramTokens   = mgramRecords.reduce((s, r) => s + parseFloat(r.tokenAmount), 0);

    return NextResponse.json({
      pools: {
        total: counts.ACTIVE + counts.ENDED + counts.DISTRIBUTED,
        active: counts.ACTIVE,
        ended: counts.ENDED,
        distributed: counts.DISTRIBUTED,
      },
      participants: totalParticipants,
      submissions: totalSubmissions,
      needsAction: needsAction.map((p) => ({
        id: p.id,
        status: p.status,
        project: p.project,
        tokenSymbol: p.tokenSymbol,
        totalReward: p.totalReward,
        endDate: p.endDate.toISOString(),
        participantCount: p._count.participants,
      })),
      revenue: {
        totalUsd: tonUsd + mgramUsd,
        ton: {
          tokens: tonTokens,
          usd: tonUsd,
          recentRecords: tonRecords.slice(0, 5).map((r) => ({
            id: r.id,
            tokenAmount: r.tokenAmount,
            usdValueAtTime: r.usdValueAtTime,
            createdAt: r.createdAt.toISOString(),
          })),
        },
        mgram: {
          tokens: mgramTokens,
          usd: mgramUsd,
          recentRecords: mgramRecords.slice(0, 5).map((r) => ({
            id: r.id,
            tokenAmount: r.tokenAmount,
            usdValueAtTime: r.usdValueAtTime,
            createdAt: r.createdAt.toISOString(),
          })),
        },
      },
      bannedCount,
    });
  } catch (err) {
    console.error('GET /api/admin/summary error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
