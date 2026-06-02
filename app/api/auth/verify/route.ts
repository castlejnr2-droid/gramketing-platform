import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { signJwt } from '@/lib/auth';
import { verifyTonWalletSignature } from '@/lib/tonConnect';

export async function POST(req: NextRequest) {
  try {
    const { walletAddress, signature, message } = await req.json();

    if (!walletAddress || !signature || !message) {
      return NextResponse.json(
        { error: 'Missing walletAddress, signature, or message' },
        { status: 400 }
      );
    }

    // Verify TON wallet signature
    const valid = verifyTonWalletSignature(walletAddress, signature, message);
    if (!valid) {
      return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
    }

    // Find or create user
    const user = await prisma.user.upsert({
      where: { walletAddress },
      update: {},
      create: { walletAddress },
    });

    // Sign JWT
    const token = await signJwt({ walletAddress });

    // Set httpOnly cookie
    const response = NextResponse.json({
      success: true,
      walletAddress,
      userId: user.id,
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
    console.error('Auth verify error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
