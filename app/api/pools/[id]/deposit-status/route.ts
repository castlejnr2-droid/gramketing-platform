import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAuthWallet } from '@/lib/auth';
import axios from 'axios';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    // Auth: only the pool owner may poll deposit status
    const walletAddress = await getAuthWallet(req);
    if (!walletAddress) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const pool = await prisma.pool.findUnique({
      where: { id },
      select: {
        contractAddress: true,
        jettonMasterAddress: true,
        totalReward: true,
        status: true,
        project: { select: { ownerWalletAddress: true } },
      },
    });

    if (!pool) {
      return NextResponse.json({ error: 'Pool not found' }, { status: 404 });
    }

    if (pool.project.ownerWalletAddress !== walletAddress) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    if (!pool.contractAddress) {
      return NextResponse.json({ funded: false, balance: '0' });
    }

    // Check the contract's jetton wallet balance on-chain
    let balance: string;
    try {
      const res = await axios.get(
        `${process.env.TONAPI_ENDPOINT ?? 'https://tonapi.io'}/v2/jetton/${pool.jettonMasterAddress}/wallets`,
        {
          params: { owner_address: pool.contractAddress, limit: 1 },
          timeout: 8_000,
        }
      );
      const wallets = res.data?.jetton_wallets ?? [];
      balance = wallets.length > 0 ? (wallets[0].balance ?? '0') : '0';
    } catch {
      // TON API error — return unknown status
      return NextResponse.json({ funded: false, balance: '0', apiError: true });
    }

    // A pool is "funded" when the on-chain balance covers the full reward amount
    const funded = BigInt(balance) >= BigInt(pool.totalReward);

    // Flip PENDING → ACTIVE once the deposit is confirmed
    if (funded && pool.status === 'PENDING') {
      await prisma.pool.update({
        where: { id },
        data: { status: 'ACTIVE' },
      });
    }

    return NextResponse.json({ funded, balance });
  } catch (err) {
    console.error('GET /api/pools/[id]/deposit-status error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
