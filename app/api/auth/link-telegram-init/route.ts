import { NextRequest, NextResponse } from 'next/server';
import { randomBytes } from 'crypto';
import { prisma } from '@/lib/prisma';
import { getAuthWallet } from '@/lib/auth';
import { normalizeWalletAddress } from '@/lib/ton';

function generateLinkCode(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  // Use cryptographically secure random bytes; modulo bias is negligible for 36-char alphabet
  const bytes = randomBytes(6);
  const suffix = Array.from(bytes, (b) => chars[b % chars.length]).join('');
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

    const canonicalWallet = (() => { try { return normalizeWalletAddress(walletAddress); } catch { return walletAddress; } })();
    await prisma.user.upsert({
      where: { walletAddress: canonicalWallet },
      update: { linkTelegramCode: code, linkTelegramCodeExpiry: expiry },
      create: { walletAddress: canonicalWallet, linkTelegramCode: code, linkTelegramCodeExpiry: expiry },
    });

    return NextResponse.json({ code, expiresAt: expiry.toISOString() });
  } catch (err) {
    console.error('POST /api/auth/link-telegram-init error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
