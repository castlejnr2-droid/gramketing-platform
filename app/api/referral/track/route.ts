import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAuthWallet } from '@/lib/auth';
import { normalizeWalletAddress } from '@/lib/ton';

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
  return Date.now().toString(36).toUpperCase().slice(-8).padStart(8, '0');
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

    // Get or create the referred user — always use canonical address format
    const canonicalWallet = (() => { try { return normalizeWalletAddress(walletAddress); } catch { return walletAddress; } })();
    const referredUser = await prisma.user.upsert({
      where: { walletAddress: canonicalWallet },
      update: {},
      create: { walletAddress: canonicalWallet },
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
      const referralCode = await generateReferralCode();
      await prisma.poolParticipant.create({
        data: {
          poolId,
          userId: referredUser.id,
          referredByUserId: referrerParticipant.userId,
          referralCode,
        },
      });
    }

    // Record the referral relationship. No points are awarded here — bonus
    // points and the multiplier are computed by the scraper each cycle and
    // can be revoked if the referred wallet drops below the holding minimum
    // or removes their post. referredHolding starts at 0 and is updated each
    // scrape cycle via checkTokenBalance in pool-scraper.ts.
    const referralBoost = await prisma.referralBoost.create({
      data: {
        referrerId: referrerParticipant.userId,
        referredUserId: referredUser.id,
        poolId,
        referredHolding: 0n,
        boostMultiplier: 1.0, // scraper recalculates proportionally
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
