import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAuthWallet, isAdmin } from '@/lib/auth';

export async function POST(req: NextRequest) {
  try {
    const walletAddress = await getAuthWallet(req);
    if (!walletAddress || !isAdmin(walletAddress)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { walletAddress: targetWallet, reason } = await req.json();
    if (!targetWallet) {
      return NextResponse.json(
        { error: 'Missing walletAddress' },
        { status: 400 }
      );
    }

    const user = await prisma.user.findUnique({
      where: { walletAddress: targetWallet },
    });

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // Reject all submissions
    const rejectedSubmissions = await prisma.submission.updateMany({
      where: { userId: user.id },
      data: { status: 'REJECTED', currentPoints: 0 },
    });

    // Zero out all participant points
    const zeroed = await prisma.poolParticipant.updateMany({
      where: { userId: user.id },
      data: {
        totalPoints: 0,
        xPoints: 0,
        telegramPoints: 0,
        referralBonusPoints: 0,
      },
    });

    // TODO: add banned: Boolean field to User model and set it here
    // await prisma.user.update({ where: { id: user.id }, data: { banned: true } });

    console.log(
      `[ADMIN] Banned user ${user.walletAddress}. Reason: ${reason}. ` +
        `Rejected ${rejectedSubmissions.count} submissions, zeroed ${zeroed.count} participations.`
    );

    return NextResponse.json({
      success: true,
      rejectedSubmissions: rejectedSubmissions.count,
      zeroedParticipations: zeroed.count,
    });
  } catch (err) {
    console.error('POST /api/admin/ban error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
