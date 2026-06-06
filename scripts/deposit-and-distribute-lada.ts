/**
 * scripts/deposit-and-distribute-lada.ts
 *
 * Step 1 - Deposit 100 LADA from admin wallet to the LADA pool contract
 *           (forwardTonAmount = 0.15 TON, outer gas = 0.35 TON)
 * Step 2 - Verify depositedAmount = 100_000_000 nano
 * Step 3 - Trigger DistributeRewards
 */

import * as dotenv from 'dotenv';
import * as path from 'path';
dotenv.config({ path: path.resolve(__dirname, '../.env') });

import { Address, beginCell, toNano, internal, SendMode, Dictionary } from '@ton/core';
import type { OpenedContract } from '@ton/core';
import { pbkdf2 } from 'crypto';
import { promisify } from 'util';
import {
  keyPairFromSeed,
  getED25519MasterKeyFromSeed,
  deriveED25519HardenedKey,
} from '@ton/crypto';
import { WalletContractV5R1, TonClient } from '@ton/ton';
import {
  GramketingPool,
  storeDistributeRewards,
} from '../contracts/output/gramketing_pool_GramketingPool';
import { getJettonWalletAddress } from '../lib/gramketing-pool-contract';

const pbkdf2Async = promisify(pbkdf2);

const LADA_MASTER = 'EQBjNisz_m-sdA9TcosQMmugdhl6hDjGcCMgQFa85p_8jx7p';
const CONTRACT    = 'EQACsOThz84jv1H5rfxOvwWUnqmbqbiq5dMT_u1kxl2Uj8GN';
const AMOUNT      = 100_000_000_000n; // 100 LADA at 9 decimals

const WINNERS = [
  { walletAddress: 'UQBT3gemp3WFCdrzZySK4qYxyqlxFAnnkw6f2zAQuW7wycpY', shareBasisPoints: 3000 },
  { walletAddress: 'UQAVodkqGkP7tFeMkNvObvdAqpu4T4RGZAVZJ8gK_fm6i8qY', shareBasisPoints: 2500 },
  { walletAddress: 'UQD4MGOmgi8JgC1-lmCwy7z-5ofDTG8yx8QeeDPHdd8H3PFo', shareBasisPoints: 2000 },
  { walletAddress: 'UQA1LHKfnq3kyGADs1gZsFSvXyzNyWxaPcGPyEser39Lod9P', shareBasisPoints: 1500 },
  { walletAddress: 'UQBRYI_UJhv-HIf9mpKB5lWFt8s-Fif-jAuTCL3Cyv-lIGWr', shareBasisPoints: 1000 },
];

function sleep(ms: number) { return new Promise<void>(r => setTimeout(r, ms)); }

async function retry<T>(fn: () => Promise<T>, label: string, maxAttempts = 5): Promise<T> {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try { return await fn(); } catch (err: unknown) {
      const is429 = String(err).includes('429');
      if (attempt === maxAttempts) throw err;
      const delay = is429 ? 3000 * attempt : 2000;
      console.log(`  [${label}] attempt ${attempt} failed${is429 ? ' (429)' : ''} - retrying in ${delay / 1000}s…`);
      await sleep(delay);
    }
  }
  throw new Error('retry exhausted');
}

async function getAdminWallet() {
  const mnemonic = process.env.ADMIN_MNEMONIC;
  if (!mnemonic) throw new Error('ADMIN_MNEMONIC not set');
  const seed = await pbkdf2Async(mnemonic.trim().normalize('NFKD'), 'mnemonic'.normalize('NFKD'), 2048, 64, 'sha512');
  const master  = await getED25519MasterKeyFromSeed(seed);
  const lvl1    = await deriveED25519HardenedKey(master, 44);
  const lvl2    = await deriveED25519HardenedKey(lvl1, 607);
  const lvl3    = await deriveED25519HardenedKey(lvl2, 0);
  const keyPair = await keyPairFromSeed(lvl3.key);
  const client  = new TonClient({ endpoint: process.env.TON_ENDPOINT ?? 'https://toncenter.com/api/v2/jsonRPC' });
  const wallet  = WalletContractV5R1.create({ publicKey: keyPair.publicKey, workchain: 0 });
  return { keyPair, contract: client.open(wallet), client, address: wallet.address };
}

