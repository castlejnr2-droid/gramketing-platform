import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function POST(req: NextRequest) {
  try {
    const { poolId } = await req.json();

    if (poolId !== 'cmqj02cgy0006diw5mw5qfr01') {
      return NextResponse.json({ error: "Invalid pool" }, { status: 400 });
    }

    // ✅ Correct cleaned address (no hyphen)
    const cleanAddress = 'EQAhmwH3ssIBol20f5jaBfyCW93yPZaQt7mxqXKyiEnZmrk';

    const updatedPool = await prisma.pool.update({
      where: { id: poolId },
      data: {
        status: 'ENDED',
        contractAddress: cleanAddress,
      },
    });

    return NextResponse.json({
      success: true,
      message: "✅ Contract address FIXED with correct one. Now click Distribute.",
      cleanedAddress: cleanAddress,
      pool: updatedPool
    });

  } catch (error: any) {
    console.error("Fix error:", error);
    return NextResponse.json({ 
      error: error.message || "Failed to update" 
    }, { status: 500 });
  }
}
