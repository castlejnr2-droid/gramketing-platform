import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAuthWallet, isAdmin } from '@/lib/auth';
import { sendEndPool } from '@/lib/gramketing-pool-contract';
import { logAdminEvent } from '@/lib/admin-log';

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

    // Send on-chain endPool message (if contract is deployed)
    if (pool.contractAddress) {
      try {
        await sendEndPool(pool.contractAddress);
      } catch (chainErr) {
        const errMsg = chainErr instanceof Error ? chainErr.message : String(chainErr);
        await logAdminEvent({
          action: 'END_POOL',
          level: 'warn',
          poolId,
          message: `On-chain endPool message failed (pool will still be marked ENDED in DB): ${errMsg}`,
          details: { error: errMsg, contractAddress: pool.contractAddress },
        });
        // Continue — DB status is the source of truth for admin actions.
        // Distribution message works regardless of on-chain pool state.
      }
    } else {
      await logAdminEvent({
        action: 'END_POOL',
        level: 'warn',
        poolId,
        message: 'Pool ended without a deployed contract — no on-chain state change sent',
      });
    }

    // Mark ENDED in DB
    await prisma.pool.update({ where: { id: poolId }, data: { status: 'ENDED' } });

    await logAdminEvent({
      action: 'END_POOL',
      level: 'info',
      poolId,
      message: `Pool marked ENDED by admin ${walletAddress}`,
      details: { adminWallet: walletAddress },
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('POST /api/admin/end-pool error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
