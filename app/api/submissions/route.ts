import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAuthWallet } from '@/lib/auth';
import { fetchTelegramPostMetrics, extractTelegramChannel } from '@/lib/telegram';
import axios from 'axios';

const X_REGEX = /^https?:\/\/(www\.)?(x\.com|twitter\.com)\/[^/]+\/status\/\d+/;
const TG_REGEX = /^https?:\/\/t\.me\/[^/]+\/\d+/;
const MAX_DAILY_SUBMISSIONS = 2;
const MIN_VIEWS = 100;

async function fetchXViews(postUrl: string): Promise<number | null> {
  const match = postUrl.match(/status\/(\d+)/);
  if (!match) return null;
  const tweetId = match[1];
  try {
    const res = await axios.get(
      `https://api.twitter.com/2/tweets/${tweetId}?tweet.fields=public_metrics`,
      { headers: { Authorization: `Bearer ${process.env.TWITTER_BEARER_TOKEN}` }, timeout: 8000 }
    );
    return res.data?.data?.public_metrics?.impression_count ?? null;
  } catch {
    return null; // fail open — don't block on API error
  }
}

export async function POST(req: NextRequest) {
  try {
    const walletAddress = await getAuthWallet(req);
    if (!walletAddress) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { poolId, platform, postUrl } = await req.json();

    if (!poolId || !platform || !postUrl) {
      return NextResponse.json({ error: 'Missing poolId, platform, or postUrl' }, { status: 400 });
    }

    if (!['X', 'TELEGRAM'].includes(platform)) {
      return NextResponse.json({ error: 'Invalid platform' }, { status: 400 });
    }

    if (platform === 'X' && !X_REGEX.test(postUrl)) {
      return NextResponse.json(
        { error: 'Invalid X URL. Must match https://x.com/username/status/123456789' },
        { status: 400 }
      );
    }
    if (platform === 'TELEGRAM' && !TG_REGEX.test(postUrl)) {
      return NextResponse.json(
        { error: 'Invalid Telegram URL. Must match https://t.me/channelname/123' },
        { status: 400 }
      );
    }

    // Check pool is active
    const pool = await prisma.pool.findUnique({ where: { id: poolId } });
    if (!pool) return NextResponse.json({ error: 'Pool not found' }, { status: 404 });
    if (pool.status !== 'ACTIVE') {
      return NextResponse.json({ error: 'Pool is not active' }, { status: 400 });
    }

    const user = await prisma.user.findUniqueOrThrow({ where: { walletAddress } });

    // ── Telegram channel ownership check ──────────────────────────────────
    if (platform === 'TELEGRAM') {
      const savedChannel = user.telegramChannelUrl
        ? extractTelegramChannel(user.telegramChannelUrl)
        : null;

      if (!savedChannel) {
        return NextResponse.json(
          { error: 'Please set your Telegram channel in Account Settings before submitting Telegram posts.' },
          { status: 400 }
        );
      }

      const postChannel = extractTelegramChannel(postUrl);
      if (!postChannel || postChannel !== savedChannel) {
        return NextResponse.json(
          { error: 'This post must be from your verified Telegram channel.' },
          { status: 400 }
        );
      }
    }

    // Ensure user is a participant
    const participant = await prisma.poolParticipant.findUnique({
      where: { poolId_userId: { poolId, userId: user.id } },
    });
    if (!participant) {
      return NextResponse.json(
        { error: 'You must join the pool before submitting posts' },
        { status: 400 }
      );
    }

    // Check daily submission limit
    const today = new Date().toISOString().split('T')[0];
    const todayCount = await prisma.submission.count({
      where: { poolId, userId: user.id, submittedDate: today },
    });
    if (todayCount >= MAX_DAILY_SUBMISSIONS) {
      return NextResponse.json(
        { error: `Daily submission limit reached (${MAX_DAILY_SUBMISSIONS}/day). Come back tomorrow!` },
        { status: 429 }
      );
    }

    // ── Immediate view check ──────────────────────────────────────────────
    let views: number | null = null;
    let reactions = 0;

    if (platform === 'X') {
      views = await fetchXViews(postUrl);
    } else {
      const metrics = await fetchTelegramPostMetrics(postUrl);
      // Only treat as a successful fetch if views is non-zero or the API explicitly returned 0
      // We check views specifically — if the fetch returned {views:0, reactions:0} due to an error
      // we can't distinguish from a real 0. Use null to signal "couldn't fetch" only for X.
      // For Telegram, any successful API response is trustworthy; errors return {views:0} too,
      // so we fail open: only reject if we got a plausible response (reactions > 0 or views > 0
      // means the API reached the message). If both are 0, treat as unknown and accept.
      if (metrics.views > 0 || metrics.reactions > 0) {
        views = metrics.views;
        reactions = metrics.reactions;
      }
    }

    // Reject only when we have a confident view count and it's below minimum
    if (views !== null && views < MIN_VIEWS) {
      return NextResponse.json(
        {
          error: `This post doesn't qualify yet. It needs at least ${MIN_VIEWS} views to be submitted. (Current: ${views.toLocaleString()})`,
        },
        { status: 422 }
      );
    }

    // Create submission
    const submission = await prisma.submission.create({
      data: {
        poolId,
        userId: user.id,
        platform,
        postUrl,
        submittedDate: today,
        status: 'PENDING',
        ...(views !== null ? { currentViews: views, reactions } : {}),
      },
    });

    return NextResponse.json({ submission }, { status: 201 });
  } catch (err: unknown) {
    if (err instanceof Error && err.message.includes('Unique constraint failed')) {
      return NextResponse.json(
        { error: 'You already submitted this post today for this pool' },
        { status: 409 }
      );
    }
    console.error('POST /api/submissions error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
