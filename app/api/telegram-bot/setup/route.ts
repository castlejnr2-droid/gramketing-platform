import { NextRequest, NextResponse } from 'next/server';
import { getAuthWallet, isAdmin } from '@/lib/auth';
import axios from 'axios';

export async function GET(req: NextRequest) {
  try {
    const walletAddress = await getAuthWallet(req);
    if (!walletAddress || !isAdmin(walletAddress)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const token = process.env.TELEGRAM_BOT_TOKEN;
    if (!token) {
      return NextResponse.json({ error: 'TELEGRAM_BOT_TOKEN not configured' }, { status: 500 });
    }

    const webhookSecret = process.env.TELEGRAM_WEBHOOK_SECRET;
    if (!webhookSecret) {
      return NextResponse.json({ error: 'TELEGRAM_WEBHOOK_SECRET not configured' }, { status: 500 });
    }

    const webhookUrl = 'https://www.gramketing.com/api/telegram-bot/webhook';
    const res = await axios.post(`https://api.telegram.org/bot${token}/setWebhook`, {
      url:          webhookUrl,
      secret_token: webhookSecret,
    });

    return NextResponse.json({ success: true, result: res.data });
  } catch (err) {
    console.error('Telegram setup error:', err);
    return NextResponse.json({ error: 'Failed to register webhook' }, { status: 500 });
  }
}
