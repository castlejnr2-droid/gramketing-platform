/**
 * scripts/admin-rescue-distribute.ts
 *
 * Emergency manual distribution via AdminRescue.
 *
 * Use when:
 *   - DistributeRewards was triggered before the deposit arrived (depositedAmount=0)
 *   - Contract is now in DISTRIBUTED status (blocks normal redistribution)
 *   - Tokens ARE in the contract's jetton wallet (deposited after status locked)
 *
 * This script sends one AdminRescue message per winner, bypassing the status gate.
 *
 * Run AFTER depositing 2 tsTON to the contract:
 *   npx ts-node --project scripts/tsconfig.json scripts/admin-rescue-distribute.ts
 */

import { Address, beginCell, toNano, internal, SendMode } from '@ton/core';
import { pbkdf2 } from 'crypto';
import { promisify } from 'util';
import {
  keyPairFromSeed,
  getED25519MasterKeyFromSeed,
  deriveED25519HardenedKey,
  KeyPair,
} from '@ton/crypto';
import { WalletContractV5R1, TonClient } from '@ton/ton';
import { storeAdminRescue } from '../contracts/output/gramketing_pool_GramketingPool';
import { GramketingPool } from '../contracts/output/gramketing_pool_GramketingPool';

const pbkdf2Async = promisify(pbkdf2);

// ── Configuration ─────────────────────────────────────────────────────────────

const CONTRACT     = 'EQCBTnjiADujp71xLiCuwkCAxR-X8lZebjC2vclJPSBJNKTI';
const TOTAL_NANO   = 2_000_000_000n; // must match what was deposited

// Winners: exact amounts must sum to ≤ TOTAL_NANO (dust stays in jetton wallet)
const WINNERS = [
  { wallet: 'UQBT3gemp3WFCdrzZySK4qYxyqlxFAnnkw6f2zAQuW7wycpY', amount: 600_000_000n, pct: 30 },
  { wallet: 'UQAVodkqGkP7tFeMkNvObvdAqpu4T4RGZAVZJ8gK_fm6i8qY', amount: 500_000_000n, pct: 25 },
  { wallet: 'UQD4MGOmgi8JgC1-lmCwy7z-5ofDTG8yx8QeeDPHdd8H3PFo', amount: 400_000_000n, pct: 20 },
  { wallet: 'UQA1LHKfnq3kyGADs1gZsFSvXyzNyWxaPcGPyEser39Lod9P', amount: 300_000_000n, pct: 15 },
  { wallet: 'UQBRYI_UJhv-HIf9mpKB5lWFt8s-Fif-jAuTCL3Cyv-lIGWr', amount: 200_000_000n, pct: 10 },
] as const;

// ── Helpers ────────────────────────────────────────────────────────────────────

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
  if (!mnemonic) throw new Error('ADMIN_MNEMONIC not set');
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

function nanoToTon(n: bigint) {
  return `${n / 1_000_000_000n}.${(n % 1_000_000_000n).toString().padStart(9, '0').replace(/0+$/, '') || '0'}`;
}

// ── Main ───────────────────────────────────────────────────────────────────────

