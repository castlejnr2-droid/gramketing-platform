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

    if (!user.telegramChatId) {
      return NextResponse.json({ error: 'No Telegram account linked' }, { status: 400 });
    }

    // Enforce 7-day cooldown
    if (user.telegramUnlinkedAt) {
      const nextAllowed = new Date(user.telegramUnlinkedAt.getTime() + COOLDOWN_MS);
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

    // Unlink: clear chatId, record timestamp, remove notification prefs
    await prisma.$transaction([
      prisma.user.update({
        where: { id: user.id },
        data: {
          telegramChatId: null,
          telegramUnlinkedAt: new Date(),
        },
      }),
      prisma.telegramNotificationPrefs.deleteMany({
        where: { userId: user.id },
      }),
    ]);

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('POST /api/auth/unlink-telegram error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
