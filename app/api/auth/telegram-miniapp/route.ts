import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

/**
 * Called by the Mini App on load with the Telegram user ID from initDataUnsafe.
 * If a user has already linked their account via the LINK-XXXXXX flow
 * (User.telegramChatId is set), this confirms the pairing is live.
 * Returns the linked wallet address so the miniapp can show account status.
 */
export async function POST(req: NextRequest) {
  try {
    const { telegramUserId } = await req.json();
    if (!telegramUserId) {
      return NextResponse.json({ linked: false });
    }

    const user = await prisma.user.findFirst({
      where: { telegramChatId: String(telegramUserId) },
      select: { walletAddress: true, username: true, telegramHandle: true },
    });

    if (!user) {
      return NextResponse.json({ linked: false });
    }

    return NextResponse.json({ linked: true, walletAddress: user.walletAddress, username: user.username });
  } catch (err) {
    console.error('POST /api/auth/telegram-miniapp error:', err);
    return NextResponse.json({ linked: false });
  }
}
