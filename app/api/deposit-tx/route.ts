import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAuthWallet } from '@/lib/auth';
import { buildDepositTransaction, getJettonDecimals } from '@/lib/gramketing-pool-contract';

/**
 * GET /api/deposit-tx?poolId=...
 *
 * Returns TonConnect transaction parameters for depositing reward tokens into
 * the pool escrow contract. Called from CreatePoolStepper step 3.
 */
export async function GET(req: NextRequest) {
  try {
    const walletAddress = await getAuthWallet(req);
    if (!walletAddress) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const poolId = new URL(req.url).searchParams.get('poolId');
    if (!poolId) {
      return NextResponse.json({ error: 'Missing poolId' }, { status: 400 });
    }

    const pool = await prisma.pool.findUnique({
      where: { id: poolId },
      include: { project: true },
    });

    if (!pool) {
      return NextResponse.json({ error: 'Pool not found' }, { status: 404 });
    }

    if (!pool.contractAddress) {
      return NextResponse.json(
        {
          error: 'Pool contract is being deployed — this usually takes under 2 minutes. Please wait and retry.',
          code: 'CONTRACT_PENDING',
        },
        { status: 400 },
      );
    }

    // Verify requester is the pool owner
    if (pool.project.ownerWalletAddress !== walletAddress) {
      return NextResponse.json({ error: 'Not the pool owner' }, { status: 403 });
    }

    const decimals = await getJettonDecimals(pool.jettonMasterAddress);

    const tx = await buildDepositTransaction({
      jettonMasterAddress: pool.jettonMasterAddress,
      creatorWalletAddress: walletAddress,
      contractAddress: pool.contractAddress,
      totalReward: pool.totalReward,
      decimals,
    });

    return NextResponse.json({ ...tx, decimals });
  } catch (err) {
    console.error('GET /api/deposit-tx error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
