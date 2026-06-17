/**
 * Twitter API v2 integration for fetching tweet public_metrics + author_id.
 *
 * Key design decisions:
 *  - Batch endpoint: GET /2/tweets?ids=id1,id2,...&tweet.fields=public_metrics,author_id
 *    fetches up to 100 IDs per HTTP call instead of one per tweet.
 *    author_id is included so the submission route can verify ownership in the
 *    same call — no separate round-trip needed.
 *  - Results are cached in TweetMetricsCache keyed by (tweetId, utcDay).
 *    A cached row for today is returned without hitting the API, avoiding
 *    duplicate charges ($0.005/tweet on the Basic plan). authorId is also
 *    stored in the cache; rows written before this field was added have
 *    authorId = null (the submission route treats null as unverifiable → reject).
 *  - Exponential back-off on 429 / transient network errors (3 attempts).
 *  - Auth errors (401/403) are surfaced immediately as TOKEN_EXPIRED so the
 *    scraper can halt and alert rather than burning retries.
 */

import { prisma } from '@/lib/prisma';

// ── Public types ──────────────────────────────────────────────────────────────

export interface TweetMetrics {
  tweetId: string;
  authorId: string | null; // numeric Twitter user ID; null for pre-fix cache rows
  views: number;    // impression_count
  likes: number;    // like_count
  retweets: number; // retweet_count
}

export type TweetFetchResult =
  | (TweetMetrics & { ok: true; fromCache: boolean })
  | { tweetId: string; ok: false; error: 'NOT_FOUND' | 'TOKEN_EXPIRED' | 'RATE_LIMITED' | 'UNKNOWN' };

// ── Internal helpers ──────────────────────────────────────────────────────────

