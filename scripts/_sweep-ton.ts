/**
 * Sweep leftover TON from all deployed escrow contracts back to admin wallet.
 *
 * Strategy (no contract redeploy needed):
 *   1. Call SetJettonWallet → admin wallet address
 *      (no status check in contract - works even on DISTRIBUTED)
 *   2. Call AdminRescue with amount=0
 *      (SendRemainingBalance mode 128 → sends entire TON balance to admin wallet)
 *      WalletV5 accepts any incoming message body; TON credits normally.
 *
 * Run:
 *   npx ts-node --project scripts/tsconfig.json scripts/_sweep-ton.ts
 */
import * as dotenv from 'dotenv'; import * as path from 'path';
dotenv.config({ path: path.resolve(__dirname, '../.env') });

import { Address, beginCell, toNano, internal, SendMode } from '@ton/core';
import { TonClient, WalletContractV5R1 } from '@ton/ton';
import { PrismaClient } from '@prisma/client';
import { pbkdf2 } from 'crypto'; import { promisify } from 'util';
import { keyPairFromSeed, getED25519MasterKeyFromSeed, deriveED25519HardenedKey } from '@ton/crypto';
import {
  storeSetJettonWallet,
  storeAdminRescue,
} from '../contracts/output/gramketing_pool_GramketingPool';

const pbkdf2Async = promisify(pbkdf2);
const prisma = new PrismaClient();
const sleep = (ms: number) => new Promise<void>(r => setTimeout(r, ms));

async function retry<T>(fn: () => Promise<T>, label: string, max = 5): Promise<T> {
  for (let i = 1; i <= max; i++) {
    try { return await fn(); } catch (e: unknown) {
      if (i === max) throw e;
      const d = String(e).includes('429') ? 5000 * i : 2000;
      console.log(`  [${label}] attempt ${i} failed - retry in ${d / 1000}s`);
      await sleep(d);
    }
  }
  throw new Error('retry exhausted');
}

