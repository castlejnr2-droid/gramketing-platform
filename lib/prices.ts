import axios from 'axios';

export interface Prices {
  ton: number;   // USD price of 1 TON
  mgram: number; // USD price of 1 mGRAM (0 if not launched)
}

let cache: { prices: Prices; fetchedAt: number } | null = null;
const CACHE_TTL_MS = 60_000; // 1 minute

export async function getLivePrices(): Promise<Prices> {
  if (cache && Date.now() - cache.fetchedAt < CACHE_TTL_MS) {
    return cache.prices;
  }

  try {
    // TODO: add mGRAM CoinGecko id when token launches
    const url =
      'https://api.coingecko.com/api/v3/simple/price?ids=the-open-network&vs_currencies=usd';
    const headers: Record<string, string> = {};
    if (process.env.COINGECKO_API_KEY) {
      headers['x-cg-demo-api-key'] = process.env.COINGECKO_API_KEY;
    }

    const res = await axios.get(url, { headers });
    const tonPrice = res.data['the-open-network']?.usd ?? 0;

    const prices: Prices = { ton: tonPrice, mgram: 0 };
    cache = { prices, fetchedAt: Date.now() };
    return prices;
  } catch (err) {
    console.error('CoinGecko fetch failed:', err);
    return cache?.prices ?? { ton: 5, mgram: 0 }; // fallback
  }
}

// Dollar-pegged fee table
export const FEE_TABLE: Record<number, { mgram: number; ton: number }> = {
  7:  { mgram: 100, ton: 125 },
  14: { mgram: 199, ton: 249 },
  21: { mgram: 299, ton: 374 },
  28: { mgram: 399, ton: 499 },
};

export async function calculateFeeInTokens(
  durationDays: number,
  currency: 'MGRAM' | 'TON'
): Promise<{ usdAmount: number; tokenAmount: number }> {
  const prices = await getLivePrices();
  const row = FEE_TABLE[durationDays];
  if (!row) throw new Error('Invalid duration');

  if (currency === 'TON') {
    const usdAmount = row.ton;
    const tokenAmount = prices.ton > 0 ? usdAmount / prices.ton : 0;
    return { usdAmount, tokenAmount };
  } else {
    const usdAmount = row.mgram;
    const tokenAmount = prices.mgram > 0 ? usdAmount / prices.mgram : 0;
    return { usdAmount, tokenAmount };
  }
}
