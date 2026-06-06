import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { prisma } from '@/lib/prisma';
import { getAuthWallet } from '@/lib/auth';
import { buildOAuth1Header } from '@/lib/twitter-oauth1';
import { linkXAccount } from '@/app/api/auth/link-x/route';

export async function GET(req: NextRequest) {
  const { searchParams, origin } = req.nextUrl;

  // OAuth 1.0a callback params
  const oauthToken    = searchParams.get('oauth_token');
  const oauthVerifier = searchParams.get('oauth_verifier');
  // Twitter sends ?denied=<token> when the user refuses
  const denied        = searchParams.get('denied');

  const settingsUrl = `${origin}/miniapp/settings`;

  console.log('[twitter/callback] received — oauth_token:', oauthToken, '| verifier present:', !!oauthVerifier, '| denied:', denied);

  if (denied) {
    console.warn('[twitter/callback] user denied access');
    return NextResponse.redirect(`${settingsUrl}?x=error&reason=access_denied`);
  }

  if (!oauthToken || !oauthVerifier) {
    console.error('[twitter/callback] missing oauth_token or oauth_verifier');
    return NextResponse.redirect(`${settingsUrl}?x=error&reason=missing_params`);
  }

  // Read the oauth_token_secret we stored before redirecting to X
  const cookieStore   = await cookies();
  const allCookieNames = cookieStore.getAll().map((c) => c.name);
  console.log('[twitter/callback] cookies present:', allCookieNames);

  const tokenSecret = cookieStore.get('x_oauth1')?.value;
  if (!tokenSecret) {
    console.error('[twitter/callback] x_oauth1 cookie missing — cookie was not set or not sent');
    return NextResponse.redirect(`${settingsUrl}?x=error&reason=session_expired`);
  }

  console.log('[twitter/callback] token_secret present, proceeding to access_token exchange');

  // Auth check — gramketing_token cookie must survive the X redirect chain
  const walletAddress = await getAuthWallet(req);
  if (!walletAddress) {
    console.error('[twitter/callback] no wallet auth cookie');
    return NextResponse.redirect(`${settingsUrl}?x=error&reason=not_authenticated`);
  }

  const consumerKey    = process.env.TWITTER_CLIENT_ID!;
  const consumerSecret = process.env.TWITTER_CLIENT_SECRET!;

  // Step 3: exchange oauth_token + oauth_verifier for a permanent access token
  const accessTokenUrl = 'https://api.twitter.com/oauth/access_token';
  const authHeader = buildOAuth1Header({
    method:         'POST',
    url:            accessTokenUrl,
    consumerKey,
    consumerSecret,
    oauthToken,
    tokenSecret,
    oauthVerifier,
  });

  const accessRes = await fetch(accessTokenUrl, {
    method:  'POST',
    headers: { Authorization: authHeader },
  });

  if (!accessRes.ok) {
    const err = await accessRes.text();
    console.error('[twitter/callback] access_token exchange failed:', accessRes.status, err);
    return NextResponse.redirect(`${settingsUrl}?x=error&reason=token_exchange_failed`);
  }

  const accessBody   = await accessRes.text();
  const accessParams = new URLSearchParams(accessBody);
  const accessToken       = accessParams.get('oauth_token');
  const accessTokenSecret = accessParams.get('oauth_token_secret');
  const xAccountId        = accessParams.get('user_id');
  const xHandle           = accessParams.get('screen_name');

  console.log('[twitter/callback] access_token exchange ok — user_id:', xAccountId, 'screen_name:', xHandle);

  if (!accessToken || !accessTokenSecret || !xAccountId || !xHandle) {
    console.error('[twitter/callback] incomplete access_token response:', accessBody);
    return NextResponse.redirect(`${settingsUrl}?x=error&reason=no_user_data`);
  }

  // Fetch profile image via v2 with OAuth 1.0a user auth (best-effort)
  let profileImageUrl: string | null = null;
  try {
    const meHeader = buildOAuth1Header({
      method:         'GET',
      url:            'https://api.twitter.com/2/users/me',
      consumerKey,
      consumerSecret,
      oauthToken:     accessToken,
      tokenSecret:    accessTokenSecret,
    });
    const meRes = await fetch(
      'https://api.twitter.com/2/users/me?user.fields=profile_image_url',
      { headers: { Authorization: meHeader } },
    );
    if (meRes.ok) {
      const meData = await meRes.json();
      profileImageUrl = meData.data?.profile_image_url ?? null;
      console.log('[twitter/callback] profile_image_url:', profileImageUrl);
    } else {
      console.warn('[twitter/callback] profile fetch failed:', meRes.status);
    }
  } catch (e) {
    console.warn('[twitter/callback] profile fetch threw:', e);
  }

  // Store token+secret concatenated — both are needed to make signed user-auth requests later
  const storedToken = `${accessToken}:${accessTokenSecret}`;

  const result = await linkXAccount(walletAddress, xAccountId, xHandle, storedToken);
  if ('error' in result) {
    console.error('[twitter/callback] linkXAccount error:', result.error);
    return NextResponse.redirect(
      `${settingsUrl}?x=error&reason=${encodeURIComponent(result.error)}`,
    );
  }

  if (profileImageUrl) {
    await prisma.user.update({
      where: { walletAddress },
      data:  { xProfileImageUrl: profileImageUrl.replace('_normal', '_400x400') },
    });
  }

  console.log('[twitter/callback] success — linked @', xHandle, 'to', walletAddress);
  return NextResponse.redirect(`${settingsUrl}?x=linked`);
}
