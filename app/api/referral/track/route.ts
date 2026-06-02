import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAuthWallet } from '@/lib/auth';
import { getReferralTierMultiplier, REFERRAL_BASE_BONUS } from '@/lib/points';

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
      where: {
        poolId_userId: { poolId, userId: referredUser.id },
      },
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
    // (token balance checked lazily — will be updated by next scrape cycle)
    // For now, create the ReferralBoost with tier 1 defaults; scraper will update
    const referralBoost = await prisma.referralBoost.create({
      data: {
        referrerId: referrerParticipant.userId,
        referredUserId: referredUser.id,
        poolId,
        referredHolding: 0n,
        boostMultiplier: 1.0,
      },
    });

    // TODO: Check token holding immediately via RPC
    // If referred user holds the pool token, award bonus points to referrer
    // For now we award the bonus and the scraper will validate on next cycle
    const referrerPool = await prisma.poolParticipant.findUniqueOrThrow({
      where: {
        poolId_userId: {
          poolId,
          userId: referrerParticipant.userId,
        },
      },
    });

    await prisma.poolParticipant.update({
      where: { id: referrerPool.id },
      data: {
        referralBonusPoints: {
          increment: REFERRAL_BASE_BONUS,
        },
      },
    });

    return NextResponse.json({
      success: true,
      referralBoostId: referralBoost.id,
    });
  } catch (err) {
    console.error('POST /api/referral/track error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
