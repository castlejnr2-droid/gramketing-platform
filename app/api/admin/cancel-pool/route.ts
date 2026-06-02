import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAuthWallet, isAdmin } from '@/lib/auth';

export async function POST(req: NextRequest) {
  try {
    const walletAddress = await getAuthWallet(req);
    if (!walletAddress || !isAdmin(walletAddress)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { poolId } = await req.json();
    if (!poolId) {
      return NextResponse.json({ error: 'Missing poolId' }, { status: 400 });
    }

    const pool = await prisma.pool.findUnique({ where: { id: poolId } });
    if (!pool) {
      return NextResponse.json({ error: 'Pool not found' }, { status: 404 });
    }
    if (pool.status === 'DISTRIBUTED') {
      return NextResponse.json(
        { error: 'Cannot cancel an already distributed pool' },
        { status: 400 }
      );
    }

    await prisma.pool.update({
      where: { id: poolId },
      data: { status: 'ENDED' },
    });

    // TODO: Call smart contract cancelPool via TON SDK
    // This triggers refund of deposited tokens to the pool owner
    // send "cancelPool" message to pool.contractAddress from admin wallet

    return NextResponse.json({
      success: true,
      note: 'Pool marked as ENDED. Smart contract cancelPool call not yet implemented.',
    });
  } catch (err) {
    console.error('POST /api/admin/cancel-pool error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
