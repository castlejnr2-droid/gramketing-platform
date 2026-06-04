import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAuthWallet } from '@/lib/auth';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const status = searchParams.get('status'); // ACTIVE | ENDED | DISTRIBUTED
    const search = searchParams.get('search');
    const ownerAddress = searchParams.get('ownerAddress');
    const limit = parseInt(searchParams.get('limit') ?? '50');

    const where: Record<string, unknown> = {};

    if (status && ['ACTIVE', 'ENDED', 'DISTRIBUTED'].includes(status)) {
      where.status = status;
    }

    if (search) {
      where.OR = [
        { project: { name: { contains: search, mode: 'insensitive' } } },
        { tokenSymbol: { contains: search, mode: 'insensitive' } },
      ];
    }

    if (ownerAddress) {
      where.project = { ownerWalletAddress: ownerAddress };
    }

    const pools = await prisma.pool.findMany({
      where,
      take: limit,
      orderBy: { createdAt: 'desc' },
      include: {
        project: { select: { id: true, name: true, logoUrl: true, ownerWalletAddress: true } },
        _count: { select: { participants: true } },
      },
    });

    return NextResponse.json({ pools });
  } catch (err) {
    console.error('GET /api/pools error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const walletAddress = await getAuthWallet(req);
    if (!walletAddress) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const {
      projectName,
      tokenSymbol,
      jettonMasterAddress,
      logoUrl,
      description,
      contractAddress,
      totalReward,
      durationDays,
      rewardSlots,
      tier1Threshold,
      tier2Threshold,
      tier3Threshold,
      accessFeePaidIn,
      accessFeeTxHash,
      campaignType,
      xPostLink,
      telegramPostLink,
      xConfig,
      telegramConfig,
    } = body;

    if (!projectName || !tokenSymbol || !jettonMasterAddress || !totalReward || !durationDays || !rewardSlots) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    if (![7, 14, 21, 28].includes(durationDays)) {
      return NextResponse.json(
        { error: 'Duration must be 7, 14, 21, or 28 days' },
        { status: 400 }
      );
    }

    if (rewardSlots < 3) {
      return NextResponse.json(
        { error: 'Minimum 3 reward slots required' },
        { status: 400 }
      );
    }

    // Find or create project
    let project = await prisma.project.findFirst({
      where: {
        ownerWalletAddress: walletAddress,
        jettonMasterAddress,
      },
    });

    if (!project) {
      project = await prisma.project.create({
        data: {
          ownerWalletAddress: walletAddress,
          name: projectName,
          tokenSymbol,
          jettonMasterAddress,
          logoUrl: logoUrl || null,
          description: description || null,
        },
      });
    }

    const now = new Date();
    const endDate = new Date(now.getTime() + durationDays * 24 * 60 * 60 * 1000);

    const pool = await prisma.pool.create({
      data: {
        projectId: project.id,
        contractAddress: contractAddress || null,
        totalReward: String(totalReward),
        tokenSymbol,
        jettonMasterAddress,
        durationDays,
        rewardSlots,
        tier1Threshold: BigInt(tier1Threshold ?? 0),
        tier2Threshold: BigInt(tier2Threshold ?? 0),
        tier3Threshold: BigInt(tier3Threshold ?? 0),
        accessFeePaidIn: accessFeePaidIn ?? 'TON',
        accessFeeTxHash: accessFeeTxHash || null,
        campaignType: campaignType ?? 'both',
        xPostLink: xPostLink || null,
        telegramPostLink: telegramPostLink || null,
        xConfig: xConfig || null,
        telegramConfig: telegramConfig || null,
        startDate: now,
        endDate,
        status: 'ACTIVE',
      },
      include: {
        project: true,
      },
    });

    return NextResponse.json({ pool }, { status: 201 });
  } catch (err) {
    console.error('POST /api/pools error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
