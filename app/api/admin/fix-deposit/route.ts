import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function POST(req: NextRequest) {
  try {
    const { poolId } = await req.json();

    if (poolId !== 'cmqj02cgy0006diw5mw5qfr01') {
      return NextResponse.json({ error: "Invalid pool" }, { status: 400 });
    }

    // ✅ Use the EXACT address you confirmed has the hyphen
    const correctAddress = 'EQAhmwH3-ssIBol20f5jaBfyCW93yPZaQt7mxqXKyiEnZmrk';

    const updatedPool = await prisma.pool.update({
      where: { id: poolId },
      data: {
        status: 'ENDED',
        contractAddress: correctAddress,
      },
    });

    return NextResponse.json({
      success: true,
      message: "✅ Saved the exact correct address (with hyphen). Now try Distribute.",
      addressSaved: correctAddress
    });

  } catch (error: any) {
    console.error("Fix error:", error);
    return NextResponse.json({ 
      error: error.message || "Failed to update pool" 
    }, { status: 500 });
  }
}
