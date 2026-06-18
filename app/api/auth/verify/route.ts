import { NextRequest, NextResponse } from 'next/server';
import { Address } from '@ton/core';
import { prisma } from '@/lib/prisma';
import { signJwt } from '@/lib/auth';
import { verifyTonProof, TonProofAccount, TonProofData } from '@/lib/tonConnect';

// The expected domain must match what the wallet signed.
// Set TON_PROOF_DOMAIN in Vercel env to match your production hostname.
// Defaults to the current Vercel deployment domain.
const EXPECTED_DOMAIN =
  process.env.TON_PROOF_DOMAIN ?? 'gramketing-platform.vercel.app';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    const account: TonProofAccount | undefined = body.account;
    const proof:   TonProofData    | undefined = body.proof;
    const telegramUserId: string | number | undefined = body.telegramUserId;

    // Validate required proof fields are present
    if (
      !account?.address ||
      !account?.walletStateInit ||
      !account?.publicKey ||
      !proof?.timestamp ||
      !proof?.domain?.value ||
      !proof?.payload ||
      !proof?.signature
    ) {
      return NextResponse.json(
        { error: 'Missing or incomplete proof fields. Expected: account.{address,walletStateInit,publicKey} + proof.{timestamp,domain,payload,signature}' },
        { status: 400 },
      );
    }

    // Consume the challenge nonce — single-use, must exist and not be expired
    const challenge = await prisma.tonProofChallenge.findUnique({
      where: { payload: proof.payload },
    });

    if (!challenge || challenge.used || challenge.expiresAt < new Date()) {
      return NextResponse.json(
        { error: 'Invalid or expired challenge payload' },
        { status: 401 },
      );
    }

    // Mark as used immediately before verification to prevent race-condition reuse
    await prisma.tonProofChallenge.update({
      where: { payload: proof.payload },
      data:  { used: true },
    });

    // Verify the ton_proof cryptographically
    const valid = await verifyTonProof(account, proof, EXPECTED_DOMAIN);
    if (!valid) {
      return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
    }

    // Derive canonical wallet address (raw 0:hash format, consistent with DB)
    const walletAddress = Address.parse(account.address).toString();

    // Find or create user
    const user = await prisma.user.upsert({
      where:  { walletAddress },
      update: {},
      create: { walletAddress },
    });

    // Persist Telegram user ID if supplied from Mini App context and not yet saved.
    // Only write if the field is currently empty to avoid overwriting a verified link.
    if (telegramUserId && !user.telegramChatId) {
      await prisma.user.update({
        where: { walletAddress },
        data:  { telegramChatId: String(telegramUserId) },
      });
    }

    // Sign JWT and set httpOnly cookie
    const token = await signJwt({ walletAddress });

    const response = NextResponse.json({
      success:       true,
      walletAddress,
      userId:        user.id,
    });

    const isProd = process.env.NODE_ENV === 'production';
    response.cookies.set('gramketing_token', token, {
      httpOnly: true,
      secure:   isProd,
      // SameSite=None (with Secure) is required for Telegram Mini App WebViews
      // (WKWebView on iOS treats the session as cross-site). In dev we use Lax
      // since SameSite=None requires Secure which is unavailable on localhost.
      sameSite: isProd ? 'none' : 'lax',
      maxAge:   7 * 24 * 60 * 60, // 7 days
      path:     '/',
    });

    return response;
  } catch (err) {
    console.error('Auth verify error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
