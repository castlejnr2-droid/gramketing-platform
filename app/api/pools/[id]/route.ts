import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function serializePool(pool: any) {
  if (!pool) return pool;
  return {
    ...pool,
    slug: pool.slug ?? null,
    tier1Threshold: pool.tier1Threshold?.toString() ?? '0',
    tier2Threshold: pool.tier2Threshold?.toString() ?? '0',
    tier3Threshold: pool.tier3Threshold?.toString() ?? '0',
  };
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const pool = await prisma.pool.findFirst({
      where: { OR: [{ id }, { slug: id }] },
      include: {
        project: {
          select: {
            id: true,
            name: true,
            logoUrl: true,
            description: true,
            tokenSymbol: true,
            ownerWalletAddress: true,
          },
        },
        _count: { select: { participants: true } },
        leaderboardSnapshots: {
          orderBy: { snapshotAt: 'desc' },
          take: 1,
          select: { rankings: true, snapshotAt: true },
        },
      },
    });

    if (!pool) {
      return NextResponse.json({ error: 'Pool not found' }, { status: 404 });
    }

    return NextResponse.json({ pool: serializePool(pool) });
  } catch (err) {
    console.error('GET /api/pools/[id] error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
