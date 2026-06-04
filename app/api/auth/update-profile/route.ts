import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAuthWallet } from '@/lib/auth';

export async function POST(req: NextRequest) {
  try {
    const walletAddress = await getAuthWallet(req);
    if (!walletAddress) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { username } = await req.json();

    if (username !== undefined && username !== null) {
      const trimmed = String(username).trim();
      if (trimmed.length > 30) {
        return NextResponse.json({ error: 'Username must be 30 characters or less' }, { status: 400 });
      }

      // Check uniqueness if non-empty
      if (trimmed.length > 0) {
        const existing = await prisma.user.findFirst({
          where: { username: trimmed, NOT: { walletAddress } },
        });
        if (existing) {
          return NextResponse.json({ error: 'Username already taken' }, { status: 409 });
        }
      }

      await prisma.user.upsert({
        where: { walletAddress },
        update: { username: trimmed || null },
        create: { walletAddress, username: trimmed || null },
      });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('POST /api/auth/update-profile error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
