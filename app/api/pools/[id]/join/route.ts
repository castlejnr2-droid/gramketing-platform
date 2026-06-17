import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAuthWallet } from '@/lib/auth';

const REF_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';

async function generateReferralCode(): Promise<string> {
  for (let attempt = 0; attempt < 10; attempt++) {
    const code = Array.from(
      { length: 8 },
      () => REF_CHARS[Math.floor(Math.random() * REF_CHARS.length)]
    ).join('');
    const existing = await prisma.poolParticipant.findUnique({ where: { referralCode: code } });
    if (!existing) return code;
  }
  // Fallback: timestamp-based
  return Date.now().toString(36).toUpperCase().slice(-8).padStart(8, '0');
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const walletAddress = await getAuthWallet(req);
    if (!walletAddress) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const pool = await prisma.pool.findUnique({ where: { id } });
    if (!pool) {
      return NextResponse.json({ error: 'Pool not found' }, { status: 404 });
    }
    if (pool.status === 'PENDING') {
      return NextResponse.json(
        { error: 'Pool is not yet active — the creator has not deposited the reward yet.' },
        { status: 400 }
      );
    }
    if (pool.status !== 'ACTIVE') {
      return NextResponse.json({ error: 'Pool is not active' }, { status: 400 });
    }

    const user = await prisma.user.findUniqueOrThrow({ where: { walletAddress } });

    // Check if already a participant
    const existing = await prisma.poolParticipant.findUnique({
      where: { poolId_userId: { poolId: id, userId: user.id } },
    });

    if (existing) {
      return NextResponse.json({ participant: existing });
    }

    const referralCode = await generateReferralCode();
    const participant = await prisma.poolParticipant.create({
      data: { poolId: id, userId: user.id, referralCode },
    });

    return NextResponse.json({ participant });
  } catch (err) {
    console.error('POST /api/pools/[id]/join error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
