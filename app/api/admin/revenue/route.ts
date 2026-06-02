import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAuthWallet, isAdmin } from '@/lib/auth';

export async function GET(req: NextRequest) {
  try {
    const walletAddress = await getAuthWallet(req);
    if (!walletAddress || !isAdmin(walletAddress)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const fromStr = searchParams.get('from');
    const toStr = searchParams.get('to');

    const dateFilter: { gte?: Date; lte?: Date } = {};
    if (fromStr) dateFilter.gte = new Date(fromStr);
    if (toStr) dateFilter.lte = new Date(toStr);

    const where =
      Object.keys(dateFilter).length > 0
        ? { createdAt: dateFilter }
        : undefined;

    const allRecords = await prisma.platformRevenue.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        pool: {
          select: { id: true, tokenSymbol: true, project: { select: { name: true } } },
        },
      },
    });

    const mgramRecords = allRecords.filter((r) => r.currency === 'MGRAM');
    const tonRecords = allRecords.filter((r) => r.currency === 'TON');

    const mgramTotalTokens = mgramRecords
      .reduce((sum, r) => sum + parseFloat(r.tokenAmount), 0)
      .toString();
    const mgramTotalUsd = mgramRecords.reduce(
      (sum, r) => sum + r.usdValueAtTime,
      0
    );

    const tonTotalTokens = tonRecords
      .reduce((sum, r) => sum + parseFloat(r.tokenAmount), 0)
      .toString();
    const tonTotalUsd = tonRecords.reduce(
      (sum, r) => sum + r.usdValueAtTime,
      0
    );

    return NextResponse.json({
      mgram: {
        totalTokens: mgramTotalTokens,
        totalUsd: mgramTotalUsd,
        records: mgramRecords,
      },
      ton: {
        totalTokens: tonTotalTokens,
        totalUsd: tonTotalUsd,
        records: tonRecords,
      },
    });
  } catch (err) {
    console.error('GET /api/admin/revenue error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
