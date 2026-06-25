import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function POST(req: NextRequest) {
  try {
    const { poolId } = await req.json();

    if (poolId !== 'cmqj02cgy0006diw5mw5qfr01') {
      return NextResponse.json({ error: "Invalid pool" }, { status: 400 });
    }

    // Clean address - NO hyphen, correct format
    const cleanAddress = 'EQAhmWH3ss1Bo120f5jaBfyCw93ypPZaQt7mxqXKYiEnZmrk';

    const updatedPool = await prisma.pool.update({
      where: { id: poolId },
      data: {
        status: 'ENDED',
        contractAddress: cleanAddress,
      },
    });

    return NextResponse.json({
      success: true,
      message: "✅ Contract address cleaned successfully (no hyphen). You can now click Distribute.",
      cleanedAddress: cleanAddress,
      pool: updatedPool
    });

  } catch (error: any) {
    console.error("Fix error:", error);
    return NextResponse.json({ 
      error: error.message || "Failed to update pool" 
    }, { status: 500 });
  }
}