async function waitForSeqno(walletContract: OpenedContract<WalletContractV5R1>, prevSeqno: number) {
  for (let i = 0; i < 40; i++) {
    await sleep(2000);
    try { if (await walletContract.getSeqno() > prevSeqno) return; } catch {}
  }
  throw new Error('Timed out waiting for confirmation');
}

async function main() {
  console.log('════════════════════════════════════════════════════════');
  console.log('  LADA Pool - Deposit → Verify → Distribute');
  console.log('════════════════════════════════════════════════════════\n');
  console.log(`  Contract: ${CONTRACT}`);
  console.log(`  Amount:   ${AMOUNT} nano (100 LADA)\n`);

  const { keyPair, contract: walletContract, client, address: adminAddress } = await getAdminWallet();
  const adminStr = adminAddress.toString({ bounceable: false, urlSafe: true });
  console.log(`  Admin wallet: ${adminStr}`);

  const balance = await retry(() => client.getBalance(walletContract.address), 'getBalance');
  console.log(`  TON balance:  ${Number(balance) / 1e9} TON`);
  // Need: 0.35 (deposit) + 0.1 + 5*0.22 (distribute) = 0.35 + 1.2 = 1.55 TON
  if (balance < toNano('1.6')) throw new Error(`Need at least 1.6 TON. Have: ${Number(balance) / 1e9}`);

  const contractAddr = Address.parse(CONTRACT);
  const pool = client.open(GramketingPool.fromAddress(contractAddr));

  // ══════════════════════════════════════════════════════
  // STEP 1 - Deposit 100 LADA
  // ══════════════════════════════════════════════════════
  console.log('\n──────────────────────────────────────────────────────');
  console.log('  Step 1: Deposit 100 LADA');
  console.log('──────────────────────────────────────────────────────');

  console.log('  Deriving admin LADA jetton wallet…');
  await sleep(1000);
  const adminJettonWallet = await retry(
    () => getJettonWalletAddress(LADA_MASTER, adminStr),
    'getAdminJettonWallet',
  );
  console.log(`  Admin LADA wallet: ${adminJettonWallet.toString({ bounceable: true, urlSafe: true })}`);

  const depositBody = beginCell()
    .storeUint(0x0f8a7ea5, 32)    // TEP-74 transfer opcode
    .storeUint(0n, 64)             // queryId
    .storeCoins(AMOUNT)            // 100 LADA
    .storeAddress(contractAddr)    // destination: pool contract
    .storeAddress(adminAddress)    // responseDestination: admin (excess TON back)
    .storeBit(false)               // no custom_payload
    .storeCoins(toNano('0.15'))    // forwardTonAmount: 0.15 TON
    .storeBit(false)               // forwardPayload: empty inline
    .endCell();

  const seqno1 = await retry(() => walletContract.getSeqno(), 'getSeqno-deposit');
  await sleep(1000);
  await retry(() => walletContract.sendTransfer({
    secretKey: keyPair.secretKey,
    seqno: seqno1,
    messages: [internal({
      to: adminJettonWallet,
      value: toNano('0.35'),  // outer gas: 0.15 forward + 0.01 jetton wallet gas + buffer
      body: depositBody,
    })],
    sendMode: SendMode.PAY_GAS_SEPARATELY,
  }), 'sendDeposit');

  console.log('  ✓ Deposit sent. Waiting for confirmation…');
  await waitForSeqno(walletContract, seqno1);
  console.log('  ✓ Confirmed.');

  // ══════════════════════════════════════════════════════
  // STEP 2 - Verify depositedAmount
  // ══════════════════════════════════════════════════════
  console.log('\n──────────────────────────────────────────────────────');
  console.log('  Step 2: Verify depositedAmount');
  console.log('──────────────────────────────────────────────────────');

  console.log('  Waiting 15s for JettonTransferNotification to propagate…');
  await sleep(15000);

  let info = await retry(() => pool.getPoolInfo(), 'getPoolInfo-verify');
  console.log(`  depositedAmount: ${info.depositedAmount.toString()} nano`);
  console.log(`  status:          ${info.status.toString()} (1=ENDED required)`);

  if (info.depositedAmount === 0n) {
    // Wait a bit longer and retry once
    console.log('  depositedAmount still 0 - waiting 15s more…');
    await sleep(15000);
    info = await retry(() => pool.getPoolInfo(), 'getPoolInfo-retry');
    console.log(`  depositedAmount: ${info.depositedAmount.toString()} nano`);
  }

  if (info.depositedAmount !== AMOUNT) {
    throw new Error(`depositedAmount = ${info.depositedAmount}, expected ${AMOUNT}. Aborting before distribution.`);
  }
  console.log('  ✓ depositedAmount = 100000000. Deposit confirmed.');

  // ══════════════════════════════════════════════════════
  // STEP 3 - DistributeRewards
  // ══════════════════════════════════════════════════════
  console.log('\n──────────────────────────────────────────────────────');
  console.log('  Step 3: DistributeRewards');
  console.log('──────────────────────────────────────────────────────');

  if (info.status === 2n) throw new Error('Already distributed');
  if (info.status !== 1n) throw new Error(`Status must be ENDED (1), got ${info.status}`);

  console.log('  Distribution plan:');
  for (const w of WINNERS) {
    const nano = AMOUNT * BigInt(w.shareBasisPoints) / 10000n;
    console.log(`    ${w.shareBasisPoints / 100}%  ${w.walletAddress}  →  ${Number(nano) / 1e6} LADA (${nano} nano)`);
  }

  const winnersDict = Dictionary.empty(Dictionary.Keys.Address(), Dictionary.Values.BigInt(257));
  for (const w of WINNERS) {
    winnersDict.set(Address.parse(w.walletAddress), BigInt(w.shareBasisPoints));
  }

  const gasAmount = toNano('0.1') + BigInt(WINNERS.length) * toNano('0.22');
  const distributeBody = beginCell()
    .store(storeDistributeRewards({ $$type: 'DistributeRewards', winners: winnersDict }))
    .endCell();

  const seqno2 = await retry(() => walletContract.getSeqno(), 'getSeqno-distribute');
  await sleep(1000);
  await retry(() => walletContract.sendTransfer({
    secretKey: keyPair.secretKey,
    seqno: seqno2,
    messages: [internal({ to: contractAddr, value: gasAmount, body: distributeBody })],
    sendMode: SendMode.PAY_GAS_SEPARATELY,
  }), 'sendDistribute');

  console.log('  ✓ DistributeRewards sent. Waiting for confirmation…');
  await waitForSeqno(walletContract, seqno2);
  console.log('  ✓ Confirmed.');

  // Final status check
  await sleep(5000);
  const finalInfo = await retry(() => pool.getPoolInfo(), 'getPoolInfo-final');
  console.log(`\n  Final status: ${finalInfo.status.toString()} (expected 2 = DISTRIBUTED)`);
  if (finalInfo.status !== 2n) {
    console.log('  ⚠ Status not yet DISTRIBUTED - may still be propagating. Check TON Viewer.');
  } else {
    console.log('  ✓ Contract is DISTRIBUTED.');
  }

  console.log('\n════════════════════════════════════════════════════════');
  console.log('  COMPLETE');
  console.log('════════════════════════════════════════════════════════');
  console.log('\nVerify payouts:');
  for (const w of WINNERS) {
    console.log(`  https://tonviewer.com/${w.walletAddress}`);
  }
}

main().catch(e => { console.error('\n❌ Error:', e.message); process.exit(1); });
