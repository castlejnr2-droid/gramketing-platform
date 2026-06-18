/**
 * GET /api/pools/:id/deploy-status
 *
 * Returns the escrow contract deployment status for a pool.
 * Polled by the frontend every 3 seconds after pool creation until the
 * contract is deployed by the Railway scraper's fast deploy loop.
 *
 * Response:
 *   { deployed: false, contractAddress: null }   — still deploying
 *   { deployed: true,  contractAddress: "EQ..." } — ready to deposit
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAuthWallet } from '@/lib/auth';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;

    const walletAddress = await getAuthWallet(req);
    if (!walletAddress) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const pool = await prisma.pool.findUnique({
      where: { id },
      select: {
        contractAddress: true,
        status: true,
        project: { select: { ownerWalletAddress: true } },
      },
    });

    if (!pool) {
      return NextResponse.json({ error: 'Pool not found' }, { status: 404 });
    }

    if (pool.project.ownerWalletAddress !== walletAddress) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    return NextResponse.json({
      deployed: pool.contractAddress !== null,
      contractAddress: pool.contractAddress,
    });
  } catch (err) {
    console.error('GET /api/pools/[id]/deploy-status error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
