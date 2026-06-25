import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

export async function POST(req: NextRequest) {
  try {
    const { poolId } = await req.json();

    if (poolId !== 'cmqj02cgy0006diw5mw5qfr01') {
      return NextResponse.json({ error: "Invalid pool" }, { status: 400 });
    }

    const updatedPool = await prisma.pool.update({
      where: { id: poolId },
      data: {
        depositedAmount: 10000000,
        status: 'ENDED',
      },
    });

    return NextResponse.json({
      success: true,
      message: "✅ Deposited amount fixed successfully! You can now distribute.",
      pool: updatedPool
    });

  } catch (error: any) {
    console.error("Fix deposit error:", error);
    return NextResponse.json({ 
      error: error.message || "Failed to update pool" 
    }, { status: 500 });
  }
}
