import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const pool = await prisma.pool.findUnique({
      where: { id: params.id },
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

    return NextResponse.json({ pool });
  } catch (err) {
    console.error('GET /api/pools/[id] error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
