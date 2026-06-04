import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { searchParams } = new URL(req.url);
    const userId = searchParams.get('userId'); // optional filter

    const participants = await prisma.poolParticipant.findMany({
      where: { poolId: id },
      include: {
        user: {
          select: {
            id: true,
            walletAddress: true,
            username: true,
            xHandle: true,
            telegramHandle: true,
            createdAt: true,
          },
        },
      },
      orderBy: { totalPoints: 'desc' },
    });

    const totalParticipants = participants.length;

    const leaderboard = participants.map((p, index) => ({
      rank: index + 1,
      userId: p.userId,
      walletAddress: p.user.walletAddress,
      username: p.user.username,
      xHandle: p.user.xHandle,
      telegramHandle: p.user.telegramHandle,
      joinedAt: p.joinedAt,
      totalPoints: p.totalPoints,
      xPoints: p.xPoints,
      telegramPoints: p.telegramPoints,
      referralBonusPoints: p.referralBonusPoints,
      referralMultiplier: p.referralMultiplier,
      holderBoost: p.holderBoost,
      referralCode: p.referralCode,
      totalParticipants,
      referralCount: 0, // populated separately if needed
    }));

    if (userId) {
      const entry = leaderboard.find((e) => e.userId === userId);
      return NextResponse.json({ leaderboard: entry ? [entry] : [] });
    }

    return NextResponse.json({ leaderboard });
  } catch (err) {
    console.error('GET /api/pools/[id]/leaderboard error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
