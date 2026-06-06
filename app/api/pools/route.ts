import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAuthWallet } from '@/lib/auth';
import { notifyNewPool } from '@/lib/telegram-notify';
import { deployAndInitPool } from '@/lib/gramketing-pool-contract';
import { calculateFeeInTokens } from '@/lib/prices';
import { logAdminEvent } from '@/lib/admin-log';

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

    // Validate fee proof is provided
    if (!accessFeeTxHash) {
      return NextResponse.json(
        { error: 'Access fee transaction hash is required. Please complete payment first.' },
        { status: 400 }
      );
    }

    const feeCurrency: 'TON' | 'MGRAM' = accessFeePaidIn === 'MGRAM' ? 'MGRAM' : 'TON';

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
        accessFeePaidIn: feeCurrency,
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

    // ── Record platform revenue (fee payment) ─────────────────────────────────
    try {
      const { usdAmount, tokenAmount } = await calculateFeeInTokens(durationDays, feeCurrency);
      await prisma.platformRevenue.create({
        data: {
          poolId: pool.id,
          currency: feeCurrency,
          tokenAmount: tokenAmount.toFixed(9),
          usdValueAtTime: usdAmount,
          txHash: accessFeeTxHash,
        },
      });
      await logAdminEvent({
        action: 'FEE_RECORDED',
        level: 'info',
        poolId: pool.id,
        message: `Access fee recorded: ${tokenAmount.toFixed(4)} ${feeCurrency} (~$${usdAmount.toFixed(2)}) for ${durationDays}-day pool`,
        details: { feeCurrency, tokenAmount, usdAmount, txHash: accessFeeTxHash },
      });
    } catch (feeErr) {
      console.error('Failed to record platform revenue for pool', pool.id, feeErr);
      await logAdminEvent({
        action: 'FEE_RECORDED',
        level: 'error',
        poolId: pool.id,
        message: `Failed to record access fee in PlatformRevenue: ${feeErr instanceof Error ? feeErr.message : String(feeErr)}`,
        details: { feeCurrency, txHash: accessFeeTxHash },
      });
    }

    // ── Deploy escrow contract on-chain and send CreatePool message ───────────
    try {
      const adminAddress = process.env.ADMIN_WALLET_ADDRESS;
      if (!adminAddress) throw new Error('ADMIN_WALLET_ADDRESS is not configured');

      const { contractAddress: deployedAddress } = await deployAndInitPool({
        ownerAddress: walletAddress,
        adminAddress,
        jettonMasterAddress,
        totalReward: String(totalReward),
        durationDays,
        rewardSlots,
        nonce: BigInt(pool.createdAt.getTime()), // unique per pool - ms timestamp from DB
      });

      await prisma.pool.update({
        where: { id: pool.id },
        data: { contractAddress: deployedAddress },
      });

      pool.contractAddress = deployedAddress;

      await logAdminEvent({
        action: 'DEPLOY_CONTRACT',
        level: 'info',
        poolId: pool.id,
        message: `Escrow contract deployed: ${deployedAddress}`,
        details: { contractAddress: deployedAddress },
      });
    } catch (deployErr) {
      const errMsg = deployErr instanceof Error ? deployErr.message : String(deployErr);
      console.error('Contract deployment failed (pool created in DB):', deployErr);
      await logAdminEvent({
        action: 'DEPLOY_CONTRACT',
        level: 'error',
        poolId: pool.id,
        message: `Contract deployment failed - pool exists in DB but has no escrow contract. ${errMsg}`,
        details: { error: errMsg },
      });
      // Pool is still created in DB; creator can retry deposit later via admin action
    }

    // Notify opted-in users about the new pool (fire-and-forget)
    notifyNewPool(project.name, project.name, pool.totalReward).catch(console.error);

    return NextResponse.json({ pool }, { status: 201 });
  } catch (err) {
    console.error('POST /api/pools error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
