import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAuthWallet, isAdmin } from '@/lib/auth';

export async function GET(req: NextRequest) {
  try {
    const walletAddress = await getAuthWallet(req);
    if (!walletAddress || !isAdmin(walletAddress)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const pools = await prisma.pool.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        project: { select: { name: true } },
        _count: { select: { participants: true } },
      },
    });

    const poolsWithCount = pools.map((p) => ({
      ...p,
      participantCount: p._count.participants,
    }));

    return NextResponse.json({ pools: poolsWithCount });
  } catch (err) {
    console.error('GET /api/admin/pools error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
