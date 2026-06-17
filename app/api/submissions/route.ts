import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAuthWallet } from '@/lib/auth';
import { fetchTelegramPostMetrics, extractTelegramChannel } from '@/lib/telegram';
import { fetchTweetMetrics, extractTweetId } from '@/lib/twitter-api';

const X_REGEX = /^https?:\/\/(www\.)?(x\.com|twitter\.com)\/[^/]+\/status\/\d+/;
const TG_REGEX = /^https?:\/\/t\.me\/[^/]+\/\d+/;
const MAX_DAILY_SUBMISSIONS = 2;
const MIN_VIEWS = 100;

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
      return NextResponse.json(
        { error: `This pool has ${pool.status === 'ENDED' ? 'ended' : 'already distributed rewards'} - no more submissions accepted.` },
        { status: 400 }
      );
    }

    // ── Campaign type gate ─────────────────────────────────────────────────────
    const campaignType = pool.campaignType ?? 'both';
    if (campaignType === 'x' && platform === 'TELEGRAM') {
      return NextResponse.json(
        { error: 'This pool only accepts X (Twitter) posts.' },
        { status: 400 }
      );
    }
    if (campaignType === 'telegram' && platform === 'X') {
      return NextResponse.json(
        { error: 'This pool only accepts Telegram posts.' },
        { status: 400 }
      );
    }

    const user = await prisma.user.findUniqueOrThrow({ where: { walletAddress } });

    // ── X account required for X posts ───────────────────────────────────
    if (platform === 'X' && !user.xAccountId) {
      return NextResponse.json(
        { error: 'Connect your X account in Settings before submitting X posts.' },
        { status: 403 }
      );
    }

    // ── Telegram channel ownership check ─────────────────────────────────
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

    // Pool-wide dedup: a given postLink may be submitted only once per pool,
    // by anyone. This prevents one post from being claimed by multiple participants.
    const existingPost = await prisma.poolPost.findFirst({
      where: { poolId, postLink: postUrl },
    });
    if (existingPost) {
      return NextResponse.json(
        { error: 'This post has already been submitted to this pool.' },
        { status: 409 }
      );
    }

    // Daily submission limit (2 total per day across both platforms)
    const todayStart = new Date();
    todayStart.setUTCHours(0, 0, 0, 0);
    const todayEnd = new Date();
    todayEnd.setUTCHours(23, 59, 59, 999);

    const todayCount = await prisma.poolPost.count({
      where: {
        participantId: participant.id,
        submittedAt: { gte: todayStart, lte: todayEnd },
      },
    });
    if (todayCount >= MAX_DAILY_SUBMISSIONS) {
      return NextResponse.json(
        { error: `Daily submission limit reached (${MAX_DAILY_SUBMISSIONS}/day). Come back tomorrow at midnight UTC!` },
        { status: 429 }
      );
    }

    // ── Fetch metrics + verify tweet authorship (X only, one API call) ───
    // author_id is returned alongside public_metrics in the same batch call.
    // Fail-CLOSED: if we cannot confirm the author (API error, tweet not found,
    // or pre-fix cache row with null authorId) we reject — no silent bypass.
    let views = 0;
    let likes = 0;
    let reposts = 0;
    let reactions = 0;
    let fetchedViews: number | null = null;

    if (platform === 'X') {
      const tweetId = extractTweetId(postUrl);
      if (!tweetId) {
        return NextResponse.json(
          { error: 'Could not parse tweet ID from URL.' },
          { status: 400 },
        );
      }

      const [result] = await fetchTweetMetrics([tweetId]);

      if (!result.ok) {
        // Tweet not found, API down, or rate-limited — can't verify ownership.
        return NextResponse.json(
          { error: "Couldn't verify your tweet — please try again in a moment." },
          { status: 503 },
        );
      }

      // Fail-closed: null authorId means cache row predates this field or API
      // omitted it — either way we cannot confirm ownership, so we reject.
      if (!result.authorId || result.authorId !== user.xAccountId) {
        return NextResponse.json(
          {
            error: result.authorId
              ? 'This tweet was not authored by your linked X account.'
              : "Couldn't verify tweet ownership — please try again in a moment.",
          },
          { status: 403 },
        );
      }

      fetchedViews = result.views;
      views = result.views;
      likes = result.likes;
      reposts = result.retweets;
    } else {
      const metrics = await fetchTelegramPostMetrics(postUrl);
      if (metrics.views > 0 || metrics.reactions > 0) {
        fetchedViews = metrics.views;
        views = metrics.views;
        reactions = metrics.reactions;
      }
    }

    // Reject when we have a confident view count below minimum
    if (fetchedViews !== null && fetchedViews < MIN_VIEWS) {
      return NextResponse.json(
        {
          error: `This post doesn't qualify yet - it needs at least ${MIN_VIEWS} views. Current count: ${fetchedViews.toLocaleString()}. Try again once it grows!`,
        },
        { status: 422 }
      );
    }

    // Calculate initial points
    const points =
      platform === 'X'
        ? views >= MIN_VIEWS ? views * 0.8 + likes * 0.1 + reposts * 0.1 : 0
        : views * 0.8 + reactions * 0.2;

    let poolPost;
    try {
      poolPost = await prisma.poolPost.create({
        data: {
          poolId,
          participantId: participant.id,
          platform,
          postLink: postUrl,
          views,
          likes,
          reposts,
          reactions,
          points,
        },
      });
    } catch (createErr: unknown) {
      // Safety net: the @@unique([poolId, postLink]) constraint fires if a
      // concurrent request slipped through the pre-check above.
      const code = (createErr as { code?: string })?.code;
      if (code === 'P2002') {
        return NextResponse.json(
          { error: 'This post has already been submitted to this pool.' },
          { status: 409 }
        );
      }
      throw createErr;
    }

    return NextResponse.json({ poolPost }, { status: 201 });
  } catch (err: unknown) {
    console.error('POST /api/submissions error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
