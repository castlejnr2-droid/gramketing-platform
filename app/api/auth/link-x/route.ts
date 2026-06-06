import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAuthWallet } from '@/lib/auth';
import { buildOAuth1Header } from '@/lib/twitter-oauth1';

const COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

/**
 * GET: Begin OAuth 1.0a three-legged flow.
 *
 * 1. POST oauth/request_token → get oauth_token + oauth_token_secret
 * 2. Store oauth_token_secret in a short-lived httpOnly cookie
 * 3. Redirect user to https://api.twitter.com/oauth/authenticate?oauth_token=...
 *
 * OAuth 1.0a works in X app development mode without app verification,
 * unlike OAuth 2.0 PKCE which shows "Log in" instead of "Authorize app".
 */
export async function GET(req: NextRequest) {
  const consumerKey    = process.env.TWITTER_CONSUMER_KEY;
  const consumerSecret = process.env.TWITTER_CONSUMER_SECRET;

  if (!consumerKey || !consumerSecret) {
    return NextResponse.json({ error: 'Twitter credentials not configured' }, { status: 500 });
  }

  const callbackUrl =
    process.env.TWITTER_REDIRECT_URI ??
    `${req.nextUrl.origin}/api/auth/twitter/callback`;

  const fromMiniapp = req.nextUrl.searchParams.get('from') === 'miniapp';

  // Step 1: request_token - oauth_callback must be in the Authorization header
  const requestTokenUrl = 'https://api.twitter.com/oauth/request_token';
  const authHeader = buildOAuth1Header({
    method:         'POST',
    url:            requestTokenUrl,
    consumerKey,
    consumerSecret,
    oauthCallback:  callbackUrl,
  });

  console.log('[link-x] requesting request_token', {
    callback:          callbackUrl,
    consumerKeyPrefix: consumerKey.slice(0, 8) + '…',
  });

  const tokenRes = await fetch(requestTokenUrl, {
    method:  'POST',
    headers: { Authorization: authHeader },
  });

  if (!tokenRes.ok) {
    const errBody    = await tokenRes.text();
    const errHeaders = Object.fromEntries(tokenRes.headers.entries());
    console.error('[link-x] request_token failed', {
      status:  tokenRes.status,
      headers: errHeaders,
      body:    errBody,
    });
    return NextResponse.json({ error: 'Failed to get request token from Twitter' }, { status: 500 });
  }

  const tokenBody   = await tokenRes.text();
  const tokenParams = new URLSearchParams(tokenBody);
  const oauthToken       = tokenParams.get('oauth_token');
  const oauthTokenSecret = tokenParams.get('oauth_token_secret');
  const callbackConfirmed = tokenParams.get('oauth_callback_confirmed');

  console.log('[link-x] request_token ok - callback_confirmed:', callbackConfirmed, 'token present:', !!oauthToken);

  if (!oauthToken || !oauthTokenSecret) {
    console.error('[link-x] missing oauth_token or oauth_token_secret in response');
    return NextResponse.json({ error: 'Invalid request token response' }, { status: 500 });
  }

  // Step 2: redirect user to X authorization page
  // oauth/authenticate is preferred - skips the prompt if user already authorised the app.
  const authorizeUrl = `https://api.twitter.com/oauth/authenticate?oauth_token=${oauthToken}`;
  console.log('[link-x] redirecting to:', authorizeUrl);

  // Set cookie directly on the redirect response - cookies().set() from next/headers
  // does NOT attach Set-Cookie to a NextResponse.redirect() in the same handler.
  const response = NextResponse.redirect(authorizeUrl);
  const cookieOpts = {
    httpOnly: true,
    secure:   process.env.NODE_ENV === 'production',
    maxAge:   600, // 10 minutes
    path:     '/',
    sameSite: 'lax',
  } as const;
  response.cookies.set('x_oauth1', oauthTokenSecret, cookieOpts);
  response.cookies.set('x_oauth1_origin', fromMiniapp ? 'miniapp' : 'website', cookieOpts);
  return response;
}

/**
 * Internal helper - links a verified X account to a wallet address.
 * Enforces a 7-day re-link cooldown and uniqueness of xAccountId.
 */
export async function linkXAccount(
  walletAddress: string,
  xAccountId:   string,
  xHandle:      string,
  xAccessToken: string,
): Promise<{ error: string; status: number } | { success: true; xHandle: string }> {
  const user = await prisma.user.findUnique({ where: { walletAddress } });
  if (!user) return { error: 'User not found', status: 404 };

  if (user.xUnlinkedAt) {
    const nextAllowed = new Date(user.xUnlinkedAt.getTime() + COOLDOWN_MS);
    if (nextAllowed > new Date()) {
      return {
        error:  `You can only link a new X account once every 7 days. Try again on ${nextAllowed.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}.`,
        status: 429,
      };
    }
  }

  const existing = await prisma.user.findUnique({ where: { xAccountId } });
  if (existing && existing.id !== user.id) {
    return {
      error:  'This X account is already linked to another wallet. It must be unlinked from that account first.',
      status: 409,
    };
  }

  const updated = await prisma.user.update({
    where: { id: user.id },
    data:  { xAccountId, xHandle: xHandle.replace('@', ''), xAccessToken },
  });

  return { success: true, xHandle: updated.xHandle! };
}