function todayUtc(): string {
  return new Date().toISOString().slice(0, 10); // YYYY-MM-DD
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Raw shape of the API response (only the fields we care about). */
interface TwitterBatchResponse {
  data?: Array<{
    id: string;
    author_id?: string; // present when tweet.fields=author_id is requested
    public_metrics: {
      impression_count: number;
      like_count: number;
      retweet_count: number;
    };
  }>;
  errors?: Array<{ resource_id: string; title: string }>;
}

/**
 * Calls GET /2/tweets?ids=...&tweet.fields=public_metrics for one chunk of IDs
 * (max 100). Retries up to 3 times with exponential back-off for transient
 * failures. Throws immediately on 401/403 so the caller can surface TOKEN_EXPIRED.
 */
async function apiBatch(ids: string[]): Promise<TwitterBatchResponse> {
  const bearer = process.env.TWITTER_BEARER_TOKEN;
  if (!bearer) throw new Error('TWITTER_BEARER_TOKEN env var is not set');

  const url =
    `https://api.twitter.com/2/tweets` +
    `?ids=${ids.join(',')}` +
    `&tweet.fields=public_metrics,author_id`;

  for (let attempt = 1; attempt <= 3; attempt++) {
    let httpStatus = 0;
    try {
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${bearer}` },
        signal: AbortSignal.timeout(12_000),
      });
      httpStatus = res.status;

      if (httpStatus === 401 || httpStatus === 403) {
        throw Object.assign(new Error('TOKEN_EXPIRED'), { status: httpStatus });
      }

      if (httpStatus === 429) {
        const retryAfterSecs = parseInt(res.headers.get('retry-after') ?? '0', 10);
        const waitMs = retryAfterSecs > 0 ? retryAfterSecs * 1000 : 15_000 * attempt;
        if (attempt < 3) {
          await sleep(waitMs);
          continue;
        }
        throw Object.assign(new Error('RATE_LIMITED'), { status: 429 });
      }

      if (!res.ok) {
        throw Object.assign(new Error(`HTTP ${httpStatus}`), { status: httpStatus });
      }

      return (await res.json()) as TwitterBatchResponse;
    } catch (e) {
      const status = (e as { status?: number })?.status ?? httpStatus;
      // Never retry auth errors
      if (status === 401 || status === 403) throw e;
      if (attempt === 3) throw e;
      // Back-off: 1 s before attempt 2, 2 s before attempt 3
      await sleep(1000 * 2 ** (attempt - 1));
    }
  }
  throw new Error('retry exhausted');
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Extracts the numeric tweet ID from an x.com / twitter.com status URL.
 * Returns null if the URL doesn't match /status/<digits>.
 */
export function extractTweetId(postUrl: string): string | null {
  const m = postUrl.match(/status\/(\d+)/);
  return m ? m[1] : null;
}

/**
 * Fetches public_metrics for a list of tweet IDs using the Twitter v2 batch
 * endpoint, with per-UTC-day DB caching.
 *
 * Algorithm:
 *  1. Look up all IDs in TweetMetricsCache where utcDay = today → cache hits.
 *  2. Fetch remaining IDs from the API in chunks of ≤ 100.
 *  3. Write fresh results to the cache.
 *  4. Return one TweetFetchResult per input ID, in the same order.
 *
 * Duplicate IDs in the input are deduplicated for the API call but the result
 * array still has one entry per original input element.
 */
export async function fetchTweetMetrics(tweetIds: string[]): Promise<TweetFetchResult[]> {
  if (tweetIds.length === 0) return [];

  const today = todayUtc();
  const unique = [...new Set(tweetIds)];

  // ── 1. Cache check ──────────────────────────────────────────────────────────
  const cached = await prisma.tweetMetricsCache.findMany({
    where: { tweetId: { in: unique }, utcDay: today },
  });
  const cacheMap = new Map(cached.map((c) => [c.tweetId, c]));

  const toFetch = unique.filter((id) => !cacheMap.has(id));

  const resultMap = new Map<string, TweetFetchResult>();

  for (const c of cached) {
    resultMap.set(c.tweetId, {
      ok: true,
      fromCache: true,
      tweetId: c.tweetId,
      authorId: c.authorId ?? null, // null for rows written before this field existed
      views: c.views,
      likes: c.likes,
      retweets: c.retweets,
    });
  }

  // ── 2. Fetch uncached IDs in chunks of 100 ─────────────────────────────────
  for (let i = 0; i < toFetch.length; i += 100) {
    const chunk = toFetch.slice(i, i + 100);
    let chunkError: 'TOKEN_EXPIRED' | 'RATE_LIMITED' | 'UNKNOWN' | null = null;

    try {
      const json = await apiBatch(chunk);

      // IDs Twitter explicitly reports as not found
      const notFoundIds = new Set(
        (json.errors ?? [])
          .filter((e) => /not found/i.test(e.title))
          .map((e) => e.resource_id),
      );

      // Process returned tweets and queue cache writes
      const upserts: Promise<unknown>[] = [];

      for (const tweet of json.data ?? []) {
        const pm = tweet.public_metrics;
        const m: TweetMetrics = {
          tweetId: tweet.id,
          authorId: tweet.author_id ?? null,
          views: pm.impression_count ?? 0,
          likes: pm.like_count ?? 0,
          retweets: pm.retweet_count ?? 0,
        };
        resultMap.set(tweet.id, { ok: true, fromCache: false, ...m });
        upserts.push(
          prisma.tweetMetricsCache.upsert({
            where: { tweetId: m.tweetId },
            create: { tweetId: m.tweetId, authorId: m.authorId, views: m.views, likes: m.likes, retweets: m.retweets, utcDay: today, fetchedAt: new Date() },
            update: { authorId: m.authorId, views: m.views, likes: m.likes, retweets: m.retweets, utcDay: today, fetchedAt: new Date() },
          }),
        );
      }

      await Promise.all(upserts);

      // Mark not-found IDs
      for (const id of notFoundIds) {
        resultMap.set(id, { tweetId: id, ok: false, error: 'NOT_FOUND' });
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : '';
      const status = (e as { status?: number })?.status ?? 0;
      chunkError =
        status === 401 || status === 403 || msg === 'TOKEN_EXPIRED' ? 'TOKEN_EXPIRED' :
        status === 429  || msg === 'RATE_LIMITED'                   ? 'RATE_LIMITED'  :
                                                                      'UNKNOWN';
    }

    // Any chunk IDs still absent from resultMap → mark as the chunk-level error
    for (const id of chunk) {
      if (!resultMap.has(id)) {
        resultMap.set(id, { tweetId: id, ok: false, error: chunkError ?? 'UNKNOWN' });
      }
    }
  }

  // ── 3. Return in original input order ─────────────────────────────────────
  return tweetIds.map(
    (id) => resultMap.get(id) ?? { tweetId: id, ok: false, error: 'UNKNOWN' as const },
  );
}
