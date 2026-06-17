import axios from 'axios';
import { getMgramPrice } from './mgram-price';

export interface Prices {
  ton: number;   // USD price of 1 TON
  mgram: number; // USD price of 1 whole MGRAM (0 if oracle unavailable)
}

let cache: { prices: Prices; fetchedAt: number } | null = null;
const CACHE_TTL_MS = 60_000; // 1 minute

export async function getLivePrices(): Promise<Prices> {
  if (cache && Date.now() - cache.fetchedAt < CACHE_TTL_MS) {
    return cache.prices;
  }

  try {
    const url =
      'https://api.coingecko.com/api/v3/simple/price?ids=the-open-network&vs_currencies=usd';
    const headers: Record<string, string> = {};
    if (process.env.COINGECKO_API_KEY) {
      headers['x-cg-demo-api-key'] = process.env.COINGECKO_API_KEY;
    }

    const res = await axios.get(url, { headers });
    const tonPrice = res.data['the-open-network']?.usd ?? 0;

    // MGRAM price from GeckoTerminal oracle (null → 0 for non-critical display paths)
    const mgramPrice = await getMgramPrice() ?? 0;

    const prices: Prices = { ton: tonPrice, mgram: mgramPrice };
    cache = { prices, fetchedAt: Date.now() };
    return prices;
  } catch (err) {
    console.error('CoinGecko fetch failed:', err);
    return cache?.prices ?? { ton: 5, mgram: 0 }; // fallback
  }
}

// Dollar-pegged fee table (USD amounts are the adjustable knobs)
export const FEE_TABLE: Record<number, { mgram: number; ton: number }> = {
  7:  { mgram: 5,     ton: 62.5  },
  14: { mgram: 99.5,  ton: 124.5 },
  21: { mgram: 149.5, ton: 187   },
  28: { mgram: 199.5, ton: 249.5 },
};

/** MGRAM jetton decimal places (standard TON jetton; confirmed by getJettonDecimals fallback). */
export const MGRAM_DECIMALS = 9;

/**
 * Tolerance applied to the on-chain required amount.
 * Allows up to 4% underpayment so honest quote-to-pay price drift isn't punished.
 * Still blocks dust / >4% short-pays.
 */
export const FEE_TOLERANCE = 0.04;

export async function calculateFeeInTokens(
  durationDays: number,
  currency: 'MGRAM' | 'TON',
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

/**
 * Computes the minimum token nano-amount that must be confirmed on-chain for a
 * given fee, with FEE_TOLERANCE applied.
 *
 * FAIL-CLOSED for MGRAM: throws if the MGRAM oracle is unavailable.
 * Callers MUST catch this error and return 503 to the client.
 *
 * @returns bigint nano-units: nanotons (TON) or 10^-MGRAM_DECIMALS units (MGRAM)
 */
export async function getRequiredFeeNano(
  durationDays: number,
  currency: 'TON' | 'MGRAM',
): Promise<bigint> {
  const row = FEE_TABLE[durationDays];
  if (!row) throw new Error(`Invalid durationDays: ${durationDays}`);

  if (currency === 'TON') {
    const { ton: tonPrice } = await getLivePrices();
    if (tonPrice <= 0) throw new Error('TON price unavailable');
    // USD → TON → nanotons, with tolerance
    const nanoExact = (row.ton / tonPrice) * 1e9;
    return BigInt(Math.floor(nanoExact * (1 - FEE_TOLERANCE)));
  }

  // MGRAM — fail-closed: never let a null price through
  const mgramPrice = await getMgramPrice();
  if (mgramPrice === null || mgramPrice <= 0) {
    throw new Error('MGRAM fee price temporarily unavailable, try again');
  }
  // USD → whole MGRAM → nano-MGRAM, with tolerance
  const nanoExact = (row.mgram / mgramPrice) * Math.pow(10, MGRAM_DECIMALS);
  return BigInt(Math.floor(nanoExact * (1 - FEE_TOLERANCE)));
}
