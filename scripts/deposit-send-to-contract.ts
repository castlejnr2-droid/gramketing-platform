/**
 * scripts/deposit-send-to-contract.ts
 *
 * Sends 1000 SEND from the admin wallet's SENDIT jetton wallet to the pool contract,
 * with forwardTonAmount = 0.05 TON so the JettonTransferNotification has enough gas
 * to execute and update depositedAmount on the contract.
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
import { getJettonWalletAddress } from '../lib/gramketing-pool-contract';

const pbkdf2Async = promisify(pbkdf2);

const SENDIT_MASTER = 'EQA6EC52PHvxJnuJoMturYEWJG9621YxMGrncV22ekLj8Zue';
const CONTRACT      = 'EQBRn-Gs3tbrcZovxunRCB30zw9EC4BhRvmIYVuGBFF-h5sU';
const AMOUNT        = 1_000_000_000_000n; // 1000 SEND at 9 decimals

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
      console.log(`  [${label}] attempt ${attempt} failed${is429 ? ' (429)' : ''} - retrying in ${delay / 1000}s…`);
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
  return { keyPair, contract, client, address: wallet.address };
}

async function main() {
  console.log('════════════════════════════════════════════════════════');
  console.log('  Deposit 1000 SEND → pool contract');
  console.log('════════════════════════════════════════════════════════\n');
  console.log(`  SENDIT master:     ${SENDIT_MASTER}`);
  console.log(`  Contract:          ${CONTRACT}`);
  console.log(`  Amount:            ${AMOUNT} nano (1000 SEND)`);
  console.log(`  forwardTonAmount:  0.15 TON\n`);

  const { keyPair, contract: walletContract, client, address: adminAddress } = await getAdminKeypairAndWallet();
  const adminStr = adminAddress.toString({ bounceable: false, urlSafe: true });
  console.log(`  Admin wallet:   ${adminStr}`);

  const balance = await retry(() => client.getBalance(walletContract.address), 'getBalance');
  console.log(`  TON balance:    ${Number(balance) / 1e9} TON`);
  if (balance < toNano('0.2')) throw new Error('Need at least 0.2 TON for gas');

  // Derive admin wallet's own SENDIT jetton wallet
  console.log('\nStep 1: Deriving admin SENDIT jetton wallet…');
  await sleep(1000);
  const adminJettonWallet = await retry(
    () => getJettonWalletAddress(SENDIT_MASTER, adminStr),
    'getAdminJettonWallet',
  );
  const adminJettonWalletStr = adminJettonWallet.toString({ bounceable: true, urlSafe: true });
  console.log(`  Admin SENDIT jetton wallet: ${adminJettonWalletStr}`);

  // Build TEP-74 JettonTransfer body
  // Sent TO admin's jetton wallet, which routes tokens to CONTRACT
  // and fires JettonTransferNotification to CONTRACT with 0.05 TON forward
  const contractAddr = Address.parse(CONTRACT);
  const body = beginCell()
    .storeUint(0x0f8a7ea5, 32)   // transfer opcode (TEP-74)
    .storeUint(0n, 64)            // queryId
    .storeCoins(AMOUNT)           // amount: 1000 SEND
    .storeAddress(contractAddr)   // destination: pool contract
    .storeAddress(adminAddress)   // responseDestination: admin (excess TON back)
    .storeBit(false)              // no custom_payload
    .storeCoins(toNano('0.15'))   // forwardTonAmount: 0.15 TON for notification gas
    .storeBit(false)              // forwardPayload: empty inline
    .endCell();

  console.log('\nStep 2: Sending JettonTransfer from admin jetton wallet…');
  const seqno = await retry(() => walletContract.getSeqno(), 'getSeqno');
  await sleep(1000);

  await retry(() => walletContract.sendTransfer({
    secretKey: keyPair.secretKey,
    seqno,
    messages: [
      internal({
        to: adminJettonWallet,
        value: toNano('0.35'),        // 0.15 forwardTonAmount + ~0.01 jetton wallet gas + buffer
        body,
      }),
    ],
    sendMode: SendMode.PAY_GAS_SEPARATELY,
  }), 'sendJettonTransfer');

  console.log('  ✓ Transaction sent. Waiting for confirmation…');

  for (let i = 0; i < 40; i++) {
    await sleep(2000);
    try {
      const seqnoNow = await walletContract.getSeqno();
      if (seqnoNow > seqno) { console.log('  ✓ Confirmed.'); break; }
    } catch {}
    if (i === 39) throw new Error('Timed out waiting for confirmation');
  }

  // Wait a few seconds for the notification to propagate then check depositedAmount
  console.log('\nStep 3: Waiting 10s for JettonTransferNotification to propagate…');
  await sleep(10000);

  const { GramketingPool } = await import('../contracts/output/gramketing_pool_GramketingPool');
  const pool = client.open(GramketingPool.fromAddress(contractAddr));
  const info = await retry(() => pool.getPoolInfo(), 'getPoolInfo');

  console.log(`\n  depositedAmount: ${info.depositedAmount.toString()} nano`);
  console.log(`  status:          ${info.status.toString()} (0=ACTIVE 1=ENDED 2=DISTRIBUTED)`);

  if (info.depositedAmount === AMOUNT) {
    console.log('\n  ✓ SUCCESS - depositedAmount = 1000000000000. Ready to distribute.');
  } else if (info.depositedAmount === 0n) {
    console.log('\n  ✗ depositedAmount still 0 - notification may not have arrived yet. Re-check in a few seconds.');
  } else {
    console.log(`\n  ⚠ depositedAmount = ${info.depositedAmount} - partial deposit recorded.`);
  }

  console.log('\n════════════════════════════════════════════════════════');
}

main().catch(e => { console.error('\n❌ Error:', e.message); process.exit(1); });
