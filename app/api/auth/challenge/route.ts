import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { randomBytes } from 'crypto';

const CHALLENGE_TTL_MS = 5 * 60 * 1000; // 5 minutes

/**
 * GET /api/auth/challenge
 *
 * Issues a single-use nonce (payload) for use as the ton_proof payload.
 * The client passes this to TonConnectUI.setConnectRequestParameters()
 * before the user connects their wallet. The wallet signs a message that
 * includes this payload; /api/auth/verify checks it was server-issued,
 * not yet used, and not expired.
 *
 * Also cleans up expired challenges on each call (best-effort).
 */
export async function GET() {
  // Non-critical cleanup of expired nonces
  prisma.tonProofChallenge
    .deleteMany({ where: { expiresAt: { lt: new Date() } } })
    .catch(() => {});

  const payload   = randomBytes(32).toString('hex'); // 64-char hex string
  const expiresAt = new Date(Date.now() + CHALLENGE_TTL_MS);

  await prisma.tonProofChallenge.create({ data: { payload, expiresAt } });

  return NextResponse.json({ payload, expiresAt: expiresAt.toISOString() });
}
