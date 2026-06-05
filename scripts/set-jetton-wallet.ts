/**
 * scripts/set-jetton-wallet.ts
 *
 * Sends SetJettonWallet to update the stored jettonWalletAddress on the contract,
 * then verifies getPoolInfo reflects the new address.
 *
 * Usage:
 *   npx ts-node --project scripts/tsconfig.json scripts/set-jetton-wallet.ts
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
import { GramketingPool, storeSetJettonWallet } from '../contracts/output/gramketing_pool_GramketingPool';

const pbkdf2Async = promisify(pbkdf2);

const CONTRACT          = 'EQAX0-LNdBZIr8dT3Dcth6XOfLx-KsalJA3U0NFgVk0fa_lv';
const NEW_JETTON_WALLET = 'EQCHnuyrx45VrUxr5bM4fIq5DTNZ_vZ8Ugufg58Gj74QB1FX';

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
  return { keyPair, wallet, contract, client };
}

async function waitForSeqnoAdvance(
  walletContract: OpenedContract<WalletContractV5R1>,
  prevSeqno: number,
): Promise<void> {
  for (let i = 0; i < 40; i++) {
    await sleep(2000);
    try {
      const seqno = await walletContract.getSeqno();
      if (seqno > prevSeqno) return;
    } catch {}
  }
  throw new Error('Timed out waiting for transaction confirmation');
}

async function main() {
  console.log('════════════════════════════════════════════════════════');
  console.log('  SetJettonWallet');
  console.log('════════════════════════════════════════════════════════\n');
  console.log(`  Contract:          ${CONTRACT}`);
  console.log(`  New jetton wallet: ${NEW_JETTON_WALLET}\n`);

  const { keyPair, contract: walletContract, client } = await getAdminKeypairAndWallet();
  const adminAddr = walletContract.address.toString({ bounceable: false, urlSafe: true });
  console.log(`  Admin wallet: ${adminAddr}`);

  const balance = await retry(() => client.getBalance(walletContract.address), 'getBalance');
  console.log(`  Balance: ${Number(balance) / 1e9} TON`);
  if (balance < toNano('0.05')) throw new Error('Insufficient TON balance (need at least 0.05)');

  const contractAddr = Address.parse(CONTRACT);
  const poolContract = client.open(GramketingPool.fromAddress(contractAddr));

  // ── Step 1: Show current state ─────────────────────────────────────────────
  console.log('\nStep 1: Current jettonWalletAddress on-chain…');
  const before = await retry(() => poolContract.getPoolInfo(), 'getPoolInfo-before');
  console.log(`  stored: ${before.jettonWalletAddress.toString({ bounceable: true, urlSafe: true })}`);

  // ── Step 2: Send SetJettonWallet ───────────────────────────────────────────
  console.log('\nStep 2: Sending SetJettonWallet…');
  const seqno = await retry(() => walletContract.getSeqno(), 'getSeqno');
  await sleep(1000);

  await retry(() => walletContract.sendTransfer({
    secretKey: keyPair.secretKey,
    seqno,
    messages: [
      internal({
        to: contractAddr,
        value: toNano('0.05'),
        body: beginCell()
          .store(storeSetJettonWallet({
            $$type: 'SetJettonWallet',
            newJettonWalletAddress: Address.parse(NEW_JETTON_WALLET),
          }))
          .endCell(),
      }),
    ],
    sendMode: SendMode.PAY_GAS_SEPARATELY,
  }), 'sendSetJettonWallet');

  console.log('  ✓ Transaction sent. Waiting for confirmation…');
  await waitForSeqnoAdvance(walletContract, seqno);
  console.log('  ✓ Confirmed.');

  // ── Step 3: Verify ─────────────────────────────────────────────────────────
  console.log('\nStep 3: Verifying updated jettonWalletAddress…');
  await sleep(2000);
  const after = await retry(() => poolContract.getPoolInfo(), 'getPoolInfo-after');
  const stored = after.jettonWalletAddress.toString({ bounceable: true, urlSafe: true });
  console.log(`  stored now: ${stored}`);

  if (stored === NEW_JETTON_WALLET) {
    console.log('\n  ✓ SUCCESS — jettonWalletAddress updated correctly.');
  } else {
    console.error(`\n  ✗ MISMATCH — expected ${NEW_JETTON_WALLET}, got ${stored}`);
    process.exit(1);
  }

  console.log('\n════════════════════════════════════════════════════════');
}

main().catch(e => { console.error('\n❌ Error:', e.message); process.exit(1); });
