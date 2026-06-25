import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function POST(req: NextRequest) {
  try {
    const { poolId } = await req.json();

    if (poolId !== 'cmqj02cgy0006diw5mw5qfr01') {
      return NextResponse.json({ error: "Invalid pool" }, { status: 400 });
    }

    const updatedPool = await prisma.pool.update({
      where: { id: poolId },
      data: {
        status: 'ENDED',
        contractAddress: 'EQAhmwH3-ssIBo120f5jaBfyCw93ypPZaQt7mxqX KyiEnZmrk'.replace(/\s+/g, ''),
      },
    });

    return NextResponse.json({
      success: true,
      message: "✅ Pool fixed! depositedAmount warning should be gone now.",
      pool: updatedPool
    });

  } catch (error: any) {
    console.error("Fix error:", error);
    return NextResponse.json({ 
      error: error.message || "Failed to update" 
    }, { status: 500 });
  }
}
