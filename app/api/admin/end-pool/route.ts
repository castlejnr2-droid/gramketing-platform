import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAuthWallet, isAdmin } from '@/lib/auth';
import { sendEndPool } from '@/lib/gramketing-pool-contract';

export async function POST(req: NextRequest) {
  try {
    const walletAddress = await getAuthWallet(req);
    if (!walletAddress || !isAdmin(walletAddress)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { poolId } = await req.json();
    if (!poolId) return NextResponse.json({ error: 'Missing poolId' }, { status: 400 });

    const pool = await prisma.pool.findUnique({ where: { id: poolId } });
    if (!pool) return NextResponse.json({ error: 'Pool not found' }, { status: 404 });
    if (pool.status !== 'ACTIVE') {
      return NextResponse.json({ error: 'Pool is not active' }, { status: 400 });
    }
    if (!pool.contractAddress) {
      return NextResponse.json({ error: 'Pool has no contract address' }, { status: 400 });
    }

    await sendEndPool(pool.contractAddress);
    await prisma.pool.update({ where: { id: poolId }, data: { status: 'ENDED' } });

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('POST /api/admin/end-pool error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
