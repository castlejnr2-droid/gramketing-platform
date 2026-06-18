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
 * Returns the jetton wallet address for `ownerAddress` on the given jetton master
 * using TonAPI's deterministic get-method endpoint:
 *
 *   GET /v2/blockchain/accounts/{master}/methods/get_wallet_address?args={owner}
 *
 * This calls the jetton master's on-chain `get_wallet_address` getter via TonAPI,
 * which COMPUTES the wallet address from the owner rather than looking it up in the
 * indexer. This means it:
 *   - Always succeeds regardless of whether the owner has ever held the token
 *   - Is deterministic (0 transient 404s observed in 10/10 rapid calls)
 *   - Returns `decoded.jetton_wallet_address` already parsed — no cell decoding needed
 *
 * The previous indexer endpoint (/v2/accounts/{owner}/jettons/{master}) returned
 * transient false-404s ~40% of the time under rapid calls for confirmed holders.
 *
 * Throws on network errors, non-2xx responses, or missing decoded address.
 */
export async function getJettonWalletAddressViaTonApi(
  ownerAddress: string,
  jettonMasterAddress: string,
): Promise<string> {
  const endpoint = process.env.TONAPI_ENDPOINT ?? 'https://tonapi.io';
  // Pass owner address as the `args` query param — TonAPI accepts friendly/raw formats.
  const url = `${endpoint}/v2/blockchain/accounts/${encodeURIComponent(jettonMasterAddress)}/methods/get_wallet_address?args=${encodeURIComponent(ownerAddress)}`;

  let res: Response;
  try {
    res = await fetch(url, { signal: AbortSignal.timeout(8_000) });
  } catch (err) {
    throw new Error(
      `TonAPI get_wallet_address request failed for ${ownerAddress}: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  if (!res.ok) {
    let body = '';
    try { body = await res.text(); } catch { /* ignore */ }
    throw new Error(`TonAPI get_wallet_address returned ${res.status} for ${ownerAddress}: ${body.slice(0, 120)}`);
  }

  let data: unknown;
  try { data = await res.json(); } catch {
    throw new Error(`TonAPI get_wallet_address returned unparseable response for ${ownerAddress}`);
  }

  // TonAPI returns decoded.jetton_wallet_address for get_wallet_address on jetton masters.
  const walletAddress =
    typeof data === 'object' && data !== null &&
    'decoded' in data &&
    typeof (data as Record<string, unknown>).decoded === 'object' &&
    (data as Record<string, unknown>).decoded !== null
      ? String(
          ((data as Record<string, unknown>).decoded as Record<string, unknown>).jetton_wallet_address ?? '',
        )
      : '';

  if (!walletAddress) {
    throw new Error(
      `TonAPI get_wallet_address missing decoded.jetton_wallet_address for ${ownerAddress}: ${JSON.stringify(data).slice(0, 200)}`,
    );
  }

  return walletAddress;
}
