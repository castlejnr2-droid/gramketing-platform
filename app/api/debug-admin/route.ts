import { NextRequest, NextResponse } from 'next/server';
import { Address } from '@ton/ton';
import { verifyJwt } from '@/lib/auth';

export async function GET(req: NextRequest) {
  const adminEnv = process.env.ADMIN_WALLET_ADDRESS || 'NOT SET';
  const cookie = req.cookies.get('gramketing_token');

  let jwtWallet = null;
  let rawAdmin = null;
  let rawJwt = null;

  if (cookie) {
    try {
      const payload = await verifyJwt(cookie.value);
      jwtWallet = payload?.walletAddress || 'not in payload';
      try { rawJwt = Address.parse(jwtWallet).toRawString(); } catch(e) { rawJwt = 'parse error: ' + String(e); }
    } catch(e) {
      jwtWallet = 'jwt error: ' + String(e);
    }
  }

  try { rawAdmin = Address.parse(adminEnv).toRawString(); } catch(e) { rawAdmin = 'parse error: ' + String(e); }

  return NextResponse.json({
    hasCookie: !!cookie,
    jwtWallet,
    rawJwt,
    rawAdmin,
    match: rawJwt === rawAdmin
  });
}
