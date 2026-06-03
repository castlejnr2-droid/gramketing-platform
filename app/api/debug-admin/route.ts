import { NextRequest, NextResponse } from 'next/server';
import { Address } from '@ton/ton';

export async function GET(req: NextRequest) {
  const adminEnv = process.env.ADMIN_WALLET_ADDRESS || 'NOT SET';
  const testWallet = '0:0d845d74b46bb612509fc86b51314f0bb82bc72fd3ab2dc0ac6a1d8c9f29cae7';

  let rawAdmin = null;
  let rawWallet = null;

  try { rawAdmin = Address.parse(adminEnv).toRawString(); } catch(e) { rawAdmin = 'parse error: ' + String(e); }
  try { rawWallet = Address.parse(testWallet).toRawString(); } catch(e) { rawWallet = 'parse error: ' + String(e); }

  return NextResponse.json({
    adminEnv,
    rawAdmin,
    rawWallet,
    match: rawAdmin === rawWallet
  });
}