async function main() {
  // ── Derive admin wallet ───────────────────────────────────────────────────────
  const mnemonic = process.env.ADMIN_MNEMONIC;
  if (!mnemonic) throw new Error('ADMIN_MNEMONIC not set');

  const seed   = await pbkdf2Async(mnemonic.trim().normalize('NFKD'), 'mnemonic'.normalize('NFKD'), 2048, 64, 'sha512');
  const master = await getED25519MasterKeyFromSeed(seed);
  const lvl1   = await deriveED25519HardenedKey(master, 44);
  const lvl2   = await deriveED25519HardenedKey(lvl1, 607);
  const lvl3   = await deriveED25519HardenedKey(lvl2, 0);
  const keyPair = await keyPairFromSeed(lvl3.key);

  const client = new TonClient({ endpoint: process.env.TON_ENDPOINT ?? 'https://toncenter.com/api/v2/jsonRPC' });
  const wallet = WalletContractV5R1.create({ publicKey: keyPair.publicKey, workchain: 0 });
  const walletContract = client.open(wallet);
  const adminAddr = wallet.address;
  const adminAddrStr = adminAddr.toString({ bounceable: false, urlSafe: true });

  console.log('════════════════════════════════════════════════════════');
  console.log('  Gramketing - TON Sweep');
  console.log('════════════════════════════════════════════════════════\n');
  console.log('Admin wallet:', adminAddrStr);
  const balBefore = await retry(() => client.getBalance(adminAddr), 'balBefore');
  console.log('Admin TON balance (before):', Number(balBefore) / 1e9, 'TON\n');

  // ── Query all contracts ───────────────────────────────────────────────────────
  const pools = await prisma.pool.findMany({
    where: { contractAddress: { not: null } },
    select: { id: true, tokenSymbol: true, status: true, contractAddress: true },
    orderBy: { createdAt: 'asc' },
  });

  console.log(`Found ${pools.length} contract(s) in DB:\n`);

  const MIN_SWEEP = toNano('0.05'); // only sweep if balance > 0.05 TON
  const THRESHOLD_DISPLAY = 0.05;
  let totalSwept = 0n;
  const results: { contract: string; symbol: string; balBefore: bigint; swept: boolean; reason?: string }[] = [];

  for (const pool of pools) {
    const contractAddrStr = pool.contractAddress!;
    console.log(`──────────────────────────────────────────────────────`);
    console.log(`Pool ${pool.id}  [${pool.tokenSymbol}]  DB status=${pool.status}`);
    console.log(`Contract: ${contractAddrStr}`);
    await sleep(4000);

    let contractAddr: Address;
    try { contractAddr = Address.parse(contractAddrStr); }
    catch (e) { console.log(`  ✗ Invalid address: ${e}`); continue; }

    // Check balance
    const bal = await retry(() => client.getBalance(contractAddr), 'getBalance');
    console.log(`  TON balance: ${Number(bal) / 1e9} TON`);

    if (bal <= MIN_SWEEP) {
      console.log(`  → Skipping (balance ≤ ${THRESHOLD_DISPLAY} TON, not worth the gas)\n`);
      results.push({ contract: contractAddrStr, symbol: pool.tokenSymbol, balBefore: bal, swept: false, reason: 'below threshold' });
      continue;
    }

    // ── Step A: SetJettonWallet → admin wallet ──────────────────────────────────
    console.log(`  Step A: SetJettonWallet → admin…`);
    await sleep(1000);

    let seqno: number;
    try {
      seqno = await retry(() => walletContract.getSeqno(), 'seqno-A');
    } catch (e) {
      console.log(`  ✗ Could not fetch seqno: ${e}`);
      results.push({ contract: contractAddrStr, symbol: pool.tokenSymbol, balBefore: bal, swept: false, reason: `seqno error: ${e}` });
      continue;
    }

    const setJWBody = beginCell()
      .store(storeSetJettonWallet({ $$type: 'SetJettonWallet', newJettonWalletAddress: adminAddr }))
      .endCell();

    try {
      await retry(() => walletContract.sendTransfer({
        seqno,
        secretKey: keyPair.secretKey,
        messages: [internal({
          to: contractAddr,
          bounce: true,
          value: toNano('0.05'),
          body: setJWBody,
        })],
        sendMode: SendMode.PAY_GAS_SEPARATELY,
      }), 'sendSetJW');
      console.log(`  ✓ SetJettonWallet sent (seqno ${seqno})`);
    } catch (e) {
      console.log(`  ✗ SetJettonWallet failed: ${e}`);
      results.push({ contract: contractAddrStr, symbol: pool.tokenSymbol, balBefore: bal, swept: false, reason: `SetJettonWallet error: ${e}` });
      continue;
    }

    // Wait for tx to land (poll seqno)
    console.log(`  Waiting for SetJettonWallet to confirm…`);
    for (let i = 0; i < 20; i++) {
      await sleep(3000);
      try {
        const current = await walletContract.getSeqno();
        if (current > seqno) { console.log(`  ✓ Confirmed (seqno now ${current})`); break; }
      } catch { /* ignore */ }
      if (i === 19) console.log(`  ⚠ Seqno did not advance after 60s - proceeding anyway`);
    }

    await sleep(3000);

    // ── Step B: AdminRescue (SendRemainingBalance) ──────────────────────────────
    console.log(`  Step B: AdminRescue → drain all TON to admin…`);
    await sleep(1000);

    let seqno2: number;
    try {
      seqno2 = await retry(() => walletContract.getSeqno(), 'seqno-B');
    } catch (e) {
      console.log(`  ✗ Could not fetch seqno: ${e}`);
      results.push({ contract: contractAddrStr, symbol: pool.tokenSymbol, balBefore: bal, swept: false, reason: `seqno2 error: ${e}` });
      continue;
    }

    const rescueBody = beginCell()
      .store(storeAdminRescue({
        $$type: 'AdminRescue',
        queryId: BigInt(Date.now()),
        amount: 0n,
        destination: adminAddr,
      }))
      .endCell();

    try {
      await retry(() => walletContract.sendTransfer({
        seqno: seqno2,
        secretKey: keyPair.secretKey,
        messages: [internal({
          to: contractAddr,
          bounce: true,
          value: toNano('0.05'), // ignored - contract uses SendRemainingBalance (mode 128)
          body: rescueBody,
        })],
        sendMode: SendMode.PAY_GAS_SEPARATELY,
      }), 'sendRescue');
      console.log(`  ✓ AdminRescue sent (seqno ${seqno2})`);
    } catch (e) {
      console.log(`  ✗ AdminRescue failed: ${e}`);
      results.push({ contract: contractAddrStr, symbol: pool.tokenSymbol, balBefore: bal, swept: false, reason: `AdminRescue error: ${e}` });
      continue;
    }

    // Wait for AdminRescue to confirm
    console.log(`  Waiting for AdminRescue to confirm…`);
    for (let i = 0; i < 20; i++) {
      await sleep(3000);
      try {
        const current = await walletContract.getSeqno();
        if (current > seqno2) { console.log(`  ✓ Confirmed (seqno now ${current})`); break; }
      } catch { /* ignore */ }
      if (i === 19) console.log(`  ⚠ Seqno did not advance after 60s`);
    }

    await sleep(5000);

    // Verify contract balance dropped
    const balAfter = await retry(() => client.getBalance(contractAddr), 'balAfter');
    const swept = bal - balAfter;
    totalSwept += swept;
    console.log(`  Contract balance after: ${Number(balAfter) / 1e9} TON`);
    console.log(`  ✓ Swept: ${Number(swept) / 1e9} TON from this contract\n`);
    results.push({ contract: contractAddrStr, symbol: pool.tokenSymbol, balBefore: bal, swept: true });
  }

  // ── Summary ─────────────────────────────────────────────────────────────────
  await sleep(3000);
  const balAfterTotal = await retry(() => client.getBalance(adminAddr), 'balAfterTotal');

  console.log('\n════════════════════════════════════════════════════════');
  console.log('  SWEEP SUMMARY');
  console.log('════════════════════════════════════════════════════════');
  for (const r of results) {
    if (r.swept) {
      console.log(`  ✓ ${r.symbol}  ${r.contract.slice(0, 20)}…  ${Number(r.balBefore) / 1e9} TON swept`);
    } else {
      console.log(`  ✗ ${r.symbol}  ${r.contract.slice(0, 20)}…  skipped (${r.reason})`);
    }
  }
  console.log(`\n  Total TON swept from contracts: ~${Number(totalSwept) / 1e9} TON`);
  console.log(`  Admin balance before: ${Number(balBefore) / 1e9} TON`);
  console.log(`  Admin balance after:  ${Number(balAfterTotal) / 1e9} TON`);
  console.log(`  Net change:           ${Number(balAfterTotal - balBefore) / 1e9} TON`);
  console.log('\nDone.');

  await prisma.$disconnect();
}

main().catch(e => { console.error('❌', e.message ?? e); process.exit(1); });
