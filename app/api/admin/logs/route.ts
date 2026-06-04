/**
 * GET /api/admin/logs?limit=50&level=error&poolId=xxx
 *
 * Returns recent AdminLog entries for the admin panel.
 */

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
    const limit = Math.min(parseInt(searchParams.get('limit') ?? '50', 10), 200);
    const level = searchParams.get('level'); // info | warn | error
    const poolId = searchParams.get('poolId');
    const action = searchParams.get('action');

    const where: Record<string, unknown> = {};
    if (level) where.level = level;
    if (poolId) where.poolId = poolId;
    if (action) where.action = action;

    const logs = await prisma.adminLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: limit,
      include: {
        pool: {
          select: {
            id: true,
            tokenSymbol: true,
            project: { select: { name: true } },
          },
        },
      },
    });

    return NextResponse.json({ logs });
  } catch (err) {
    console.error('GET /api/admin/logs error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
