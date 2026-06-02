import { NextRequest, NextResponse } from 'next/server';
import { getLivePrices, FEE_TABLE } from '@/lib/prices';

export async function GET(req: NextRequest) {
  try {
    const prices = await getLivePrices();

    // Calculate exact token amounts for each duration and currency
    const fees: Record<
      string,
      {
        mgram: { usdAmount: number; tokenAmount: number };
        ton: { usdAmount: number; tokenAmount: number };
      }
    > = {};

    for (const [daysStr, row] of Object.entries(FEE_TABLE)) {
      const tonAmount = prices.ton > 0 ? row.ton / prices.ton : 0;
      const mgramAmount = prices.mgram > 0 ? row.mgram / prices.mgram : 0;

      fees[daysStr] = {
        mgram: { usdAmount: row.mgram, tokenAmount: mgramAmount },
        ton: { usdAmount: row.ton, tokenAmount: tonAmount },
      };
    }

    return NextResponse.json({
      prices,
      fees,
      updatedAt: new Date().toISOString(),
    });
  } catch (err) {
    console.error('GET /api/prices error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
