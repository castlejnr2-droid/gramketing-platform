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

let _client: TonClient | null = null;

export function getTonClient(): TonClient {
  if (!_client) {
    _client = new TonClient({
      endpoint: process.env.TON_ENDPOINT ?? 'https://toncenter.com/api/v2/jsonRPC',
    });
  }
  return _client;
}

/**
 * Derives the admin keypair using the same method as MyTonWallet:
 *   BIP39 seed (PBKDF2-SHA512) → SLIP10 Ed25519 m/44'/607'/0' → WalletV5R1
 *
 * This matches the derivation path used by MyTonWallet, which produces
 * WalletContractV5R1 at m/44h/607h/0h from a standard BIP39 mnemonic.
 */
async function mnemonicToMyTonWalletKeypair(mnemonic: string): Promise<KeyPair> {
  // Standard BIP39 seed derivation (PBKDF2-SHA512, 2048 rounds)
  const seed = await pbkdf2Async(
    mnemonic.normalize('NFKD'),
    'mnemonic'.normalize('NFKD'),
    2048,
    64,
    'sha512',
  );

  // SLIP10 Ed25519: master → m/44h/607h/0h
  const master = await getED25519MasterKeyFromSeed(seed);
  const lvl1   = await deriveED25519HardenedKey(master, 44);
  const lvl2   = await deriveED25519HardenedKey(lvl1,   607);
  const lvl3   = await deriveED25519HardenedKey(lvl2,   0);

  return keyPairFromSeed(lvl3.key);
}

export async function getAdminWallet(): Promise<{
  keyPair: KeyPair;
  wallet: WalletContractV5R1;
  contract: OpenedContract<WalletContractV5R1>;
  client: TonClient;
}> {
  const mnemonic = process.env.ADMIN_MNEMONIC;
  if (!mnemonic) throw new Error('ADMIN_MNEMONIC is not configured');

  const keyPair = await mnemonicToMyTonWalletKeypair(mnemonic.trim());
  const client  = getTonClient();
  const wallet  = WalletContractV5R1.create({ publicKey: keyPair.publicKey, workchain: 0 });
  const contract = client.open(wallet);

  return { keyPair, wallet, contract, client };
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
