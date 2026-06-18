import { NextRequest, NextResponse } from 'next/server';
import { Address } from '@ton/core';
import { prisma } from '@/lib/prisma';
import { signJwt } from '@/lib/auth';
import { validateTelegramInitData, extractTelegramUserId } from '@/lib/telegram';

/**
 * Called by the Mini App on load with the raw Telegram WebApp.initData string.
 * Validates the HMAC-SHA256 signature per the official Telegram spec before
 * trusting any identity claim. If a user has already linked their account via
 * the LINK-XXXXXX flow (User.telegramChatId is set), issues a JWT cookie so
 * the user can join pools and submit posts without reconnecting TonConnect.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const initData: unknown = body.initData;

    if (!initData || typeof initData !== 'string') {
      return NextResponse.json(
        { linked: false, error: 'initData string required' },
        { status: 400 },
      );
    }

    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    if (!botToken) {
      return NextResponse.json(
        { linked: false, error: 'Bot not configured' },
        { status: 500 },
      );
    }

    // Validate HMAC and auth_date freshness — returns null on any failure
    const params = validateTelegramInitData(initData, botToken);
    if (!params) {
      return NextResponse.json(
        { linked: false, error: 'Invalid or expired initData' },
        { status: 401 },
      );
    }

    // Extract user id from the validated (server-side verified) params
    const telegramUserId = extractTelegramUserId(params);
    if (!telegramUserId) {
      return NextResponse.json(
        { linked: false, error: 'No user in initData' },
        { status: 400 },
      );
    }

    const user = await prisma.user.findFirst({
      where: { telegramChatId: telegramUserId },
      select: { id: true, walletAddress: true, username: true, telegramHandle: true, xAccountId: true },
    });

    if (!user) {
      return NextResponse.json({ linked: false });
    }

    // Normalize walletAddress to canonical format so the JWT is consistent with
    // tokens issued by /api/auth/verify (both use urlSafe:true bounceable:true).
    let walletAddress = user.walletAddress;
    try {
      walletAddress = Address.parse(user.walletAddress).toString({ urlSafe: true, bounceable: true });
      if (walletAddress !== user.walletAddress) {
        // Migrate legacy address format in DB
        await prisma.user.update({ where: { id: user.id }, data: { walletAddress } }).catch(() => {});
        console.log('[telegram-miniapp] migrated walletAddress to canonical format', { userId: user.id, from: user.walletAddress, to: walletAddress });
      }
    } catch {
      // Not a valid TON address (raw hex, etc.) — use as-is
      walletAddress = user.walletAddress;
    }

    console.log('[telegram-miniapp] issuing JWT for linked user', { userId: user.id, walletAddress, telegramChatId: telegramUserId, xAccountId: user.xAccountId ? '✓' : null });

    // Issue a session JWT so the user can call authenticated API routes
    // (join pool, submit posts) without having to manually reconnect TonConnect.
    const token = await signJwt({ walletAddress });

    const response = NextResponse.json({
      linked: true,
      walletAddress,
      username: user.username,
    });

    const isProd = process.env.NODE_ENV === 'production';
    response.cookies.set('gramketing_token', token, {
      httpOnly: true,
      secure:   isProd,
      sameSite: isProd ? 'none' : 'lax',
      maxAge:   7 * 24 * 60 * 60, // 7 days
      path:     '/',
    });

    return response;
  } catch (err) {
    console.error('POST /api/auth/telegram-miniapp error:', err);
    return NextResponse.json({ linked: false }, { status: 500 });
  }
}
