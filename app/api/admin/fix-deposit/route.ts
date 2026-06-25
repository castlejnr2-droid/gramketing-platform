import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

// Global BigInt serializer fix
const replacer = (key: string, value: any) => 
  typeof value === 'bigint' ? value.toString() : value;

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

    return NextResponse.json({
      success: true,
      message: "✅ Pool status has been updated! Go back and try clicking 'Distribute' again.",
      pool: updatedPool
    });

  } catch (error: any) {
    console.error("Fix deposit error:", error);
    return NextResponse.json({ 
      error: error.message || "Failed to update pool" 
    }, { status: 500 });
  }
}
