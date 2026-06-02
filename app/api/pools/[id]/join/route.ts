import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAuthWallet } from '@/lib/auth';

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const walletAddress = await getAuthWallet(req);
    if (!walletAddress) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const pool = await prisma.pool.findUnique({ where: { id: params.id } });
    if (!pool) {
      return NextResponse.json({ error: 'Pool not found' }, { status: 404 });
    }
    if (pool.status !== 'ACTIVE') {
      return NextResponse.json({ error: 'Pool is not active' }, { status: 400 });
    }

    const user = await prisma.user.findUniqueOrThrow({
      where: { walletAddress },
    });

    // Upsert participant (idempotent join)
    const participant = await prisma.poolParticipant.upsert({
      where: { poolId_userId: { poolId: params.id, userId: user.id } },
      update: {},
      create: {
        poolId: params.id,
        userId: user.id,
      },
    });

    return NextResponse.json({ participant });
  } catch (err) {
    console.error('POST /api/pools/[id]/join error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
