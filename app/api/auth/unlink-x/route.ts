import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAuthWallet } from '@/lib/auth';

const COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

export async function POST(req: NextRequest) {
  try {
    const walletAddress = await getAuthWallet(req);
    if (!walletAddress) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const user = await prisma.user.findUnique({ where: { walletAddress } });
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    if (!user.xAccountId) {
      return NextResponse.json({ error: 'No X account linked' }, { status: 400 });
    }

    // Enforce 7-day cooldown
    if (user.xUnlinkedAt) {
      const nextAllowed = new Date(user.xUnlinkedAt.getTime() + COOLDOWN_MS);
      if (nextAllowed > new Date()) {
        return NextResponse.json(
          {
            error: `You can only unlink once every 7 days. Try again on ${nextAllowed.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}.`,
            nextAllowedAt: nextAllowed.toISOString(),
          },
          { status: 429 }
        );
      }
    }

    await prisma.user.update({
      where: { id: user.id },
      data: {
        xAccountId: null,
        xHandle: null,
        xAccessToken: null,
        xUnlinkedAt: new Date(),
      },
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('POST /api/auth/unlink-x error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
