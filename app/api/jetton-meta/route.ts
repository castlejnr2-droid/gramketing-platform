import { NextRequest, NextResponse } from 'next/server';
import { Address } from '@ton/core';
import { getJettonMetadata } from '@/lib/gramketing-pool-contract';

/**
 * GET /api/jetton-meta?address=EQ...
 *
 * Fetches TEP-64 metadata (name, symbol, image) for a jetton master contract.
 * Used by the Create Pool form to auto-fill project details.
 */
export async function GET(req: NextRequest) {
  const address = req.nextUrl.searchParams.get('address');
  if (!address) {
    return NextResponse.json({ error: 'address query param is required' }, { status: 400 });
  }

  try {
    Address.parse(address); // validate format before hitting the chain
  } catch {
    return NextResponse.json({ error: 'Invalid TON address format' }, { status: 400 });
  }

  try {
    const meta = await getJettonMetadata(address);
    return NextResponse.json(meta);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    // Return 422 for "address is valid but has no usable metadata", 500 for infra errors
    const status = msg.includes('No name') || msg.includes('Empty metadata') ? 422 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
