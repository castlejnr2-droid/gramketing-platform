/**
 * scripts/deploy-test-pool-contract.ts
 *
 * Deploys the GramketingPool escrow contract for the test pool and saves the
 * contractAddress back to the database.
 *
 * Design note - owner = admin wallet for this test:
 *   The contract's CreatePool message requires sender() == self.owner.
 *   Since the admin wallet signs all transactions, we set owner = admin for
 *   the test so the admin can initialize the pool. Dust from distribution
 *   returns to the admin wallet, which is fine for a test.
 *
 * Run:
 *   npx ts-node --project scripts/tsconfig.json scripts/deploy-test-pool-contract.ts
 */

import { PrismaClient } from '@prisma/client';
import { Address, beginCell, toNano, internal, SendMode, contractAddress } from '@ton/core';
import { pbkdf2 } from 'crypto';
import { promisify } from 'util';
import {
  keyPairFromSeed,
  getED25519MasterKeyFromSeed,
  deriveED25519HardenedKey,
  KeyPair,
} from '@ton/crypto';
import { WalletContractV5R1, TonClient, OpenedContract } from '@ton/ton';
import {
  GramketingPool,
  storeCreatePool,
} from '../contracts/output/gramketing_pool_GramketingPool';
import { getJettonWalletAddress } from '../lib/gramketing-pool-contract';

const pbkdf2Async = promisify(pbkdf2);
const prisma = new PrismaClient();

const POOL_ID        = 'cmq0vh8fj0003afhl7geq3u4f';
const JETTON_MASTER  = 'EQC98_qAmNEptUtPc7W6xdHh_ZHrBUFpw5Ft_IzNU20QAJav'; // tsTON mainnet
const TOTAL_REWARD_NANO = 2_000_000_000n; // 2.0 tsTON (9 decimals)
const DURATION_DAYS  = 7;
const REWARD_SLOTS   = 5;

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

/** Retry an async call up to maxAttempts times, backing off on 429 / network errors */
async function retry<T>(fn: () => Promise<T>, label: string, maxAttempts = 5): Promise<T> {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err: unknown) {
      const status = (err as { response?: { status?: number } })?.response?.status;
      const isRateLimit = status === 429 || String(err).includes('429');
      if (attempt === maxAttempts) throw err;
      const delay = isRateLimit ? 3000 * attempt : 2000;
      console.log(`  [${label}] attempt ${attempt} failed (${isRateLimit ? '429 rate limit' : 'error'}) - retrying in ${delay / 1000}s…`);
      await sleep(delay);
    }
  }
  throw new Error('retry exhausted');
}

async function getAdminKeypairAndWallet(): Promise<{
  keyPair: KeyPair;
  wallet: WalletContractV5R1;
  contract: OpenedContract<WalletContractV5R1>;
  client: TonClient;
  address: string;
}> {
  const mnemonic = process.env.ADMIN_MNEMONIC;
  if (!mnemonic) throw new Error('ADMIN_MNEMONIC not set in .env');

  const seed = await pbkdf2Async(
    mnemonic.trim().normalize('NFKD'),
    'mnemonic'.normalize('NFKD'),
    2048, 64, 'sha512',
  );
  const master = await getED25519MasterKeyFromSeed(seed);
  const lvl1   = await deriveED25519HardenedKey(master, 44);
  const lvl2   = await deriveED25519HardenedKey(lvl1,   607);
  const lvl3   = await deriveED25519HardenedKey(lvl2,   0);
  const keyPair = await keyPairFromSeed(lvl3.key);

  const client  = new TonClient({ endpoint: process.env.TON_ENDPOINT ?? 'https://toncenter.com/api/v2/jsonRPC' });
  const wallet  = WalletContractV5R1.create({ publicKey: keyPair.publicKey, workchain: 0 });
  const contract = client.open(wallet);
  const address  = wallet.address.toString({ bounceable: false, urlSafe: true });

  return { keyPair, wallet, contract, client, address };
}

