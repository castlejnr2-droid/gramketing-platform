import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { prisma } from '@/lib/prisma';
import { getAuthWallet } from '@/lib/auth';
import { linkXAccount } from '@/app/api/auth/link-x/route';

export async function GET(req: NextRequest) {
  const { searchParams, origin } = req.nextUrl;
  const code = searchParams.get('code');
  const state = searchParams.get('state');
  const errorParam = searchParams.get('error');

  const settingsUrl = `${origin}/miniapp/settings`;

  if (errorParam) {
    // User denied the OAuth prompt
    return NextResponse.redirect(`${settingsUrl}?x=error&reason=${encodeURIComponent(errorParam)}`);
  }

  console.log('[twitter/callback] received — code present:', !!code, '| state:', state);

  if (!code || !state) {
    console.error('[twitter/callback] missing code or state');
    return NextResponse.redirect(`${settingsUrl}?x=error&reason=missing_params`);
  }

  // Validate state against cookie
  const cookieStore = await cookies();
  const allCookieNames = cookieStore.getAll().map((c) => c.name);
  console.log('[twitter/callback] cookies present:', allCookieNames);

  const oauthRaw = cookieStore.get('x_oauth')?.value;
  if (!oauthRaw) {
    console.error('[twitter/callback] x_oauth cookie missing — cookie not set or not sent');
    return NextResponse.redirect(`${settingsUrl}?x=error&reason=session_expired`);
  }

  let oauthData: { state: string; codeVerifier: string };
  try {
    oauthData = JSON.parse(oauthRaw);
  } catch {
    console.error('[twitter/callback] failed to parse x_oauth cookie:', oauthRaw);
    return NextResponse.redirect(`${settingsUrl}?x=error&reason=invalid_session`);
  }

  console.log('[twitter/callback] state from cookie:', oauthData.state);
  console.log('[twitter/callback] state from X:', state);
  console.log('[twitter/callback] state match:', oauthData.state === state);
  console.log('[twitter/callback] codeVerifier present:', !!oauthData.codeVerifier);

  if (oauthData.state !== state) {
    console.error('[twitter/callback] state mismatch — possible CSRF or stale tab');
    return NextResponse.redirect(`${settingsUrl}?x=error&reason=state_mismatch`);
  }

  // Clear the one-time oauth cookie on the response we'll eventually return
  // (deletion handled below by not re-setting it; maxAge=600 means it expires anyway)

  // The user must be authenticated — gramketing_token cookie travels with the redirect
  const walletAddress = await getAuthWallet(req);
  if (!walletAddress) {
    return NextResponse.redirect(`${settingsUrl}?x=error&reason=not_authenticated`);
  }

  const clientId = process.env.TWITTER_CLIENT_ID;
  const clientSecret = process.env.TWITTER_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    return NextResponse.redirect(`${settingsUrl}?x=error&reason=server_misconfigured`);
  }

  // Must be byte-for-byte identical to what was sent in the authorization request
  const redirectUri =
    process.env.TWITTER_REDIRECT_URI ??
    `${origin}/api/auth/twitter/callback`;

  // Exchange authorization code for access token
  const tokenRes = await fetch('https://api.twitter.com/2/oauth2/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`,
    },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri,
      code_verifier: oauthData.codeVerifier,
    }).toString(),
  });

  if (!tokenRes.ok) {
    console.error('[twitter/callback] token exchange failed:', await tokenRes.text());
    return NextResponse.redirect(`${settingsUrl}?x=error&reason=token_exchange_failed`);
  }

  const tokenData = await tokenRes.json();
  const accessToken: string = tokenData.access_token;

  // Fetch the authenticated user's profile
  const userRes = await fetch(
    'https://api.twitter.com/2/users/me?user.fields=profile_image_url',
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );

  if (!userRes.ok) {
    console.error('[twitter/callback] user fetch failed:', await userRes.text());
    return NextResponse.redirect(`${settingsUrl}?x=error&reason=user_fetch_failed`);
  }

  const userData = await userRes.json();
  const { id: xAccountId, username: xHandle, profile_image_url: profileImageUrl } =
    userData.data ?? {};

  if (!xAccountId) {
    return NextResponse.redirect(`${settingsUrl}?x=error&reason=no_user_data`);
  }

  // Link the X account (enforces cooldown + uniqueness)
  const result = await linkXAccount(walletAddress, xAccountId, xHandle ?? '', accessToken);
  if ('error' in result) {
    return NextResponse.redirect(
      `${settingsUrl}?x=error&reason=${encodeURIComponent(result.error)}`,
    );
  }

  // Store the higher-resolution profile image (swap _normal → _400x400)
  if (profileImageUrl) {
    await prisma.user.update({
      where: { walletAddress },
      data: { xProfileImageUrl: profileImageUrl.replace('_normal', '_400x400') },
    });
  }

  return NextResponse.redirect(`${settingsUrl}?x=linked`);
}
