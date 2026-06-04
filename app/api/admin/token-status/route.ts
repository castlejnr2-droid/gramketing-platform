import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAuthWallet, isAdmin } from '@/lib/auth';
import axios from 'axios';

export async function GET(req: NextRequest) {
  try {
    const walletAddress = await getAuthWallet(req);
    if (!walletAddress || !isAdmin(walletAddress)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const bearerToken = process.env.TWITTER_BEARER_TOKEN;

    // Check if bearer token is configured
    if (!bearerToken) {
      return NextResponse.json({
        xToken: { configured: false, valid: false, error: 'TWITTER_BEARER_TOKEN not set' },
      });
    }

    // Probe the Twitter API with a lightweight lookup
    let xValid = false;
    let xError: string | null = null;
    try {
      await axios.get('https://api.twitter.com/2/tweets/1', {
        headers: { Authorization: `Bearer ${bearerToken}` },
        timeout: 6_000,
        validateStatus: (s) => s !== 401 && s !== 403, // 404 is fine (tweet doesn't exist)
      });
      xValid = true;
    } catch (err: unknown) {
      const status = (err as { response?: { status?: number } })?.response?.status;
      if (status === 401 || status === 403) {
        xError = `Token rejected by Twitter API (HTTP ${status})`;
      } else {
        // Network error, rate limit, etc. — don't flag as expired
        xValid = true;
        xError = `Could not verify (${status ?? 'network error'}) — token may still be valid`;
      }
    }

    // Count PoolPost records with TOKEN_EXPIRED scrape errors
    const expiredPostCount = await prisma.poolPost.count({
      where: { scrapeError: { contains: 'TOKEN_EXPIRED' } },
    });

    return NextResponse.json({
      xToken: {
        configured: true,
        valid: xValid,
        error: xError,
      },
      expiredPostCount,
    });
  } catch (err) {
    console.error('GET /api/admin/token-status error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
