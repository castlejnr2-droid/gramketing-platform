import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAuthWallet } from '@/lib/auth';

const X_REGEX = /^https?:\/\/(www\.)?(x\.com|twitter\.com)\/[^/]+\/status\/\d+/;
const TG_REGEX = /^https?:\/\/t\.me\/[^/]+\/\d+/;
const MAX_DAILY_SUBMISSIONS = 2;

export async function POST(req: NextRequest) {
  try {
    const walletAddress = await getAuthWallet(req);
    if (!walletAddress) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { poolId, platform, postUrl } = await req.json();

    if (!poolId || !platform || !postUrl) {
      return NextResponse.json(
        { error: 'Missing poolId, platform, or postUrl' },
        { status: 400 }
      );
    }

    if (!['X', 'TELEGRAM'].includes(platform)) {
      return NextResponse.json({ error: 'Invalid platform' }, { status: 400 });
    }

    // Validate URL format
    if (platform === 'X' && !X_REGEX.test(postUrl)) {
      return NextResponse.json(
        {
          error:
            'Invalid X URL. Must match https://x.com/username/status/123456789',
        },
        { status: 400 }
      );
    }
    if (platform === 'TELEGRAM' && !TG_REGEX.test(postUrl)) {
      return NextResponse.json(
        {
          error:
            'Invalid Telegram URL. Must match https://t.me/channelname/123',
        },
        { status: 400 }
      );
    }

    // Check pool is active
    const pool = await prisma.pool.findUnique({ where: { id: poolId } });
    if (!pool) {
      return NextResponse.json({ error: 'Pool not found' }, { status: 404 });
    }
    if (pool.status !== 'ACTIVE') {
      return NextResponse.json(
        { error: 'Pool is not active' },
        { status: 400 }
      );
    }

    const user = await prisma.user.findUniqueOrThrow({
      where: { walletAddress },
    });

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
    const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
    const todayCount = await prisma.submission.count({
      where: {
        poolId,
        userId: user.id,
        submittedDate: today,
      },
    });

    if (todayCount >= MAX_DAILY_SUBMISSIONS) {
      return NextResponse.json(
        {
          error: `Daily submission limit reached (${MAX_DAILY_SUBMISSIONS}/day). Come back tomorrow!`,
        },
        { status: 429 }
      );
    }

    // Create submission (unique per poolId+userId+platform+date)
    const submission = await prisma.submission.create({
      data: {
        poolId,
        userId: user.id,
        platform,
        postUrl,
        submittedDate: today,
        status: 'PENDING',
      },
    });

    return NextResponse.json({ submission }, { status: 201 });
  } catch (err: unknown) {
    // Handle unique constraint violation (duplicate submission)
    if (
      err instanceof Error &&
      err.message.includes('Unique constraint failed')
    ) {
      return NextResponse.json(
        { error: 'You already submitted this post today for this pool' },
        { status: 409 }
      );
    }
    console.error('POST /api/submissions error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
