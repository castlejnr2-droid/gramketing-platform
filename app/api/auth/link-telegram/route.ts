import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAuthWallet } from '@/lib/auth';

const TG_CHANNEL_REGEX = /^https?:\/\/t\.me\/[a-zA-Z][a-zA-Z0-9_]{3,}$/;

export async function POST(req: NextRequest) {
  try {
    const walletAddress = await getAuthWallet(req);
    if (!walletAddress) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { channelUrl } = await req.json();

    if (!channelUrl || !channelUrl.trim()) {
      return NextResponse.json({ error: 'Missing channelUrl' }, { status: 400 });
    }

    const url = channelUrl.trim().replace(/\/$/, ''); // strip trailing slash

    if (!TG_CHANNEL_REGEX.test(url)) {
      return NextResponse.json(
        { error: 'Invalid channel URL. Must be https://t.me/yourchannelname' },
        { status: 400 }
      );
    }

    await prisma.user.upsert({
      where: { walletAddress },
      update: { telegramChannelUrl: url },
      create: { walletAddress, telegramChannelUrl: url },
    });

    return NextResponse.json({ success: true, telegramChannelUrl: url });
  } catch (err) {
    console.error('POST /api/auth/link-telegram error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
