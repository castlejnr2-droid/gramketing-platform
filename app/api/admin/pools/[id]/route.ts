import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAuthWallet, isAdmin } from '@/lib/auth';
import { calculateDistribution } from '@/lib/distribution';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const walletAddress = await getAuthWallet(req);
    if (!walletAddress || !isAdmin(walletAddress)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;

    const pool = await prisma.pool.findUnique({
      where: { id },
      include: {
        project: {
          select: {
            id: true,
            name: true,
            logoUrl: true,
            ownerWalletAddress: true,
            xUrl: true,
            telegramUrl: true,
          },
        },
        _count: {
          select: { participants: true, submissions: true },
        },
      },
    });

    if (!pool) return NextResponse.json({ error: 'Pool not found' }, { status: 404 });

    const distribution = await calculateDistribution(id);

    return NextResponse.json({
      pool: {
        ...pool,
        tier1Threshold: pool.tier1Threshold.toString(),
        tier2Threshold: pool.tier2Threshold.toString(),
        tier3Threshold: pool.tier3Threshold.toString(),
        participantCount: pool._count.participants,
        submissionCount: pool._count.submissions,
      },
      distribution,
    });
  } catch (err) {
    console.error('GET /api/admin/pools/[id] error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
