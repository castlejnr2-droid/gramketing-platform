import { NextRequest, NextResponse } from 'next/server';
import { createHash, randomBytes } from 'crypto';
import { cookies } from 'next/headers';
import { prisma } from '@/lib/prisma';
import { getAuthWallet } from '@/lib/auth';

const COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

// GET: Begin Twitter OAuth 2.0 PKCE flow → redirect to authorization URL
export async function GET(req: NextRequest) {
  const clientId = process.env.TWITTER_CLIENT_ID;
  if (!clientId) {
    return NextResponse.json({ error: 'TWITTER_CLIENT_ID not configured' }, { status: 500 });
  }

  // PKCE: code_verifier is 32 random bytes → base64url (43 URL-safe chars)
  const codeVerifier = randomBytes(32).toString('base64url');
  const codeChallenge = createHash('sha256').update(codeVerifier).digest('base64url');
  const state = randomBytes(16).toString('hex');

  // Persist state + verifier in a short-lived httpOnly cookie (10 min)
  const cookieStore = await cookies();
  cookieStore.set('x_oauth', JSON.stringify({ state, codeVerifier }), {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    maxAge: 600,
    path: '/',
    sameSite: 'lax',
  });

  const redirectUri = `${req.nextUrl.origin}/api/auth/twitter/callback`;
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: clientId,
    redirect_uri: redirectUri,
    scope: 'tweet.read users.read',
    state,
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
  });

  return NextResponse.redirect(`https://twitter.com/i/oauth2/authorize?${params}`);
}

/**
 * Internal helper — called at the point where OAuth has been verified and we
 * have a confirmed xAccountId (Twitter numeric user ID) + xHandle + xAccessToken.
 *
 * Enforces:
 *  1. 7-day re-link cooldown (xUnlinkedAt)
 *  2. Uniqueness — rejects if xAccountId already belongs to another wallet
 */
export async function linkXAccount(
  walletAddress: string,
  xAccountId: string,
  xHandle: string,
  xAccessToken: string
): Promise<{ error: string; status: number } | { success: true; xHandle: string }> {
  const user = await prisma.user.findUnique({ where: { walletAddress } });
  if (!user) return { error: 'User not found', status: 404 };

  // Cooldown check
  if (user.xUnlinkedAt) {
    const nextAllowed = new Date(user.xUnlinkedAt.getTime() + COOLDOWN_MS);
    if (nextAllowed > new Date()) {
      return {
        error: `You can only link a new X account once every 7 days. Try again on ${nextAllowed.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}.`,
        status: 429,
      };
    }
  }

  // Uniqueness check — is this Twitter account already owned by another wallet?
  const existing = await prisma.user.findUnique({ where: { xAccountId } });
  if (existing && existing.id !== user.id) {
    return {
      error: 'This X account is already linked to another wallet. It must be unlinked from that account first.',
      status: 409,
    };
  }

  const updated = await prisma.user.update({
    where: { id: user.id },
    data: { xAccountId, xHandle: xHandle.replace('@', ''), xAccessToken },
  });

  return { success: true, xHandle: updated.xHandle! };
}

// POST: handles OAuth callback exchange (when implemented) and manual handle linking
export async function POST(req: NextRequest) {
  try {
    const walletAddress = await getAuthWallet(req);
    if (!walletAddress) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();

    // OAuth code exchange — full linking with uniqueness + cooldown enforced
    // body: { xAccountId, xHandle, xAccessToken } (set by the callback route after token exchange)
    if (body.xAccountId) {
      const result = await linkXAccount(
        walletAddress,
        body.xAccountId,
        body.xHandle ?? '',
        body.xAccessToken ?? ''
      );
      if ('error' in result) {
        return NextResponse.json({ error: result.error }, { status: result.status });
      }
      return NextResponse.json(result);
    }

    // TODO: OAuth code exchange
    // If body.code is present, exchange for access token then call linkXAccount:
    // POST https://api.twitter.com/2/oauth2/token
    // body: grant_type=authorization_code&code=CODE&redirect_uri=REDIRECT_URI
    //       &code_verifier=CODE_VERIFIER&client_id=CLIENT_ID
    // Extract xAccountId + xHandle from the /2/users/me response, then:
    //   await linkXAccount(walletAddress, xAccountId, xHandle, accessToken)
    if (body.code) {
      return NextResponse.json(
        { error: 'OAuth code exchange not yet implemented' },
        { status: 501 }
      );
    }

    return NextResponse.json({ error: 'Missing xAccountId or code' }, { status: 400 });
  } catch (err) {
    console.error('Link X error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
