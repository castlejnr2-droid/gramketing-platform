/**
 * Shared TonAPI v2 jetton balance helper.
 *
 * GET /v2/accounts/{owner}/jettons/{jetton_master}
 *   200 → { balance: "string", ... }       ← return BigInt(balance)
 *   404 + "no jetton wallet" in body        ← return 0n  (wallet never created)
 *   Any other error (network/429/5xx/…)    ← THROW  (caller decides how to handle)
 *
 * Callers MUST NOT swallow the thrown error with a catch-all → 0n, or balance
 * checks silently return 0 for ALL wallets when TonAPI is unreachable.
 */

export async function getJettonBalance(
  ownerAddress: string,
  jettonMasterAddress: string,
): Promise<bigint> {
  const endpoint = process.env.TONAPI_ENDPOINT ?? 'https://tonapi.io';

  const url = `${endpoint}/v2/accounts/${encodeURIComponent(ownerAddress)}/jettons/${encodeURIComponent(jettonMasterAddress)}`;

  let res: Response;
  try {
    res = await fetch(url, { signal: AbortSignal.timeout(8_000) });
  } catch (err) {
    throw new Error(
      `TonAPI request failed for ${ownerAddress}: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  if (res.status === 404) {
    // Distinguish "wallet not created yet" (known body) from an unexpected 404
    let body: unknown;
    try {
      body = await res.json();
    } catch {
      // Could not parse body — treat as unexpected 404
      throw new Error(`TonAPI 404 for ${ownerAddress} (unparseable body)`);
    }
    // TonAPI returns: { "error": "account X has no jetton wallet Y" }
    const errMsg = typeof body === 'object' && body !== null && 'error' in body
      ? String((body as Record<string, unknown>).error)
      : '';
    if (errMsg.toLowerCase().includes('no jetton wallet')) {
      return 0n;
    }
    throw new Error(`TonAPI unexpected 404 for ${ownerAddress}: ${errMsg}`);
  }

  if (!res.ok) {
    throw new Error(`TonAPI returned ${res.status} for ${ownerAddress}`);
  }

  let data: unknown;
  try {
    data = await res.json();
  } catch {
    throw new Error(`TonAPI returned unparseable response for ${ownerAddress}`);
  }

  const balance =
    typeof data === 'object' && data !== null && 'balance' in data
      ? String((data as Record<string, unknown>).balance)
      : null;

  if (balance === null) {
    throw new Error(`TonAPI response missing balance field for ${ownerAddress}`);
  }

  return BigInt(balance);
}
