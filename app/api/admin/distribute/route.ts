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
        message: 'Distribution aborted - no eligible winners (all participants have 0 points)',
      });
      return NextResponse.json({ error: 'No eligible winners found' }, { status: 400 });
    }

    // ── Step 2: Log and validate the winner list ─────────────────────────────
    // Print exactly what will be sent to the contract, before touching the chain.
    console.log(`[distribute] Pool ${poolId} - ${winners.length} winner(s) (pool.rewardSlots=${pool.rewardSlots}):`);
    console.log(`[distribute] pool.totalReward (DB) = ${pool.totalReward}`);
    for (let i = 0; i < winners.length; i++) {
      const w = winners[i];
      console.log(
        `[distribute]   [${i + 1}] wallet=${w.walletAddress}` +
        `  bps=${w.shareBasisPoints}  tokenAmount=${w.tokenAmount}  points=${w.totalPoints}`,
      );
    }

    // Validate every wallet address parses as a valid TON address
    const badAddresses: string[] = [];
    for (const w of winners) {
      try {
        Address.parse(w.walletAddress);
      } catch {
        badAddresses.push(w.walletAddress);
      }
    }
    if (badAddresses.length > 0) {
      const msg = `${badAddresses.length} winner(s) have unparseable TON wallet address(es): ${badAddresses.join(', ')}`;
      await logAdminEvent({
        action: 'DISTRIBUTE_REWARDS', level: 'error', poolId, message: msg,
        details: { badAddresses },
      });
      return NextResponse.json({ error: msg }, { status: 400 });
    }

    // ── Step 3: Pre-flight on-chain check ────────────────────────────────────
    // Verify depositedAmount > 0 before sending anything - the contract computes
    // amounts as (depositedAmount * bps / 10000), so if depositedAmount is 0
    // every winner receives 0 tokens even though the transaction succeeds.
    let onChainInfo;
    try {
      onChainInfo = await fetchOnChainPoolInfo(pool.contractAddress);
    } catch (rpcErr) {
      const errMsg = rpcErr instanceof Error ? rpcErr.message : String(rpcErr);
      await logAdminEvent({
        action: 'DISTRIBUTE_REWARDS', level: 'error', poolId,
        message: `Failed to read on-chain pool state: ${errMsg}`,
        details: { error: errMsg, contractAddress: pool.contractAddress },
      });
      return NextResponse.json(
        { error: `Cannot read contract state before distributing: ${errMsg}` },
        { status: 502 },
      );
    }

    console.log(
      `[distribute] On-chain: depositedAmount=${onChainInfo.depositedAmount}` +
      `  status=${onChainInfo.status}` +
      `  jettonWallet=${onChainInfo.jettonWalletAddress.toString({ bounceable: true, urlSafe: true })}`,
    );

    if (onChainInfo.depositedAmount === 0n) {
      const msg =
        `Contract depositedAmount is 0 - deposit ${pool.tokenSymbol} to ${pool.contractAddress} first. ` +
        `Every winner would receive 0 tokens if distribution runs now.`;
      await logAdminEvent({
        action: 'DISTRIBUTE_REWARDS', level: 'error', poolId, message: msg,
        details: { contractAddress: pool.contractAddress, depositedAmount: '0' },
      });
      return NextResponse.json({ error: msg }, { status: 400 });
    }

    if (onChainInfo.status === 2n) {
      const msg = 'Contract is already in DISTRIBUTED state on-chain - cannot redistribute';
      await logAdminEvent({
        action: 'DISTRIBUTE_REWARDS', level: 'error', poolId, message: msg,
      });
      return NextResponse.json({ error: msg }, { status: 400 });
    }

    // Fetch decimals dynamically so the log reflects the correct token scale
    const tokenDecimals = await getJettonDecimals(pool.jettonMasterAddress);
    const tokenDivisor = Math.pow(10, tokenDecimals);

    // Log what the contract will actually compute per winner
    console.log(`[distribute] Contract will compute amounts from depositedAmount=${onChainInfo.depositedAmount}:`);
    for (const w of winners) {
      const contractAmount = (onChainInfo.depositedAmount * BigInt(w.shareBasisPoints)) / 10000n;
      console.log(
        `[distribute]   wallet=${w.walletAddress}  bps=${w.shareBasisPoints}` +
        `  => ${contractAmount} nano (${Number(contractAmount) / tokenDivisor} ${pool.tokenSymbol})`,
      );
    }

    // ── Step 4: Send DistributeRewards to the contract ───────────────────────
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
        message: `On-chain DistributeRewards transaction failed: ${errMsg}`,
        details: { error: errMsg, contractAddress: pool.contractAddress, winnerCount: winners.length },
      });
      return NextResponse.json({ error: `On-chain distribution failed: ${errMsg}` }, { status: 502 });
    }

    // ── Step 5: Mark pool distributed in DB ──────────────────────────────────
    const updatedPool = await prisma.pool.update({
      where: { id: poolId },
      data: { status: 'DISTRIBUTED' },
      include: { project: true },
    });

    await logAdminEvent({
      action: 'DISTRIBUTE_REWARDS', level: 'info', poolId,
      message: `Distribution complete - ${winners.length} winner(s) paid from contract ${pool.contractAddress}`,
      details: {
        contractAddress: pool.contractAddress,
        depositedAmount: onChainInfo.depositedAmount.toString(),
        winnerCount: winners.length,
        winners: winners.map((w) => ({
          wallet: w.walletAddress,
          basisPoints: w.shareBasisPoints,
          contractAmount: ((onChainInfo.depositedAmount * BigInt(w.shareBasisPoints)) / 10000n).toString(),
        })),
      },
    });

    // Notify each winner (fire-and-forget)
    const poolName = updatedPool.project.name;
    for (const winner of winners) {
      notifyRewardsDistributed(winner.userId, poolName, winner.tokenAmount ?? '0').catch(console.error);
    }

    return NextResponse.json({ success: true, winners, totalWinners: winners.length });
  } catch (err) {
    console.error('POST /api/admin/distribute error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
