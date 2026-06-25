import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function POST(req: NextRequest) {
  try {
    const { poolId } = await req.json();

    if (poolId !== 'cmqj02cgy0006diw5mw5qfr01') {
      return NextResponse.json({ error: "Invalid pool" }, { status: 400 });
    }

    await prisma.pool.update({
      where: { id: poolId },
      data: { status: 'ENDED' },
    });

    return NextResponse.json({
      success: true,
      message: "✅ Pool status updated! Refresh the All Pools page and try Distribute again."
    });

  } catch (error: any) {
    console.error("Fix error:", error);
    return NextResponse.json({ 
      error: error.message || "Failed" 
    }, { status: 500 });
  }
}
