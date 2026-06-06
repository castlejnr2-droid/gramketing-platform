import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import axios from 'axios';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const pool = await prisma.pool.findUnique({
      where: { id },
      select: { contractAddress: true, jettonMasterAddress: true, totalReward: true },
    });

    if (!pool) {
      return NextResponse.json({ error: 'Pool not found' }, { status: 404 });
    }

    if (!pool.contractAddress) {
      return NextResponse.json({ deposited: false, balance: '0' });
    }

    // Check the contract's jetton wallet balance on-chain
    try {
      const res = await axios.get(
        `${process.env.TON_ENDPOINT}/v2/jetton/${pool.jettonMasterAddress}/wallets`,
        {
          params: { owner_address: pool.contractAddress, limit: 1 },
          timeout: 8_000,
        }
      );
      const wallets = res.data?.jetton_wallets ?? [];
      const balance = wallets.length > 0 ? wallets[0].balance ?? '0' : '0';
      const deposited = BigInt(balance) > 0n;

      return NextResponse.json({ deposited, balance });
    } catch {
      // TON API error - return unknown status
      return NextResponse.json({ deposited: false, balance: '0', apiError: true });
    }
  } catch (err) {
    console.error('GET /api/pools/[id]/deposit-status error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
