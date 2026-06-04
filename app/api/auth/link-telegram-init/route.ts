import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAuthWallet } from '@/lib/auth';

function generateLinkCode(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let suffix = '';
  for (let i = 0; i < 6; i++) {
    suffix += chars[Math.floor(Math.random() * chars.length)];
  }
  return `LINK-${suffix}`;
}

export async function POST(req: NextRequest) {
  try {
    const walletAddress = await getAuthWallet(req);
    if (!walletAddress) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const code = generateLinkCode();
    const expiry = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    await prisma.user.upsert({
      where: { walletAddress },
      update: { linkTelegramCode: code, linkTelegramCodeExpiry: expiry },
      create: { walletAddress, linkTelegramCode: code, linkTelegramCodeExpiry: expiry },
    });

    return NextResponse.json({ code, expiresAt: expiry.toISOString() });
  } catch (err) {
    console.error('POST /api/auth/link-telegram-init error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
