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
      },
    });

    // Manual JSON stringification to avoid BigInt error
    const responseData = {
      success: true,
      message: "✅ Pool status updated successfully! You can now try clicking Distribute again.",
      pool: updatedPool
    };

    return new NextResponse(JSON.stringify(responseData, (key, value) => 
      typeof value === 'bigint' ? value.toString() : value
    ), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error: any) {
    console.error("Fix deposit error:", error);
    return NextResponse.json({ 
      error: error.message || "Failed to update pool" 
    }, { status: 500 });
  }
}
