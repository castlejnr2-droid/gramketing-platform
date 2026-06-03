import { SignJWT, jwtVerify } from 'jose';
import { NextRequest } from 'next/server';
import { Address } from '@ton/ton';

const secret = new TextEncoder().encode(
  process.env.JWT_SECRET ?? 'dev-secret-change-me-minimum-32-chars!!'
);

export async function signJwt(payload: { walletAddress: string }): Promise<string> {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('7d')
    .sign(secret);
}

export async function verifyJwt(
  token: string
): Promise<{ walletAddress: string } | null> {
  try {
    const { payload } = await jwtVerify(token, secret);
    return payload as { walletAddress: string };
  } catch {
    return null;
  }
}

export async function getAuthWallet(req: NextRequest): Promise<string | null> {
  const token =
    req.cookies.get('gramketing_token')?.value ??
    req.headers.get('authorization')?.replace('Bearer ', '');
  if (!token) return null;
  const payload = await verifyJwt(token);
  return payload?.walletAddress ?? null;
}

function toRaw(addr: string): string | null {
  try {
    return Address.parse(addr).toRawString();
  } catch {
    return null;
  }
}

export function isAdmin(walletAddress: string): boolean {
  const adminEnv = process.env.ADMIN_WALLET_ADDRESS;
  if (!adminEnv) return false;
  const rawWallet = toRaw(walletAddress);
  const rawAdmin = toRaw(adminEnv);
  if (!rawWallet || !rawAdmin) return false;
  return rawWallet === rawAdmin;
}
