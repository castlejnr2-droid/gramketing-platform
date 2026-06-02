import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAuthWallet } from '@/lib/auth';

// GET: Redirect to Twitter OAuth 2.0 PKCE authorization URL
// TODO: Implement full Twitter OAuth 2.0 PKCE flow
// Steps:
// 1. Generate code_verifier (random 43–128 char string)
// 2. Compute code_challenge = base64url(sha256(code_verifier))
// 3. Store code_verifier in session/cookie
// 4. Redirect to:
//    https://twitter.com/i/oauth2/authorize
//      ?response_type=code
//      &client_id=TWITTER_CLIENT_ID
//      &redirect_uri=CALLBACK_URL
//      &scope=tweet.read+users.read
//      &state=RANDOM_STATE
//      &code_challenge=CODE_CHALLENGE
//      &code_challenge_method=S256
export async function GET(req: NextRequest) {
  const clientId = process.env.TWITTER_CLIENT_ID;
  const redirectUri = `${req.nextUrl.origin}/api/auth/link-x/callback`;

  if (!clientId) {
    return NextResponse.json(
      { error: 'TWITTER_CLIENT_ID not configured' },
      { status: 500 }
    );
  }

  // TODO: generate proper PKCE challenge and state
  const state = Math.random().toString(36).slice(2);
  const codeVerifier = Math.random().toString(36).slice(2).repeat(3);

  const params = new URLSearchParams({
    response_type: 'code',
    client_id: clientId,
    redirect_uri: redirectUri,
    scope: 'tweet.read users.read',
    state,
    code_challenge: codeVerifier, // TODO: replace with actual sha256 PKCE challenge
    code_challenge_method: 'plain', // TODO: use S256
  });

  const url = `https://twitter.com/i/oauth2/authorize?${params}`;
  return NextResponse.redirect(url);
}

// POST: Update X handle manually (simplified approach)
// Also handles OAuth callback exchange
export async function POST(req: NextRequest) {
  try {
    const walletAddress = await getAuthWallet(req);
    if (!walletAddress) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();

    // Simple handle update (manual linking)
    if (body.xHandle) {
      const user = await prisma.user.update({
        where: { walletAddress },
        data: { xHandle: body.xHandle.replace('@', '') },
      });
      return NextResponse.json({ success: true, xHandle: user.xHandle });
    }

    // TODO: OAuth code exchange
    // If body.code is present, exchange for access token:
    // POST https://api.twitter.com/2/oauth2/token
    // body: grant_type=authorization_code&code=CODE&redirect_uri=REDIRECT_URI
    //       &code_verifier=CODE_VERIFIER&client_id=CLIENT_ID
    // Save xAccessToken to user record
    if (body.code) {
      return NextResponse.json(
        { error: 'OAuth code exchange not yet implemented' },
        { status: 501 }
      );
    }

    return NextResponse.json({ error: 'Missing xHandle or code' }, { status: 400 });
  } catch (err) {
    console.error('Link X error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
