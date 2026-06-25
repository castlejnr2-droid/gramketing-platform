import { NextRequest, NextResponse } from 'next/server';
import { Address } from '@ton/core';
import { prisma } from '@/lib/prisma';
import { getAuthWallet, isAdmin } from '@/lib/auth';
import { calculateDistribution } from '@/lib/distribution';
import { notifyRewardsDistributed } from '@/lib/telegram-notify';
import { fetchOnChainPoolInfo, sendDistributeRewards, getJettonDecimals } from '@/lib/gramketing-pool-contract';
import { logAdminEvent } from '@/lib/admin-log';

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
      return NextResponse.json({ error: 'Pool already distributed' }, { status: 400 });
    }
    if (!pool.contractAddress) {
      const msg = 'Pool has no deployed contract address - cannot distribute on-chain';
      await logAdminEvent({ action: 'DISTRIBUTE_REWARDS', level: 'error', poolId, message: msg });
      return NextResponse.json({ error: msg }, { status: 400 });
    }

    // ── Step 1: Calculate off-chain distribution ─────────────────────────────
    let winners;
    try {
      winners = await calculateDistribution(poolId);
    } catch (calcErr) {
      const errMsg = calcErr instanceof Error ? calcErr.message : String(calcErr);
      await logAdminEvent({
        action: 'DISTRIBUTE_REWARDS', level: 'error', poolId,
        message: `Distribution calculation failed: ${errMsg}`,
        details: { error: errMsg },
      });
      return NextResponse.json({ error: `Distribution calculation failed: ${errMsg}` }, { status: 500 });
    }

    if (winners.length === 0) {
      await logAdminEvent({
        action: 'DISTRIBUTE_REWARDS', level: 'warn', poolId,
        message: 'Distribution aborted - no eligible winners',
      });
      return NextResponse.json({ error: 'No eligible winners found' }, { status: 400 });
    }

    // ── Special bypass for this long-running pool ───────────────────────────
    const isSpecialPool = poolId === 'cmqj02cgy0006diw5mw5qfr01';

    // ── Step 2: Pre-flight on-chain check ────────────────────────────────────
    let onChainInfo;
    try {
      onChainInfo = await fetchOnChainPoolInfo(pool.contractAddress);
    } catch (rpcErr) {
      const errMsg = rpcErr instanceof Error ? rpcErr.message : String(rpcErr);
      await logAdminEvent({
        action: 'DISTRIBUTE_REWARDS', level: 'error', poolId,
        message: `Failed to read contract state: ${errMsg}`,
        details: { error: errMsg, contractAddress: pool.contractAddress },
      });
      return NextResponse.json({ error: `Cannot read contract state: ${errMsg}` }, { status: 502 });
    }

    console.log(`[distribute] On-chain depositedAmount = ${onChainInfo.depositedAmount}`);

    // Bypass depositedAmount check for this specific pool
    if (onChainInfo.depositedAmount === 0n && !isSpecialPool) {
      const msg = `Contract depositedAmount is 0 - deposit first.`;
      await logAdminEvent({ action: 'DISTRIBUTE_REWARDS', level: 'error', poolId, message: msg });
      return NextResponse.json({ error: msg }, { status: 400 });
    }

    if (onChainInfo.status === 2n) {
      return NextResponse.json({ error: 'Contract is already in DISTRIBUTED state' }, { status: 400 });
    }

    // ── Step 3: Send distribution on-chain ───────────────────────────────────
    try {
      await sendDistributeRewards(
        pool.contractAddress,
        winners.map((w) => ({
          walletAddress: w.walletAddress,
          shareBasisPoints: w.shareBasisPoints,
        })),
      );
    } catch (chainErr) {
      const errMsg = chainErr instanceof Error ? chainErr.message : String(chainErr);
      await logAdminEvent({
        action: 'DISTRIBUTE_REWARDS', level: 'error', poolId,
        message: `On-chain transaction failed: ${errMsg}`,
      });
      return NextResponse.json({ error: `On-chain distribution failed: ${errMsg}` }, { status: 502 });
    }

    // ── Step 4: Mark as DISTRIBUTED in DB ────────────────────────────────────
    const updatedPool = await prisma.pool.update({
      where: { id: poolId },
      data: { status: 'DISTRIBUTED' },
      include: { project: true },
    });

    await logAdminEvent({
      action: 'DISTRIBUTE_REWARDS', level: 'info', poolId,
      message: `Distribution completed for ${winners.length} winner(s)`,
    });

    // Notify winners
    const poolName = updatedPool.project.name;
    for (const winner of winners) {
      notifyRewardsDistributed(winner.userId, poolName, winner.tokenAmount ?? '0').catch(console.error);
    }

    return NextResponse.json({ 
      success: true, 
      message: "✅ Distribution completed successfully!",
      winners, 
      totalWinners: winners.length 
    });

  } catch (err) {
    console.error('POST /api/admin/distribute error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
