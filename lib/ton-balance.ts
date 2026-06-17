/**
 * Shared TonAPI v2 jetton helpers.
 *
 * getJettonBalance
 *   GET /v2/accounts/{owner}/jettons/{jetton_master}
 *   200 → { balance: "string", ... }       ← return BigInt(balance)
 *   404 + "no jetton wallet" in body        ← return 0n  (wallet never created)
 *   Any other error (network/429/5xx/…)    ← THROW  (caller decides how to handle)
 *
 *   Callers MUST NOT swallow the thrown error with a catch-all → 0n, or balance
 *   checks silently return 0 for ALL wallets when TonAPI is unreachable.
 *
 * getJettonWalletAddressViaTonApi
 *   Same endpoint — also returns wallet_address.address (the owner's jetton wallet).
 *   Throws if the owner has never held the jetton (wallet not yet created on-chain),
 *   which is an acceptable failure: they can't pay with a token they've never received.
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

/**
 * Returns the on-chain jetton wallet address for `ownerAddress` on the given
 * jetton master, using TonAPI v2 (reliable, no toncenter dependency).
 *
 * Throws with a descriptive message on:
 *   - 404 "no jetton wallet" → owner has never held the jetton
 *   - network errors, non-2xx responses, malformed body
 */
export async function getJettonWalletAddressViaTonApi(
  ownerAddress: string,
  jettonMasterAddress: string,
): Promise<string> {
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
    let body: unknown;
    try { body = await res.json(); } catch { /* ignore */ }
    const errMsg = typeof body === 'object' && body !== null && 'error' in body
      ? String((body as Record<string, unknown>).error)
      : '';
    if (errMsg.toLowerCase().includes('no jetton wallet')) {
      throw new Error(`Owner ${ownerAddress} has no mGRAM jetton wallet — receive mGRAM before paying with it`);
    }
    throw new Error(`TonAPI unexpected 404 for ${ownerAddress}: ${errMsg}`);
  }

  if (!res.ok) {
    throw new Error(`TonAPI returned ${res.status} for jetton wallet lookup of ${ownerAddress}`);
  }

  let data: unknown;
  try { data = await res.json(); } catch {
    throw new Error(`TonAPI returned unparseable response for ${ownerAddress}`);
  }

  const walletAddress =
    typeof data === 'object' && data !== null &&
    'wallet_address' in data &&
    typeof (data as Record<string, unknown>).wallet_address === 'object' &&
    (data as Record<string, unknown>).wallet_address !== null
      ? String(
          ((data as Record<string, unknown>).wallet_address as Record<string, unknown>).address ?? '',
        )
      : '';

  if (!walletAddress) {
    throw new Error(`TonAPI response missing wallet_address for ${ownerAddress}`);
  }

  return walletAddress;
}
