import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { signJwt } from '@/lib/auth';

/**
 * Called by the Mini App on load with the Telegram user ID from initDataUnsafe.
 * If a user has already linked their account via the LINK-XXXXXX flow
 * (User.telegramChatId is set), this confirms the pairing is live AND issues
 * a JWT cookie so the user can join pools and submit posts without reconnecting
 * their wallet manually every session.
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

    // Issue a session JWT so the user can call authenticated API routes
    // (join pool, submit posts) without having to manually reconnect TonConnect.
    const token = await signJwt({ walletAddress: user.walletAddress });

    const response = NextResponse.json({
      linked: true,
      walletAddress: user.walletAddress,
      username: user.username,
    });

    response.cookies.set('gramketing_token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60, // 7 days
      path: '/',
    });

    return response;
  } catch (err) {
    console.error('POST /api/auth/telegram-miniapp error:', err);
    return NextResponse.json({ linked: false });
  }
}
