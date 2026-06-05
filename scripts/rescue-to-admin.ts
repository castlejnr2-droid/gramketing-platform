/**
 * scripts/rescue-to-admin.ts
 *
 * Sends a single AdminRescue to recover 1 tsTON from the contract's jetton wallet
 * back to the admin wallet.
 */

import * as dotenv from 'dotenv';
import * as path from 'path';
dotenv.config({ path: path.resolve(__dirname, '../.env') });

import { Address, beginCell, toNano, internal, SendMode } from '@ton/core';
import type { OpenedContract } from '@ton/core';
import { pbkdf2 } from 'crypto';
import { promisify } from 'util';
import {
  keyPairFromSeed,
  getED25519MasterKeyFromSeed,
  deriveED25519HardenedKey,
} from '@ton/crypto';
import { WalletContractV5R1, TonClient } from '@ton/ton';
import { storeAdminRescue } from '../contracts/output/gramketing_pool_GramketingPool';

const pbkdf2Async = promisify(pbkdf2);

const CONTRACT   = 'EQBRn-Gs3tbrcZovxunRCB30zw9EC4BhRvmIYVuGBFF-h5sU';
const ADMIN      = 'UQANhF10tGu2ElCfyGtRMU8LuCvHL9OrLcCsah2MnynK525q';
const AMOUNT     = 1_000_000_000_000n; // 1000 SEND in nano (9 decimals)

function sleep(ms: number) {
  return new Promise<void>(r => setTimeout(r, ms));
}

async function retry<T>(fn: () => Promise<T>, label: string, maxAttempts = 5): Promise<T> {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err: unknown) {
      const is429 = String(err).includes('429');
      if (attempt === maxAttempts) throw err;
      const delay = is429 ? 3000 * attempt : 2000;
      console.log(`  [${label}] attempt ${attempt} failed${is429 ? ' (429)' : ''} — retrying in ${delay / 1000}s…`);
      await sleep(delay);
    }
  }
  throw new Error('retry exhausted');
}

async function getAdminKeypairAndWallet() {
  const mnemonic = process.env.ADMIN_MNEMONIC;
  if (!mnemonic) throw new Error('ADMIN_MNEMONIC not set in .env');
  const seed = await pbkdf2Async(
    mnemonic.trim().normalize('NFKD'), 'mnemonic'.normalize('NFKD'),
    2048, 64, 'sha512',
  );
  const master  = await getED25519MasterKeyFromSeed(seed);
  const lvl1    = await deriveED25519HardenedKey(master, 44);
  const lvl2    = await deriveED25519HardenedKey(lvl1,   607);
  const lvl3    = await deriveED25519HardenedKey(lvl2,   0);
  const keyPair = await keyPairFromSeed(lvl3.key);
  const client  = new TonClient({ endpoint: process.env.TON_ENDPOINT ?? 'https://toncenter.com/api/v2/jsonRPC' });
  const wallet  = WalletContractV5R1.create({ publicKey: keyPair.publicKey, workchain: 0 });
  const contract = client.open(wallet);
  return { keyPair, contract, client };
}

async function waitForSeqnoAdvance(
  walletContract: OpenedContract<WalletContractV5R1>,
  prevSeqno: number,
): Promise<string> {
  for (let i = 0; i < 40; i++) {
    await sleep(2000);
    try {
      const seqno = await walletContract.getSeqno();
      if (seqno > prevSeqno) {
        const txs = await walletContract['provider'].getTransactions(walletContract.address, { limit: 1 });
        if (txs?.length > 0) return txs[0].hash().toString('hex');
        return '(hash unavailable)';
      }
    } catch {}
  }
  throw new Error('Timed out waiting for transaction confirmation');
}

async function main() {
  console.log('════════════════════════════════════════════════════════');
  console.log('  AdminRescue — recover 1 tsTON to admin wallet');
  console.log('════════════════════════════════════════════════════════\n');
  console.log(`  Contract:    ${CONTRACT}`);
  console.log(`  Destination: ${ADMIN}`);
  console.log(`  Amount:      ${AMOUNT} nano (1 tsTON)\n`);

  const { keyPair, contract: walletContract, client } = await getAdminKeypairAndWallet();
  const adminAddr = walletContract.address.toString({ bounceable: false, urlSafe: true });
  console.log(`  Signing wallet: ${adminAddr}`);

  if (adminAddr !== ADMIN) {
    throw new Error(`Loaded wallet ${adminAddr} does not match expected admin ${ADMIN}`);
  }

  const balance = await retry(() => client.getBalance(walletContract.address), 'getBalance');
  console.log(`  TON balance:    ${Number(balance) / 1e9} TON`);
  if (balance < toNano('0.25')) throw new Error('Need at least 0.25 TON for gas');

  const contractAddr = Address.parse(CONTRACT);

  console.log('\nSending AdminRescue…');
  const seqno = await retry(() => walletContract.getSeqno(), 'getSeqno');
  await sleep(1000);

  await retry(() => walletContract.sendTransfer({
    secretKey: keyPair.secretKey,
    seqno,
    messages: [
      internal({
        to: contractAddr,
        value: toNano('0.22'), // covers AdminRescue gas + 0.15 jetton transfer + 0.01 forward
        body: beginCell()
          .store(storeAdminRescue({
            $$type: 'AdminRescue',
            queryId: 1n,
            amount: AMOUNT,
            destination: Address.parse(ADMIN),
          }))
          .endCell(),
      }),
    ],
    sendMode: SendMode.PAY_GAS_SEPARATELY,
  }), 'sendAdminRescue');

  console.log('  ✓ Transaction sent. Waiting for confirmation…');

  // Wait for seqno to advance
  for (let i = 0; i < 40; i++) {
    await sleep(2000);
    try {
      const seqnoNow = await walletContract.getSeqno();
      if (seqnoNow > seqno) {
        console.log('  ✓ Confirmed.');
        break;
      }
    } catch {}
    if (i === 39) throw new Error('Timed out waiting for confirmation');
  }

  console.log('\n════════════════════════════════════════════════════════');
  console.log('  RESCUE SENT');
  console.log('════════════════════════════════════════════════════════');
  console.log(`\n  1 tsTON → ${ADMIN}`);
  console.log(`  Verify: https://tonviewer.com/${ADMIN}`);
}

main().catch(e => { console.error('\n❌ Error:', e.message); process.exit(1); });
