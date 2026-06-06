import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAuthWallet, isAdmin } from '@/lib/auth';

export async function GET(req: NextRequest) {
  try {
    const walletAddress = await getAuthWallet(req);
    if (!walletAddress || !isAdmin(walletAddress)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const status = searchParams.get('status');
    const search = searchParams.get('search');

    const where: Record<string, unknown> = {};
    if (status && ['ACTIVE', 'ENDED', 'DISTRIBUTED'].includes(status)) {
      where.status = status;
    }
    if (search) {
      where.OR = [
        { project: { name: { contains: search, mode: 'insensitive' } } },
        { tokenSymbol: { contains: search, mode: 'insensitive' } },
      ];
    }

    const pools = await prisma.pool.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        project: { select: { name: true, logoUrl: true, ownerWalletAddress: true } },
        _count: { select: { participants: true, submissions: true } },
      },
    });

    const poolsWithCount = pools.map((p) => ({
      ...p,
      // BigInt fields must be serialised - convert to string
      tier1Threshold: p.tier1Threshold.toString(),
      tier2Threshold: p.tier2Threshold.toString(),
      tier3Threshold: p.tier3Threshold.toString(),
      participantCount: p._count.participants,
      submissionCount: p._count.submissions,
    }));

    return NextResponse.json({ pools: poolsWithCount });
  } catch (err) {
    console.error('GET /api/admin/pools error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
