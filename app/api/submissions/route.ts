import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAuthWallet } from '@/lib/auth';
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
    return null; // API failed — don't block the submission
  }
}

async function fetchTelegramViews(postUrl: string): Promise<number | null> {
  const match = postUrl.match(/t\.me\/([^/]+)\/(\d+)/);
  if (!match) return null;
  const [, chat, msgId] = match;
  try {
    const res = await axios.get(
      `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/getChatHistory`,
      { params: { chat_id: `@${chat}`, from_message_id: parseInt(msgId, 10), limit: 1 }, timeout: 8000 }
    );
    const messages = res.data?.result ?? [];
    if (messages.length > 0) return messages[0].views ?? null;
    return null;
  } catch {
    return null; // API failed — don't block the submission
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
    if (platform === 'X') {
      views = await fetchXViews(postUrl);
    } else {
      views = await fetchTelegramViews(postUrl);
    }

    // Only reject if we successfully fetched and views are below minimum
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
        ...(views !== null ? { currentViews: views } : {}),
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