async function main() {
  console.log('════════════════════════════════════════════════════════');
  console.log('  AdminRescue — Manual distribution');
  console.log('════════════════════════════════════════════════════════\n');

  // Validate amounts
  const totalOut = WINNERS.reduce((s, w) => s + w.amount, 0n);
  if (totalOut > TOTAL_NANO) throw new Error(`Amounts sum to ${totalOut} which exceeds TOTAL_NANO ${TOTAL_NANO}`);
  const dust = TOTAL_NANO - totalOut;

  console.log('Distribution plan:');
  for (const w of WINNERS) {
    console.log(`  ${w.pct}%  ${w.wallet}`);
    console.log(`       ${nanoToTon(w.amount)} tsTON  (${w.amount} nano)`);
  }
  console.log(`  Dust remaining in jetton wallet: ${nanoToTon(dust)} tsTON`);
  console.log('');

  // ── Step 1: Load admin wallet ──────────────────────────────────────────────
  console.log('Step 1: Loading admin wallet…');
  const { keyPair, contract: walletContract, client } = await getAdminKeypairAndWallet();
  const adminAddr = walletContract.address.toString({ bounceable: false, urlSafe: true });
  console.log(`  Admin wallet: ${adminAddr}`);

  const balance = await retry(() => client.getBalance(walletContract.address), 'getBalance');
  console.log(`  Balance: ${Number(balance) / 1e9} TON`);
  // Each AdminRescue needs ~0.07 TON (0.05 attached + gas)
  const minRequired = toNano('0.1') + BigInt(WINNERS.length) * toNano('0.07');
  if (balance < minRequired) {
    throw new Error(`Need at least ${Number(minRequired) / 1e9} TON, have ${Number(balance) / 1e9}`);
  }

  // ── Step 2: Verify contract state ─────────────────────────────────────────
  console.log('\nStep 2: Verifying contract state…');
  await sleep(1000);
  const contractAddr = Address.parse(CONTRACT);
  const poolContract = client.open(GramketingPool.fromAddress(contractAddr));
  const info = await retry(() => poolContract.getPoolInfo(), 'getPoolInfo');

  console.log(`  status:          ${info.status} (2 = DISTRIBUTED — expected)`);
  console.log(`  depositedAmount: ${info.depositedAmount}`);
  console.log(`  jettonWallet:    ${info.jettonWalletAddress.toString({ bounceable: true, urlSafe: true })}`);

  if (info.depositedAmount === 0n) {
    throw new Error(
      'depositedAmount is still 0. The 2 tsTON have not been deposited yet.\n' +
      `  → Send 2 tsTON from TonKeeper to contract: ${CONTRACT}\n` +
      '  → Wait ~30s for the JettonTransferNotification to be processed\n' +
      '  → Then re-run this script',
    );
  }

  if (info.depositedAmount < TOTAL_NANO) {
    console.warn(`  ⚠️  depositedAmount (${info.depositedAmount}) < TOTAL_NANO (${TOTAL_NANO}) — amounts will be proportionally lower`);
  }

  console.log('  ✓ Contract has tokens. Proceeding with AdminRescue sends.\n');

  // ── Step 3: Send AdminRescue for each winner ───────────────────────────────
  console.log('Step 3: Sending AdminRescue per winner…');

  for (let i = 0; i < WINNERS.length; i++) {
    const winner = WINNERS[i];
    console.log(`\n  [${i + 1}/${WINNERS.length}] ${winner.wallet}`);
    console.log(`         amount: ${winner.amount} nano (${nanoToTon(winner.amount)} tsTON)`);

    await sleep(5000); // rate-limit buffer between each send

    const seqno = await retry(() => walletContract.getSeqno(), `getSeqno-${i + 1}`);
    await sleep(1500);

    await retry(() => walletContract.sendTransfer({
      secretKey: keyPair.secretKey,
      seqno,
      messages: [
        internal({
          to: contractAddr,
          value: toNano('0.07'), // covers AdminRescue gas + 0.05 jetton transfer + 0.01 forward
          body: beginCell()
            .store(storeAdminRescue({
              $$type: 'AdminRescue',
              queryId: BigInt(i + 1),
              amount: winner.amount,
              destination: Address.parse(winner.wallet),
            }))
            .endCell(),
        }),
      ],
      sendMode: SendMode.PAY_GAS_SEPARATELY,
    }), `sendRescue-${i + 1}`);

    console.log(`         ✓ AdminRescue sent (queryId=${i + 1})`);
    console.log(`         Waiting 15s for confirmation…`);
    await sleep(15000);
  }

  // ── Summary ────────────────────────────────────────────────────────────────
  console.log('\n════════════════════════════════════════════════════════');
  console.log('  RESCUE COMPLETE');
  console.log('════════════════════════════════════════════════════════');
  console.log('\nVerify each payout on TON Viewer:');
  for (const w of WINNERS) {
    console.log(`  ${nanoToTon(w.amount)} tsTON → https://tonviewer.com/${w.wallet}`);
  }
  if (dust > 0n) {
    console.log(`\n  Dust (${nanoToTon(dust)} tsTON) remains in the contract's jetton wallet.`);
    console.log(`  Run another AdminRescue to recover it if needed.`);
  }
}

main().catch(e => { console.error('\n❌ Error:', e.message); process.exit(1); });
