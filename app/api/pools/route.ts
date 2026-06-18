import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAuthWallet } from '@/lib/auth';
import { notifyNewPool } from '@/lib/telegram-notify';
import { deployAndInitPool } from '@/lib/gramketing-pool-contract';
import { calculateFeeInTokens, getRequiredFeeNano } from '@/lib/prices';
import { logAdminEvent } from '@/lib/admin-log';
import { verifyAccessFeeTx } from '@/lib/ton-verify';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const status = searchParams.get('status'); // ACTIVE | ENDED | DISTRIBUTED
    const search = searchParams.get('search');
    const ownerAddress = searchParams.get('ownerAddress');
    const limit = parseInt(searchParams.get('limit') ?? '50');

    const where: Record<string, unknown> = {};

    // PENDING pools are private (reward not yet deposited) and must never appear in
    // public search results. Fetching PENDING requires authentication; the project
    // owner constraint is always derived from the session wallet — the ownerAddress
    // query param is intentionally IGNORED for PENDING so it cannot be spoofed.
    if (status === 'PENDING') {
      const authWallet = await getAuthWallet(req);
      if (!authWallet) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }
      // Scope to the authenticated owner's own PENDING pools only.
      where.status = 'PENDING';
      where.project = { ownerWalletAddress: authWallet };
      // ownerAddress query param is NOT applied here — session wallet is authoritative.
    } else if (status && ['ACTIVE', 'ENDED', 'DISTRIBUTED'].includes(status)) {
      where.status = status;
      if (ownerAddress) {
        where.project = { ownerWalletAddress: ownerAddress };
      }
    } else {
      // No status filter → default public listing excludes PENDING.
      where.status = { not: 'PENDING' };
      if (ownerAddress) {
        where.project = { ownerWalletAddress: ownerAddress };
      }
    }

    if (search) {
      where.OR = [
        { project: { name: { contains: search, mode: 'insensitive' } } },
        { tokenSymbol: { contains: search, mode: 'insensitive' } },
      ];
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

    // Duplicate tx-hash guard: reject replay attacks but handle idempotent retries.
    //
    // A pool CAN already exist with this hash if:
    //   - The pool was created in DB but the HTTP response never reached the frontend
    //     (Vercel function timeout, network drop between DB write and response send).
    //   - The user double-clicked "Create Pool".
    //
    // If the existing pool belongs to THIS authenticated creator → idempotent: return
    // it as if freshly created so the frontend can advance to the deposit step.
    // If it belongs to a DIFFERENT creator → 409 (genuine replay attack).
    const existingByHash = await prisma.pool.findUnique({
      where: { accessFeeTxHash },
      include: {
        project: { select: { ownerWalletAddress: true } },
      },
    });
    if (existingByHash) {
      const existingOwner = existingByHash.project?.ownerWalletAddress ?? '';
      if (existingOwner !== walletAddress) {
        console.error(
          `POST /api/pools: replay attempt — tx ${accessFeeTxHash} already used by pool ` +
          `${existingByHash.id} (owner ${existingOwner}), attempted by ${walletAddress}`,
        );
        return NextResponse.json(
          { error: 'This transaction hash has already been used for another pool.' },
          { status: 409 },
        );
      }

      // Same creator — idempotent retry.
      //
      // This happens when the pool was created in DB but the response never reached
      // the client (Vercel function timeout, network drop, etc.).  The payment was
      // already verified when the pool was first created, so we skip re-verification.
      //
      // NOTE: We do NOT retry contract deployment here.  deployAndInitPool polls
      // TON for up to 63 seconds, which exceeds Vercel's function timeout and causes
      // a 500.  Instead, contract deployment for stuck PENDING pools is handled by
      // the Railway scraper worker (jobs/scraper.ts) which runs every 30 minutes
      // and has no execution time limit.
      console.log(
        `POST /api/pools: idempotent retry — tx ${accessFeeTxHash} → pool ` +
        `${existingByHash.id} (creator ${walletAddress}), contractAddress=${existingByHash.contractAddress ?? 'null — scraper will deploy'}`,
      );

      // Reload pool with full project (the initial include only fetched ownerWalletAddress)
      const reloadedPool = await prisma.pool.findUnique({
        where: { id: existingByHash.id },
        include: { project: true },
      });
      return NextResponse.json({ pool: reloadedPool ?? existingByHash }, { status: 201 });
    }

    // Compute the minimum on-chain amount required for this fee (USD-pegged, live price,
    // 4% tolerance).  MGRAM: fail-closed — if oracle is unavailable, reject with 503
    // so the creator can retry rather than silently accepting any amount.
    let requiredFeeNano: bigint;
    try {
      requiredFeeNano = await getRequiredFeeNano(durationDays, feeCurrency);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'fee price unavailable';
      return NextResponse.json({ error: msg }, { status: 503 });
    }

    // Verify the access fee transaction on-chain before creating the pool.
    // TON:   verifies sender == creator, destination == ADMIN_WALLET_ADDRESS, value >= required.
    // MGRAM: verifies sender == creator, jetton master == MGRAM_JETTON_MASTER_ADDRESS,
    //        recipient == TREASURY_WALLET_ADDRESS, amount >= required.
    // Env vars are read inside verifyAccessFeeTx; it returns { ok: false } if any are missing.
    const feeVerification = await verifyAccessFeeTx(
      accessFeeTxHash,
      feeCurrency,
      requiredFeeNano,
      walletAddress, // authenticated creator wallet — binds the tx sender
    );
    if (!feeVerification.ok) {
      return NextResponse.json(
        { error: `Access fee transaction could not be verified: ${feeVerification.error}` },
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

    let pool;
    try {
      pool = await prisma.pool.create({
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
          status: 'PENDING',
        },
        include: {
          project: true,
        },
      });
    } catch (createErr: unknown) {
      // P2002 = unique constraint violation — race condition on accessFeeTxHash
      // (two concurrent requests for the same hash slipped past the pre-check above).
      if (
        typeof createErr === 'object' &&
        createErr !== null &&
        'code' in createErr &&
        (createErr as { code: string }).code === 'P2002'
      ) {
        console.error(
          `POST /api/pools: P2002 race on tx hash ${accessFeeTxHash} for creator ${walletAddress}`,
        );
        return NextResponse.json(
          { error: 'This transaction hash has already been used for another pool.' },
          { status: 409 },
        );
      }
      throw createErr;
    }

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
    const errMsg = err instanceof Error ? err.message : String(err);
    const stack  = err instanceof Error ? err.stack : undefined;
    console.error('POST /api/pools unhandled error:', errMsg, stack ?? '');
    return NextResponse.json({ error: 'Internal server error', detail: errMsg }, { status: 500 });
  }
}
