import { pbkdf2 } from 'crypto';
import { promisify } from 'util';
import {
  KeyPair,
  keyPairFromSeed,
  getED25519MasterKeyFromSeed,
  deriveED25519HardenedKey,
} from '@ton/crypto';
import { WalletContractV5R1, TonClient, OpenedContract } from '@ton/ton';

const pbkdf2Async = promisify(pbkdf2);

// ── RPC endpoints ─────────────────────────────────────────────────────────────
// Primary is taken from env; fallback is tried after all primary attempts fail.
// Set TON_FALLBACK_ENDPOINT in .env to a different provider (e.g. a toncenter
// API-key URL or any other JSON-RPC v2 compatible endpoint).
const PRIMARY_ENDPOINT =
  process.env.TON_ENDPOINT ?? 'https://toncenter.com/api/v2/jsonRPC';
const FALLBACK_ENDPOINT =
  process.env.TON_FALLBACK_ENDPOINT ?? null;

export function makeTonClient(endpoint: string): TonClient {
  return new TonClient({ endpoint });
}

/** Returns the primary TonClient. Use tonRetry for resilient calls. */
export function getTonClient(): TonClient {
  return makeTonClient(PRIMARY_ENDPOINT);
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function is429(err: unknown): boolean {
  const status = (err as { response?: { status?: number } })?.response?.status;
  return status === 429 || String(err).includes('429');
}

/**
 * Retries a TON RPC call with exponential backoff and optional endpoint failover.
 *
 * Attempt schedule:
 *   1st attempt  — primary endpoint, immediate
 *   2nd attempt  — primary endpoint, after 2 s
 *   3rd attempt  — fallback endpoint (if set) or primary, after 4 s
 *
 * If all three attempts fail, the last error is rethrown.
 * The callback receives a fresh TonClient so it can re-open any contract/wallet.
 */
export async function tonRetry<T>(
  fn: (client: TonClient) => Promise<T>,
  label = 'ton-rpc',
): Promise<T> {
  const DELAYS = [2_000, 4_000] as const; // delays *before* attempt 2 and 3
  const MAX_ATTEMPTS = 3;

  let lastErr: unknown;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    // Switch to fallback on the last attempt if one is configured
    const usesFallback = attempt === MAX_ATTEMPTS && FALLBACK_ENDPOINT !== null;
    const endpoint = usesFallback ? FALLBACK_ENDPOINT! : PRIMARY_ENDPOINT;

    try {
      return await fn(makeTonClient(endpoint));
    } catch (err) {
      lastErr = err;
      const rateLimit = is429(err);
      const endpointLabel = usesFallback ? 'fallback' : 'primary';

      if (attempt < MAX_ATTEMPTS) {
        const delay = DELAYS[attempt - 1];
        console.warn(
          `[ton-retry] ${label}: attempt ${attempt}/${MAX_ATTEMPTS} failed ` +
          `(${rateLimit ? '429 rate-limit' : 'error'}) on ${endpointLabel} — ` +
          `retrying in ${delay / 1000}s…`,
        );
        await sleep(delay);
      } else {
        console.error(
          `[ton-retry] ${label}: all ${MAX_ATTEMPTS} attempts failed (last on ${endpointLabel}).`,
        );
      }
    }
  }

  throw lastErr;
}

// ── Key derivation ────────────────────────────────────────────────────────────

/**
 * Derives the admin keypair using the same method as MyTonWallet:
 *   BIP39 seed (PBKDF2-SHA512) → SLIP10 Ed25519 m/44'/607'/0' → WalletV5R1
 */
async function mnemonicToMyTonWalletKeypair(mnemonic: string): Promise<KeyPair> {
  const seed = await pbkdf2Async(
    mnemonic.normalize('NFKD'),
    'mnemonic'.normalize('NFKD'),
    2048,
    64,
    'sha512',
  );
  const master = await getED25519MasterKeyFromSeed(seed);
  const lvl1   = await deriveED25519HardenedKey(master, 44);
  const lvl2   = await deriveED25519HardenedKey(lvl1,   607);
  const lvl3   = await deriveED25519HardenedKey(lvl2,   0);
  return keyPairFromSeed(lvl3.key);
}

/**
 * Returns the admin keypair and wallet object without binding to any specific
 * TonClient. Use with tonRetry so RPC calls can be retried across endpoints:
 *
 *   const { keyPair, wallet } = await getAdminKeypair();
 *   const seqno = await tonRetry(c => c.open(wallet).getSeqno(), 'getSeqno');
 */
export async function getAdminKeypair(): Promise<{
  keyPair: KeyPair;
  wallet: WalletContractV5R1;
}> {
  const mnemonic = process.env.ADMIN_MNEMONIC;
  if (!mnemonic) throw new Error('ADMIN_MNEMONIC is not configured');
  const keyPair = await mnemonicToMyTonWalletKeypair(mnemonic.trim());
  const wallet  = WalletContractV5R1.create({ publicKey: keyPair.publicKey, workchain: 0 });
  return { keyPair, wallet };
}

/**
 * Returns the admin wallet opened against the primary TonClient.
 * Prefer getAdminKeypair() + tonRetry() for operations that need retry/fallback.
 */
export async function getAdminWallet(): Promise<{
  keyPair: KeyPair;
  wallet: WalletContractV5R1;
  contract: OpenedContract<WalletContractV5R1>;
  client: TonClient;
}> {
  const { keyPair, wallet } = await getAdminKeypair();
  const client   = getTonClient();
  const contract = client.open(wallet);
  return { keyPair, wallet, contract, client };
}
