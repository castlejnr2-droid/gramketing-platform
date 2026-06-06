import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAuthWallet, isAdmin } from '@/lib/auth';

export async function POST(req: NextRequest) {
  try {
    const walletAddress = await getAuthWallet(req);
    if (!walletAddress || !isAdmin(walletAddress)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const { ids, status } = body;

    if (!Array.isArray(ids) || ids.length === 0) {
      return NextResponse.json({ error: 'ids must be a non-empty array' }, { status: 400 });
    }
    if (!['PENDING', 'VERIFIED', 'REJECTED'].includes(status)) {
      return NextResponse.json({ error: 'Invalid status' }, { status: 400 });
    }

    const result = await prisma.poolPost.updateMany({
      where: { id: { in: ids } },
      data: { status },
    });

    return NextResponse.json({ updated: result.count });
  } catch (err) {
    console.error('POST /api/admin/submissions/bulk error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
