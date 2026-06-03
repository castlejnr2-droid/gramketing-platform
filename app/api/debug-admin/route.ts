import { NextRequest, NextResponse } from 'next/server';

export async function GET(req: NextRequest) {
  return NextResponse.json({
    adminEnv: process.env.ADMIN_WALLET_ADDRESS || 'NOT SET',
  });
}
