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

    // Derive canonical wallet address.
    // Explicitly set urlSafe:true + bounceable:true so the format is stable
    // regardless of @ton/core library version (default has changed between versions).
    const parsedAddress = Address.parse(account.address);
    const canonicalAddress = parsedAddress.toString({ urlSafe: true, bounceable: true });

    // Build the full set of address format variants so we can find users whose
    // address was stored in any historical format (urlSafe=false, raw, non-bounceable).
    const addressVariants = Array.from(new Set([
      canonicalAddress,
      parsedAddress.toString({ urlSafe: false, bounceable: true }),
      parsedAddress.toString({ urlSafe: true,  bounceable: false }),
      parsedAddress.toString({ urlSafe: false, bounceable: false }),
      parsedAddress.toRawString(),
    ]));

    // Find all existing users that match any address variant.
    // If the wallet was stored in a legacy format this query finds them too.
    const matchingUsers = await prisma.user.findMany({
      where: { walletAddress: { in: addressVariants } },
    });

    let user: (typeof matchingUsers)[0] | null = null;
    let userCreated = false;

    if (matchingUsers.length > 0) {
      // Prefer whichever record has the most social data so we never surface a
      // bare "new" record when a richer one exists (common when address was
      // stored in a different format on first login).
      user = matchingUsers.reduce((best, candidate) => {
        const bestScore  = (best.telegramChatId  ? 2 : 0) + (best.xAccountId  ? 1 : 0);
        const candScore  = (candidate.telegramChatId ? 2 : 0) + (candidate.xAccountId ? 1 : 0);
        return candScore > bestScore ? candidate : best;
      });

      console.log('[auth/verify] found existing user', {
        userId:           user.id,
        storedAddress:    user.walletAddress,
        canonicalAddress,
        formatChanged:    user.walletAddress !== canonicalAddress,
        multipleRecords:  matchingUsers.length,
        telegramChatId:   user.telegramChatId ? '✓' : null,
        xAccountId:       user.xAccountId     ? '✓' : null,
      });

      // Migrate walletAddress to canonical format if it was stored differently.
      if (user.walletAddress !== canonicalAddress) {
        try {
          user = await prisma.user.update({
            where: { id: user.id },
            data:  { walletAddress: canonicalAddress },
          });
          console.log('[auth/verify] migrated walletAddress to canonical format', canonicalAddress);
        } catch (migrateErr: unknown) {
          // P2002 means another record already has the canonical address.
          // That record takes precedence; re-run the lookup to get it.
          const code = (migrateErr as { code?: string })?.code;
          if (code === 'P2002') {
            const canonical = await prisma.user.findUnique({ where: { walletAddress: canonicalAddress } });
            if (canonical) {
              console.warn('[auth/verify] canonical address already exists as separate record — using it', { canonicalId: canonical.id, oldId: user.id });
              user = canonical;
            }
          } else {
            console.warn('[auth/verify] walletAddress migration failed, continuing with stored format', migrateErr);
          }
        }
      }
    } else {
      // No existing user — create fresh.
      user = await prisma.user.create({ data: { walletAddress: canonicalAddress } });
      userCreated = true;
      console.log('[auth/verify] new user created', { userId: user.id, walletAddress: canonicalAddress });
    }

    const walletAddress = user.walletAddress;

    console.log('[auth/verify] login', {
      walletAddress,
      userId:        user.id,
      created:       userCreated,
      telegramChatId: user.telegramChatId ? '✓' : null,
      xAccountId:    user.xAccountId     ? '✓' : null,
      xHandle:       user.xHandle        ?? null,
    });

    // Persist Telegram user ID if supplied from Mini App context and not yet saved.
    // Only write if the field is currently empty to avoid overwriting a verified link.
    if (telegramUserId && !user.telegramChatId) {
      try {
        await prisma.user.update({
          where: { walletAddress },
          data:  { telegramChatId: String(telegramUserId) },
        });
        console.log('[auth/verify] linked telegramChatId', telegramUserId, 'to', walletAddress);
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
      linked: {
        telegram: !!user.telegramChatId,
        x:        !!user.xAccountId,
      },
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
