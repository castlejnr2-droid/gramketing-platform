import { NextRequest, NextResponse } from 'next/server';
import { createHmac } from 'crypto';
import { prisma } from '@/lib/prisma';
import { getAuthWallet } from '@/lib/auth';

/**
 * Verify Telegram initData HMAC signature.
 * Reference: https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app
 */
function verifyTelegramInitData(initData: string, botToken: string): boolean {
  try {
    const params = new URLSearchParams(initData);
    const hash = params.get('hash');
    if (!hash) return false;

    // Build data-check-string: sorted key=value pairs (excluding hash), joined by \n
    params.delete('hash');
    const dataCheckString = Array.from(params.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${k}=${v}`)
      .join('\n');

    // HMAC-SHA256(data_check_string, HMAC-SHA256("WebAppData", bot_token))
    const secretKey = createHmac('sha256', 'WebAppData')
      .update(botToken)
      .digest();

    const expectedHash = createHmac('sha256', secretKey)
      .update(dataCheckString)
      .digest('hex');

    return expectedHash === hash;
  } catch {
    return false;
  }
}

export async function POST(req: NextRequest) {
  try {
    const walletAddress = await getAuthWallet(req);
    if (!walletAddress) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { telegramId, telegramHandle, initData } = await req.json();

    if (!telegramId || !telegramHandle) {
      return NextResponse.json(
        { error: 'Missing telegramId or telegramHandle' },
        { status: 400 }
      );
    }

    const botToken = process.env.TELEGRAM_BOT_TOKEN;

    // Verify Telegram initData if provided (from Telegram Mini App)
    if (initData && botToken) {
      const valid = verifyTelegramInitData(initData, botToken);
      if (!valid) {
        return NextResponse.json(
          { error: 'Invalid Telegram initData signature' },
          { status: 401 }
        );
      }
    }
    // If no initData (manual linking from dashboard), skip HMAC check

    const user = await prisma.user.update({
      where: { walletAddress },
      data: {
        telegramId: String(telegramId),
        telegramHandle: telegramHandle.replace('@', ''),
      },
    });

    return NextResponse.json({
      success: true,
      telegramId: user.telegramId,
      telegramHandle: user.telegramHandle,
    });
  } catch (err) {
    console.error('Link Telegram error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
