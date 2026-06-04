import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAuthWallet } from '@/lib/auth';
import { REFERRAL_BASE_BONUS } from '@/lib/points';
import axios from 'axios';

async function checkTokenBalance(
  walletAddress: string,
  jettonMasterAddress: string
): Promise<bigint> {
  try {
    const res = await axios.get(
      `${process.env.TON_ENDPOINT}/v2/jetton/${jettonMasterAddress}/wallets`,
      { params: { owner_address: walletAddress, limit: 1 } }
    );
    const wallets = res.data?.jetton_wallets ?? [];
    if (wallets.length === 0) return 0n;
    return BigInt(wallets[0].balance ?? '0');
  } catch {
    return 0n;
  }
}

export async function POST(req: NextRequest) {
  try {
    const walletAddress = await getAuthWallet(req);
    if (!walletAddress) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { referralCode, poolId } = await req.json();
    if (!referralCode || !poolId) {
      return NextResponse.json(
        { error: 'Missing referralCode or poolId' },
        { status: 400 }
      );
    }

    // Find the referrer participant by referral code
    const referrerParticipant = await prisma.poolParticipant.findUnique({
      where: { referralCode },
      include: { user: true },
    });

    if (!referrerParticipant) {
      return NextResponse.json({ error: 'Invalid referral code' }, { status: 404 });
    }

    if (referrerParticipant.poolId !== poolId) {
      return NextResponse.json(
        { error: 'Referral code does not match pool' },
        { status: 400 }
      );
    }

    // Get or create the referred user
    const referredUser = await prisma.user.upsert({
      where: { walletAddress },
      update: {},
      create: { walletAddress },
    });

    // Cannot refer yourself
    if (referredUser.id === referrerParticipant.userId) {
      return NextResponse.json({ success: true, message: 'Self-referral ignored' });
    }

    // Check pool is active
    const pool = await prisma.pool.findUnique({ where: { id: poolId } });
    if (!pool || pool.status !== 'ACTIVE') {
      return NextResponse.json({ error: 'Pool is not active' }, { status: 400 });
    }

    // Check if referral already tracked
    const existingBoost = await prisma.referralBoost.findFirst({
      where: {
        referrerId: referrerParticipant.userId,
        referredUserId: referredUser.id,
        poolId,
      },
    });

    if (existingBoost) {
      return NextResponse.json({ success: true, message: 'Referral already tracked' });
    }

    // Add referred user as participant (if not already)
    const existingParticipant = await prisma.poolParticipant.findUnique({
      where: { poolId_userId: { poolId, userId: referredUser.id } },
    });

    if (!existingParticipant) {
      await prisma.poolParticipant.create({
        data: {
          poolId,
          userId: referredUser.id,
          referredByUserId: referrerParticipant.userId,
        },
      });
    }

    // Check if referred user holds the pool's project token
    const holding = await checkTokenBalance(walletAddress, pool.jettonMasterAddress);
    const holdsToken = holding > 0n;

    // Create referral boost record
    const referralBoost = await prisma.referralBoost.create({
      data: {
        referrerId: referrerParticipant.userId,
        referredUserId: referredUser.id,
        poolId,
        referredHolding: holding,
        boostMultiplier: 1.0, // scraper recalculates proportionally
      },
    });

    // Only award bonus points if the referred user holds the pool token
    if (holdsToken) {
      const referrerPool = await prisma.poolParticipant.findUniqueOrThrow({
        where: {
          poolId_userId: { poolId, userId: referrerParticipant.userId },
        },
      });

      await prisma.poolParticipant.update({
        where: { id: referrerPool.id },
        data: {
          referralBonusPoints: { increment: REFERRAL_BASE_BONUS },
        },
      });
    }

    return NextResponse.json({
      success: true,
      referralBoostId: referralBoost.id,
      bonusAwarded: holdsToken,
    });
  } catch (err) {
    console.error('POST /api/referral/track error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
