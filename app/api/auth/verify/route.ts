import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { signJwt } from '@/lib/auth';
import { verifyTonProof, TonProofAccount, TonProofData } from '@/lib/tonConnect';
import { validateTelegramInitData, extractTelegramUserId } from '@/lib/telegram';
import { normalizeWalletAddress, walletAddressVariants } from '@/lib/ton';

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

    // Canonical form: bounceable=true, urlSafe=true — enforced by normalizeWalletAddress().
    const canonicalAddress = normalizeWalletAddress(account.address);
    const variants = walletAddressVariants(account.address);

    // Find ALL existing users that match any address encoding for this wallet.
    const matchingUsers = await prisma.user.findMany({
      where: { walletAddress: { in: variants } },
    });

    let user: (typeof matchingUsers)[0];
    let userCreated = false;

    if (matchingUsers.length === 0) {
      // First ever login for this wallet.
      user = await prisma.user.create({ data: { walletAddress: canonicalAddress } });
      userCreated = true;
      console.log('[auth/verify] new user created', { userId: user.id, walletAddress: canonicalAddress });

    } else if (matchingUsers.length === 1) {
      user = matchingUsers[0];
      console.log('[auth/verify] existing user', {
        userId:        user.id,
        storedAddress: user.walletAddress,
        canonical:     canonicalAddress,
        formatDiff:    user.walletAddress !== canonicalAddress,
        tg:            user.telegramChatId ? '✓' : null,
        x:             user.xAccountId    ? '✓' : null,
      });

      // Migrate address format to canonical if it differs.
      if (user.walletAddress !== canonicalAddress) {
        try {
          user = await prisma.user.update({ where: { id: user.id }, data: { walletAddress: canonicalAddress } });
          console.log('[auth/verify] address migrated to canonical', canonicalAddress);
        } catch (e: unknown) {
          console.warn('[auth/verify] address migration failed (P2002?), continuing as-is', e);
        }
      }

    } else {
      // Multiple records for the same wallet — merge them NOW, at login time.
      // This handles any users that slipped through before the migration script ran.
      console.warn('[auth/verify] multiple user records for same wallet — merging', {
        canonicalAddress,
        ids: matchingUsers.map((u) => u.id),
      });

      // Pick winner: most social data, then oldest record as tiebreaker.
      const sorted = [...matchingUsers].sort((a, b) => {
        const scoreA = (a.telegramChatId ? 4 : 0) + (a.xAccountId ? 2 : 0) + (a.username ? 1 : 0);
        const scoreB = (b.telegramChatId ? 4 : 0) + (b.xAccountId ? 2 : 0) + (b.username ? 1 : 0);
        return scoreB - scoreA || a.createdAt.getTime() - b.createdAt.getTime();
      });
      const winner = sorted[0];
      const losers = sorted.slice(1);

      for (const loser of losers) {
        try {
          await prisma.$transaction(async (tx) => {
            // Reassign PoolParticipant rows (unique on poolId+userId — skip if conflict)
            const loserParts = await tx.poolParticipant.findMany({ where: { userId: loser.id } });
            for (const lp of loserParts) {
              const wp = await tx.poolParticipant.findUnique({
                where: { poolId_userId: { poolId: lp.poolId, userId: winner.id } },
              });
              if (!wp) {
                await tx.poolParticipant.update({ where: { id: lp.id }, data: { userId: winner.id } });
              } else {
                // Merge points; move PoolPosts; delete loser's participant
                await tx.poolParticipant.update({
                  where: { id: wp.id },
                  data: {
                    totalPoints:         wp.totalPoints         + lp.totalPoints,
                    xPoints:             wp.xPoints             + lp.xPoints,
                    telegramPoints:      wp.telegramPoints      + lp.telegramPoints,
                    referralBonusPoints: wp.referralBonusPoints + lp.referralBonusPoints,
                    referralMultiplier:  Math.max(wp.referralMultiplier, lp.referralMultiplier),
                    holderBoost:         Math.max(wp.holderBoost, lp.holderBoost),
                  },
                });
                // Reassign PoolPosts that don't collide
                const posts = await tx.poolPost.findMany({ where: { participantId: lp.id } });
                for (const post of posts) {
                  const clash = await tx.poolPost.findUnique({
                    where: { poolId_postLink: { poolId: post.poolId, postLink: post.postLink } },
                  });
                  if (!clash || clash.participantId === wp.id) {
                    await tx.poolPost.update({ where: { id: post.id }, data: { participantId: wp.id } }).catch(() => {});
                  } else {
                    await tx.poolPost.delete({ where: { id: post.id } });
                  }
                }
                await tx.poolParticipant.delete({ where: { id: lp.id } });
              }
            }
            // Reassign Submissions (skip duplicates)
            const loserSubs = await tx.submission.findMany({ where: { userId: loser.id } });
            for (const sub of loserSubs) {
              const dup = await tx.submission.findFirst({
                where: { poolId: sub.poolId, userId: winner.id, platform: sub.platform, submittedDate: sub.submittedDate },
              });
              if (dup) {
                await tx.submission.delete({ where: { id: sub.id } });
              } else {
                await tx.submission.update({ where: { id: sub.id }, data: { userId: winner.id } });
              }
            }
            // ReferralBoost
            await tx.referralBoost.updateMany({ where: { referrerId:     loser.id }, data: { referrerId:     winner.id } });
            await tx.referralBoost.updateMany({ where: { referredUserId: loser.id }, data: { referredUserId: winner.id } });
            await tx.referralBoost.deleteMany({ where: { referrerId: winner.id, referredUserId: winner.id } });
            // TelegramNotificationPrefs
            const loserPrefs = await tx.telegramNotificationPrefs.findUnique({ where: { userId: loser.id } });
            if (loserPrefs) {
              const winnerPrefs = await tx.telegramNotificationPrefs.findUnique({ where: { userId: winner.id } });
              if (!winnerPrefs) {
                await tx.telegramNotificationPrefs.update({ where: { id: loserPrefs.id }, data: { userId: winner.id } });
              } else {
                await tx.telegramNotificationPrefs.delete({ where: { id: loserPrefs.id } });
              }
            }
            // Copy social fields to winner if winner is missing them
            const patch: Record<string, unknown> = {};
            if (!winner.telegramChatId && loser.telegramChatId) patch.telegramChatId = loser.telegramChatId;
            if (!winner.xAccountId     && loser.xAccountId)     patch.xAccountId     = loser.xAccountId;
            if (!winner.xHandle        && loser.xHandle)         patch.xHandle        = loser.xHandle;
            if (!winner.username       && loser.username)        patch.username       = loser.username;
            if (Object.keys(patch).length) {
              await tx.user.update({ where: { id: winner.id }, data: patch });
              Object.assign(winner, patch); // reflect in local object for JWT
            }
            // Delete loser
            await tx.user.delete({ where: { id: loser.id } });
          });
          console.log('[auth/verify] merged loser', loser.id, '→ winner', winner.id);
        } catch (mergeErr) {
          console.error('[auth/verify] merge failed for loser', loser.id, mergeErr);
          // Non-fatal — continue with winner even if merge incomplete
        }
      }

      // Ensure winner has canonical address
      if (winner.walletAddress !== canonicalAddress) {
        try {
          await prisma.user.update({ where: { id: winner.id }, data: { walletAddress: canonicalAddress } });
          winner.walletAddress = canonicalAddress;
        } catch (e) {
          console.warn('[auth/verify] canonical address update failed after merge', e);
        }
      }
      user = await prisma.user.findUniqueOrThrow({ where: { id: winner.id } });
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
