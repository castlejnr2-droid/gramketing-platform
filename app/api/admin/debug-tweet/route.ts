/**
 * GET /api/admin/debug-tweet?tweetId=<id>
 *
 * Diagnostic endpoint — admin only.
 * Makes a raw Twitter API call for the given tweet ID (no cache, no DB read-through),
 * then returns:
 *   - rawApi:      exactly what Twitter returned
 *   - cache:       current TweetMetricsCache row for this tweet
 *   - poolPost:    matching PoolPost record(s) from the DB
 *   - discrepancy: flag if API numbers differ from DB
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAuthWallet, isAdmin } from '@/lib/auth';
import { extractTweetId, fetchTweetMetrics } from '@/lib/twitter-api';

export async function GET(req: NextRequest) {
  try {
    const walletAddress = await getAuthWallet(req);
    if (!walletAddress || !isAdmin(walletAddress)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const raw = searchParams.get('tweetId') ?? searchParams.get('url') ?? '';
    if (!raw) {
      return NextResponse.json(
        { error: 'Provide ?tweetId=<numeric_id> or ?url=<tweet_url>' },
        { status: 400 },
      );
    }

    // Accept either a raw ID or a tweet URL
    const tweetId = raw.match(/^\d+$/) ? raw : extractTweetId(raw);
    if (!tweetId) {
      return NextResponse.json(
        { error: 'Could not extract tweet ID from the provided value' },
        { status: 400 },
      );
    }

    // ── Direct Twitter API call (bypass ALL cache) ────────────────────────────
    const bearer = process.env.TWITTER_BEARER_TOKEN;
    if (!bearer) {
      return NextResponse.json(
        { error: 'TWITTER_BEARER_TOKEN env var is not set' },
        { status: 500 },
      );
    }

    const apiUrl =
      `https://api.twitter.com/2/tweets` +
      `?ids=${tweetId}` +
      `&tweet.fields=public_metrics,author_id,created_at`;

    const apiRes = await fetch(apiUrl, {
      headers: { Authorization: `Bearer ${bearer}` },
      signal: AbortSignal.timeout(12_000),
      // Force no HTTP cache
      cache: 'no-store',
    });

    const apiBody = await apiRes.json() as Record<string, unknown>;

    // ── DB state ──────────────────────────────────────────────────────────────
    const cacheRow = await prisma.tweetMetricsCache.findUnique({
      where: { tweetId },
    });

    const poolPosts = await prisma.poolPost.findMany({
      where: { postLink: { contains: tweetId } },
      include: {
        participant: {
          include: { user: { select: { walletAddress: true, xHandle: true } } },
        },
      },
    });

    // ── fetchTweetMetrics with bypassCache to confirm our lib flow works ─────
    const [libResult] = await fetchTweetMetrics([tweetId], { bypassCache: true });

    // ── Discrepancy check ────────────────────────────────────────────────────
    const apiTweet = (apiBody.data as Array<{
      id: string;
      public_metrics: { impression_count: number; like_count: number; retweet_count: number };
    }> | undefined)?.[0];

    const discrepancies: string[] = [];
    if (apiTweet && poolPosts.length > 0) {
      const post = poolPosts[0];
      if (apiTweet.public_metrics.impression_count !== post.views) {
        discrepancies.push(`views: API=${apiTweet.public_metrics.impression_count} DB=${post.views}`);
      }
      if (apiTweet.public_metrics.like_count !== post.likes) {
        discrepancies.push(`likes: API=${apiTweet.public_metrics.like_count} DB=${post.likes}`);
      }
      if (apiTweet.public_metrics.retweet_count !== post.reposts) {
        discrepancies.push(`reposts: API=${apiTweet.public_metrics.retweet_count} DB=${post.reposts}`);
      }
    }

    return NextResponse.json({
      tweetId,
      rawApi: {
        httpStatus: apiRes.status,
        body: apiBody,
      },
      cache: cacheRow
        ? {
            views: cacheRow.views,
            likes: cacheRow.likes,
            retweets: cacheRow.retweets,
            fetchedAt: cacheRow.fetchedAt,
            utcDay: cacheRow.utcDay,
            ageMinutes: Math.round((Date.now() - cacheRow.fetchedAt.getTime()) / 60_000),
          }
        : null,
      poolPosts: poolPosts.map((p) => ({
        id: p.id,
        postLink: p.postLink,
        views: p.views,
        likes: p.likes,
        reposts: p.reposts,
        points: p.points,
        lastScrapedAt: p.lastScrapedAt,
        lastScrapedAgoMinutes: p.lastScrapedAt
          ? Math.round((Date.now() - p.lastScrapedAt.getTime()) / 60_000)
          : null,
        scrapeError: p.scrapeError,
        user: p.participant.user.xHandle ?? p.participant.user.walletAddress,
      })),
      libResult,
      discrepancies: discrepancies.length > 0 ? discrepancies : 'none',
      verdict: (() => {
        if (apiRes.status === 401 || apiRes.status === 403) return 'TOKEN_INVALID — bearer token rejected';
        if (apiRes.status === 429) return 'RATE_LIMITED';
        if (!apiTweet && apiBody.errors) return `TWEET_NOT_FOUND — ${JSON.stringify(apiBody.errors)}`;
        if (!apiTweet) return 'UNKNOWN';
        if (discrepancies.length === 0) return 'API_MATCHES_DB — Twitter is returning these exact numbers; X UI may show slightly different metrics due to internal Twitter caching';
        // DB is stale — distinguish expected lag vs scraper failure
        const post = poolPosts[0];
        const lastScrapedMins = post?.lastScrapedAt
          ? Math.round((Date.now() - post.lastScrapedAt.getTime()) / 60_000)
          : null;
        if (lastScrapedMins !== null && lastScrapedMins <= 35) {
          return `STALE_DB (expected) — scraper ran ${lastScrapedMins} min ago; tweet has grown since then. Next scrape will update it.`;
        }
        return `STALE_DB (scraper may be broken) — last scraped ${lastScrapedMins ?? 'never'} min ago. Check Railway logs for DB write errors.`;
      })(),
    });
  } catch (err) {
    console.error('GET /api/admin/debug-tweet error:', err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
