/**
 * MGRAM/USD price oracle — GeckoTerminal OHLCV, DeDust V2 pool.
 *
 * Source:  GeckoTerminal /api/v2/networks/ton/pools/{pool}/ohlcv/hour
 * Pool:    EQDLpL31mejnSWPDQX_kmZcoF5RrXDezIyHkwpIAGYCqmU1y (DeDust V2, deepest pool)
 * TWAP:    Average of close prices from 6 recent hourly candles (~30-min sensitivity)
 * Cache:   10-minute TTL — short enough to track real moves, cheap on rate limits
 *
 * Sanity bounds (either → UNAVAILABLE, never a bad price through):
 *   Absolute:  price outside [$1e-7, $1e-4] USD per whole MGRAM
 *   Deviation: price deviates >50% from prior cached value (recent cache only, <1 h old)
 *
 * On network / parse failure:  stale cache (if <1 h old) else null
 * On sanity failure:            always null — do NOT serve a bad price
 */

const DEDUST_POOL = 'EQDLpL31mejnSWPDQX_kmZcoF5RrXDezIyHkwpIAGYCqmU1y';
const OHLCV_URL =
  `https://api.geckoterminal.com/api/v2/networks/ton/pools/${DEDUST_POOL}/ohlcv/hour` +
  `?limit=6&currency=usd&token=base`;

/** Cache TTL: 10 minutes. */
const CACHE_TTL_MS = 10 * 60 * 1_000;
/** Max age to use stale cache on network error, or for deviation check. */
const STALE_MAX_MS = 60 * 60 * 1_000;

/** Absolute price bounds (USD per whole MGRAM). */
export const MGRAM_PRICE_MIN = 1e-7;
export const MGRAM_PRICE_MAX = 1e-4;
/** Maximum allowed deviation from prior cached value. */
export const MGRAM_PRICE_MAX_DEVIATION = 0.5; // 50%

let _cache: { price: number; fetchedAt: number } | null = null;

/**
 * Returns the MGRAM/USD TWAP price (USD per 1 whole MGRAM), or null if unavailable.
 * Never throws — all errors produce null or the stale cached value.
 */
export async function getMgramPrice(): Promise<number | null> {
  // Fresh cache hit
  if (_cache && Date.now() - _cache.fetchedAt < CACHE_TTL_MS) {
    return _cache.price;
  }

  // Fetch OHLCV data
  let raw: number | null = null;
  try {
    const res = await fetch(OHLCV_URL, {
      headers: { Accept: 'application/json;version=20230302' },
      signal: AbortSignal.timeout(8_000),
    });

    if (!res.ok) {
      console.error(`[mgram-price] GeckoTerminal returned ${res.status}`);
    } else {
      const data = (await res.json()) as {
        data?: { attributes?: { ohlcv_list?: [number, number, number, number, number, number][] } };
      };
      const ohlcvList = data?.data?.attributes?.ohlcv_list ?? [];

      if (ohlcvList.length === 0) {
        console.error('[mgram-price] empty OHLCV list');
      } else {
        // TWAP: mean of close prices (index 4 in each [ts, o, h, l, c, v] tuple)
        const closes = ohlcvList.map((c) => c[4]);
        raw = closes.reduce((sum, p) => sum + p, 0) / closes.length;
      }
    }
  } catch (err) {
    console.error('[mgram-price] fetch failed:', err instanceof Error ? err.message : String(err));
  }

  // Network/parse failure: serve stale cache if <1 h old, else unavailable
  if (raw === null) {
    if (_cache && Date.now() - _cache.fetchedAt < STALE_MAX_MS) {
      return _cache.price;
    }
    return null;
  }

  // Absolute sanity bounds
  if (raw < MGRAM_PRICE_MIN || raw > MGRAM_PRICE_MAX) {
    console.error(
      `[mgram-price] TWAP ${raw} outside bounds [${MGRAM_PRICE_MIN}, ${MGRAM_PRICE_MAX}] — UNAVAILABLE`,
    );
    return null;
  }

  // Deviation check — only against a recent (<1 h) prior cache to avoid
  // permanently blocking legitimate large moves after a cache gap.
  if (_cache && Date.now() - _cache.fetchedAt < STALE_MAX_MS) {
    const deviation = Math.abs(raw - _cache.price) / _cache.price;
    if (deviation > MGRAM_PRICE_MAX_DEVIATION) {
      console.error(
        `[mgram-price] TWAP ${raw} deviates ${(deviation * 100).toFixed(1)}% ` +
        `from cached ${_cache.price} (>${MGRAM_PRICE_MAX_DEVIATION * 100}%) — UNAVAILABLE`,
      );
      return null;
    }
  }

  // All checks passed — update cache
  _cache = { price: raw, fetchedAt: Date.now() };
  return raw;
}

// ── Test helpers (never call in production code) ──────────────────────────────

/** Clears the internal price cache. For tests only. */
export function _clearMgramPriceCache(): void {
  _cache = null;
}

/** Injects a known price into the cache. For tests only. */
export function _injectMgramPriceCache(price: number, ageMs = 0): void {
  _cache = { price, fetchedAt: Date.now() - ageMs };
}
