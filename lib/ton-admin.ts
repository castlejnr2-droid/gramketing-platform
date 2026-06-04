import { mnemonicToPrivateKey, KeyPair } from '@ton/crypto';
import { WalletContractV4, TonClient, OpenedContract } from '@ton/ton';

let _client: TonClient | null = null;

export function getTonClient(): TonClient {
  if (!_client) {
    _client = new TonClient({
      endpoint: process.env.TON_ENDPOINT ?? 'https://toncenter.com/api/v2/jsonRPC',
    });
  }
  return _client;
}

export async function getAdminWallet(): Promise<{
  keyPair: KeyPair;
  wallet: WalletContractV4;
  contract: OpenedContract<WalletContractV4>;
  client: TonClient;
}> {
  const mnemonic = process.env.ADMIN_MNEMONIC;
  if (!mnemonic) throw new Error('ADMIN_MNEMONIC is not configured');

  const keyPair = await mnemonicToPrivateKey(mnemonic.trim().split(/\s+/));
  const client = getTonClient();
  const wallet = WalletContractV4.create({ publicKey: keyPair.publicKey, workchain: 0 });
  const contract = client.open(wallet);

  return { keyPair, wallet, contract, client };
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
