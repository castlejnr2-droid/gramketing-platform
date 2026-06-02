import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ code: string }> }
) {
  try {
    const { code } = await params;
    const participant = await prisma.poolParticipant.findUnique({
      where: { referralCode: code },
      include: {
        pool: {
          include: {
            project: {
              select: { name: true, logoUrl: true, tokenSymbol: true },
            },
            _count: { select: { participants: true } },
          },
        },
      },
    });

    if (!participant) {
      return NextResponse.json(
        { error: 'Referral code not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      poolId: participant.poolId,
      pool: {
        id: participant.pool.id,
        status: participant.pool.status,
        tokenSymbol: participant.pool.tokenSymbol,
        totalReward: participant.pool.totalReward,
        durationDays: participant.pool.durationDays,
        endDate: participant.pool.endDate,
        participantCount: participant.pool._count.participants,
        project: participant.pool.project,
      },
    });
  } catch (err) {
    console.error('GET /api/referral/[code] error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