async function main() {
  console.log('════════════════════════════════════════════════════════');
  console.log('  Deploy GramketingPool escrow - test pool (v2)');
  console.log('════════════════════════════════════════════════════════\n');

  // ── Step 1: Load admin wallet ────────────────────────────────────────────
  console.log('Step 1: Loading admin wallet…');
  const { keyPair, contract: walletContract, client, address: adminAddr } = await getAdminKeypairAndWallet();
  console.log(`  Admin wallet: ${adminAddr}`);

  const balance = await retry(() => client.getBalance(walletContract.address), 'getBalance');
  console.log(`  Balance: ${Number(balance) / 1e9} TON`);
  if (balance < toNano('0.3')) {
    throw new Error(`Insufficient balance - need at least 0.3 TON, have ${Number(balance) / 1e9} TON`);
  }

  // ── Step 2: Compute contract address ────────────────────────────────────
  console.log('\nStep 2: Computing contract address (new bytecode after audit fixes)…');
  const owner = walletContract.address;
  const admin = walletContract.address;

  const poolInit = await GramketingPool.init(owner, admin, BigInt(Date.now()));
  const poolAddress = contractAddress(0, poolInit);
  const poolAddrStr = poolAddress.toString({ bounceable: true, urlSafe: true });
  const poolAddrNB  = poolAddress.toString({ bounceable: false, urlSafe: true });
  console.log(`  Contract address (bounceable):     ${poolAddrStr}`);
  console.log(`  Contract address (non-bounceable): ${poolAddrNB}`);

  // ── Step 3: Deploy if not already active ────────────────────────────────
  console.log('\nStep 3: Checking contract state…');
  await sleep(1500);
  const existingState = await retry(() => client.getContractState(poolAddress), 'getContractState');
  console.log(`  State: ${existingState.state}`);

  if (existingState.state !== 'active') {
    console.log('  Deploying…');
    await sleep(1500);
    const seqno = await retry(() => walletContract.getSeqno(), 'getSeqno');
    await sleep(1000);
    await retry(() => walletContract.sendTransfer({
      secretKey: keyPair.secretKey,
      seqno,
      messages: [
        internal({
          to: poolAddress,
          value: toNano('0.15'),
          init: poolInit,
          body: beginCell()
            .storeUint(2490013878, 32) // Deploy opcode (Tact Deployable)
            .storeUint(0n, 64)
            .endCell(),
          bounce: false,
        }),
      ],
      sendMode: SendMode.PAY_GAS_SEPARATELY,
    }), 'sendDeploy');

    console.log('  Waiting for contract to become active (up to 90s)…');
    let active = false;
    for (let i = 0; i < 30; i++) {
      await sleep(3000);
      const state = await retry(() => client.getContractState(poolAddress), 'pollState').catch(() => ({ state: 'unknown' }));
      process.stdout.write(`  [${i + 1}/30] state=${state.state}\r`);
      if (state.state === 'active') { active = true; break; }
    }
    if (!active) throw new Error('Contract deployment timed out - check admin wallet balance on TON Viewer');
    console.log('\n  ✓ Contract is active.');
  } else {
    console.log('  Contract already active - skipping deploy.');
  }

  // ── Step 4: Derive real tsTON jetton wallet address for this contract ───
  console.log('\nStep 4: Deriving pool\'s tsTON jetton wallet address…');
  console.log(`  Jetton master: ${JETTON_MASTER}`);
  await sleep(2000);
  const poolJettonWallet = await retry(
    () => getJettonWalletAddress(JETTON_MASTER, poolAddrStr),
    'getJettonWalletAddress',
  );
  const poolJettonWalletStr = poolJettonWallet.toString({ bounceable: true, urlSafe: true });
  console.log(`  Pool tsTON jetton wallet: ${poolJettonWalletStr}`);
  console.log('  ✓ Jetton wallet address derived from live on-chain call.');

  // ── Step 5: Send CreatePool if not yet initialized ───────────────────────
  console.log('\nStep 5: Checking if CreatePool needed…');
  await sleep(2000);
  const openPool = client.open(GramketingPool.fromAddress(poolAddress));
  const info = await retry(() => openPool.getPoolInfo(), 'getPoolInfo');
  console.log(`  startTime: ${info.startTime}  status: ${info.status}`);
  console.log(`  jettonWalletAddress: ${info.jettonWalletAddress.toString({ bounceable: true, urlSafe: true })}`);

  if (info.startTime === 0n) {
    console.log('  Sending CreatePool with real tsTON jetton wallet…');
    await sleep(5000);
    const seqno = await retry(() => walletContract.getSeqno(), 'getSeqnoForCreatePool');
    await sleep(2000);
    await retry(() => walletContract.sendTransfer({
      secretKey: keyPair.secretKey,
      seqno,
      messages: [
        internal({
          to: poolAddress,
          value: toNano('0.05'),
          body: beginCell()
            .store(storeCreatePool({
              $$type: 'CreatePool',
              jettonWalletAddress: poolJettonWallet,
              totalReward: TOTAL_REWARD_NANO,
              durationDays: BigInt(DURATION_DAYS),
              rewardSlots:  BigInt(REWARD_SLOTS),
            }))
            .endCell(),
        }),
      ],
      sendMode: SendMode.PAY_GAS_SEPARATELY,
    }), 'sendCreatePool');
    console.log('  Waiting 15s for CreatePool to be processed…');
    await sleep(15000);

    const info2 = await retry(() => openPool.getPoolInfo(), 'getPoolInfo2');
    console.log(`  startTime after: ${info2.startTime}  status: ${info2.status}`);
    console.log(`  jettonWalletAddress: ${info2.jettonWalletAddress.toString({ bounceable: true, urlSafe: true })}`);
    if (info2.startTime === 0n) {
      throw new Error('CreatePool was not processed - check TON Viewer for the contract');
    }
    // Verify jetton wallet was set correctly
    const storedJettonWallet = info2.jettonWalletAddress.toString({ bounceable: true, urlSafe: true });
    if (storedJettonWallet !== poolJettonWalletStr) {
      throw new Error(`Jetton wallet mismatch! Stored: ${storedJettonWallet}, Expected: ${poolJettonWalletStr}`);
    }
    console.log('  ✓ Pool initialized on-chain with correct tsTON jetton wallet.');
  } else {
    console.log('  Pool already initialized - verifying jetton wallet address…');
    const stored = info.jettonWalletAddress.toString({ bounceable: true, urlSafe: true });
    if (stored !== poolJettonWalletStr) {
      console.log(`  ⚠️  Stored jetton wallet (${stored}) != expected (${poolJettonWalletStr})`);
      console.log('  Sending SetJettonWallet to correct it…');
      // Use the new SetJettonWallet admin setter added in the audit fix
      const { storeSetJettonWallet } = await import('../contracts/output/gramketing_pool_GramketingPool');
      await sleep(5000);
      const seqno = await retry(() => walletContract.getSeqno(), 'getSeqnoForSetJettonWallet');
      await sleep(2000);
      await retry(() => walletContract.sendTransfer({
        secretKey: keyPair.secretKey,
        seqno,
        messages: [
          internal({
            to: poolAddress,
            value: toNano('0.05'),
            body: beginCell()
              .store(storeSetJettonWallet({
                $$type: 'SetJettonWallet',
                newJettonWalletAddress: poolJettonWallet,
              }))
              .endCell(),
          }),
        ],
        sendMode: SendMode.PAY_GAS_SEPARATELY,
      }), 'sendSetJettonWallet');
      await sleep(12000);
      const infoAfterSet = await retry(() => openPool.getPoolInfo(), 'getPoolInfoAfterSet');
      const storedAfter = infoAfterSet.jettonWalletAddress.toString({ bounceable: true, urlSafe: true });
      console.log(`  jettonWalletAddress after SetJettonWallet: ${storedAfter}`);
      if (storedAfter !== poolJettonWalletStr) {
        throw new Error(`SetJettonWallet did not take effect. Stored: ${storedAfter}`);
      }
      console.log('  ✓ Jetton wallet corrected via SetJettonWallet.');
    } else {
      console.log(`  ✓ Jetton wallet address is correct: ${stored}`);
    }
  }

  // ── Step 6: Send endPool so distribution can be triggered immediately ───
  console.log('\nStep 6: Sending endPool to allow immediate distribution…');
  await sleep(2000);
  const infoForEnd = await retry(() => openPool.getPoolInfo(), 'getPoolInfoForEnd');
  console.log(`  Current status: ${infoForEnd.status} (0=ACTIVE 1=ENDED 2=DISTRIBUTED)`);
  if (infoForEnd.status === 0n) { // POOL_ACTIVE
    await sleep(5000);
    const seqno = await retry(() => walletContract.getSeqno(), 'getSeqnoForEndPool');
    await sleep(2000);
    await retry(() => walletContract.sendTransfer({
      secretKey: keyPair.secretKey,
      seqno,
      messages: [
        internal({
          to: poolAddress,
          value: toNano('0.05'),
          body: beginCell()
            .storeUint(0, 32)
            .storeStringTail('endPool')
            .endCell(),
        }),
      ],
      sendMode: SendMode.PAY_GAS_SEPARATELY,
    }), 'sendEndPool');
    console.log('  Waiting 15s for endPool…');
    await sleep(15000);
    const info3 = await retry(() => openPool.getPoolInfo(), 'getPoolInfo3');
    console.log(`  Contract status after endPool: ${info3.status} (expected 1 = ENDED)`);
    if (info3.status !== 1n) {
      throw new Error(`endPool did not take effect - status is ${info3.status}`);
    }
    console.log('  ✓ Pool ended on-chain.');
  } else {
    console.log(`  Contract already in status ${infoForEnd.status} - skipping endPool.`);
  }

  // ── Step 7: Save contractAddress to DB ──────────────────────────────────
  console.log('\nStep 7: Saving contractAddress to database…');
  await prisma.pool.update({
    where: { id: POOL_ID },
    data: { contractAddress: poolAddrStr },
  });
  console.log(`  ✓ Pool ${POOL_ID} updated with contractAddress: ${poolAddrStr}`);

  // ── Summary ─────────────────────────────────────────────────────────────
  console.log('\n════════════════════════════════════════════════════════');
  console.log('  DEPLOYMENT COMPLETE');
  console.log('════════════════════════════════════════════════════════');
  console.log(`  Contract:              ${poolAddrStr}`);
  console.log(`  Pool tsTON jetton wallet: ${poolJettonWalletStr}`);
  console.log(`  TON Viewer:            https://tonviewer.com/${poolAddrStr}`);
  console.log(`
  ── NEXT STEP: DEPOSIT 2 tsTON ──────────────────────────
  Send exactly 2 tsTON to the CONTRACT address from TonKeeper:
    Token:   tsTON (Tonstakers Liquid Staking)
    To:      ${poolAddrStr}   ← contract address (NOT the jetton wallet)
    Amount:  2.0 tsTON

  TonKeeper will route the jetton transfer through your tsTON jetton wallet
  to the contract's tsTON jetton wallet (${poolJettonWalletStr}).
  The contract will record depositedAmount = 2000000000 via JettonTransferNotification.

  After depositing, verify on TON Viewer:
    1. Check the pool contract's tsTON jetton wallet balance = 2 tsTON
    2. Call getPoolInfo - depositedAmount should = 2000000000
  Then trigger distribution from the admin panel at /admin/pools.
  ────────────────────────────────────────────────────────`);
}

main()
  .catch((err) => { console.error('\n❌ Error:', err.message ?? err); process.exit(1); })
  .finally(() => prisma.$disconnect());
