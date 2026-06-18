import { NextRequest, NextResponse } from 'next/server';
import { Address } from '@ton/core';
import { prisma } from '@/lib/prisma';
import { signJwt } from '@/lib/auth';
import { verifyTonProof, TonProofAccount, TonProofData } from '@/lib/tonConnect';
import { validateTelegramInitData, extractTelegramUserId } from '@/lib/telegram';

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

    // Resolve Telegram user ID — prefer HMAC-validated initData string over raw ID.
    // telegramInitData is sent by Providers.tsx (Mini App context) and is validated
    // server-side. telegramUserId is a legacy/fallback field; accepted but logged.
    let telegramUserId: string | undefined;
    if (body.telegramInitData && typeof body.telegramInitData === 'string') {
      const botToken = process.env.TELEGRAM_BOT_TOKEN;
      if (botToken) {
        const params = validateTelegramInitData(body.telegramInitData, botToken);
        if (params) {
          telegramUserId = extractTelegramUserId(params) ?? undefined;
        } else {
          console.warn('[auth/verify] telegramInitData HMAC validation failed — skipping Telegram link');
        }
      }
    } else if (body.telegramUserId) {
      // Legacy path: raw user ID without HMAC proof.  Still accepted so old
      // clients don't break, but the ID is not cryptographically verified.
      console.warn('[auth/verify] received unvalidated telegramUserId — upgrade client to send telegramInitData');
      telegramUserId = String(body.telegramUserId);
    }

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

    console.log('[auth/verify] proof attempt', {
      address:   account.address,
      chain:     account.chain,
      domain:    proof.domain?.value,
      expected:  EXPECTED_DOMAIN,
      payload:   proof.payload?.slice(0, 8) + '…',
      timestamp: proof.timestamp,
      now:       Math.floor(Date.now() / 1000),
      delta:     Math.floor(Date.now() / 1000) - (proof.timestamp ?? 0),
      hasSig:    !!proof.signature,
      hasStateInit: !!account.walletStateInit,
    });

    // Consume the challenge nonce — single-use, must exist and not be expired
    const challenge = await prisma.tonProofChallenge.findUnique({
      where: { payload: proof.payload },
    });

    if (!challenge) {
      console.warn('[auth/verify] challenge not found for payload', proof.payload?.slice(0, 16));
      return NextResponse.json(
        { error: 'Invalid or expired challenge payload', reason: 'not_found' },
        { status: 401 },
      );
    }
    if (challenge.used) {
      console.warn('[auth/verify] challenge already used', { challengeId: challenge.id });
      return NextResponse.json(
        { error: 'Challenge already used', reason: 'already_used' },
        { status: 401 },
      );
    }
    if (challenge.expiresAt < new Date()) {
      console.warn('[auth/verify] challenge expired', {
        challengeId: challenge.id,
        expiresAt: challenge.expiresAt.toISOString(),
        now: new Date().toISOString(),
      });
      return NextResponse.json(
        { error: 'Challenge expired', reason: 'expired' },
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
      console.warn('[auth/verify] signature verification failed', {
        address: account.address,
        domain:  proof.domain?.value,
        expected: EXPECTED_DOMAIN,
      });
      return NextResponse.json({ error: 'Invalid signature', reason: 'bad_signature' }, { status: 401 });
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
      try {
        await prisma.user.update({
          where: { walletAddress },
          data:  { telegramChatId: String(telegramUserId) },
        });
      } catch (linkErr: unknown) {
        // P2002: another wallet is already linked to this Telegram ID.
        // Don't fail the auth — wallet authentication still succeeds.
        const code = (linkErr as { code?: string })?.code;
        if (code === 'P2002') {
          console.warn('[auth/verify] telegramChatId already linked to another wallet, skipping link for', walletAddress);
        } else {
          throw linkErr; // unexpected error — let outer catch handle it
        }
      }
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
