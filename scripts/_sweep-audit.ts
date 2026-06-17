/**
 * Audit script: inspect on-chain state of all escrow contracts.
 * Checks TON balance, on-chain status, depositedAmount, and
 * admin wallet's jetton balance for each token (needed for drain strategy).
 */
import * as dotenv from 'dotenv'; import * as path from 'path';
dotenv.config({ path: path.resolve(__dirname, '../.env') });

import { Address, beginCell } from '@ton/core';
import { TonClient } from '@ton/ton';
import { PrismaClient } from '@prisma/client';
import { GramketingPool } from '../contracts/output/gramketing_pool_GramketingPool';
import { getJettonWalletAddress } from '../lib/gramketing-pool-contract';
import { pbkdf2 } from 'crypto'; import { promisify } from 'util';
import { keyPairFromSeed, getED25519MasterKeyFromSeed, deriveED25519HardenedKey } from '@ton/crypto';
import { WalletContractV5R1 } from '@ton/ton';

const pbkdf2Async = promisify(pbkdf2);
const prisma = new PrismaClient();

const sleep = (ms: number) => new Promise<void>(r => setTimeout(r, ms));
async function retry<T>(fn: () => Promise<T>, label: string, max = 4): Promise<T> {
  for (let i = 1; i <= max; i++) {
    try { return await fn(); } catch (e: unknown) {
      if (i === max) throw e;
      const d = String(e).includes('429') ? 3000*i : 1500;
      await sleep(d);
    }
  }
  throw new Error('exhausted');
}

async function main() {
  const client = new TonClient({ endpoint: process.env.TON_ENDPOINT ?? 'https://toncenter.com/api/v2/jsonRPC' });

  // Derive admin wallet address
  const mnemonic = process.env.ADMIN_MNEMONIC!;
  const seed   = await pbkdf2Async(mnemonic.trim().normalize('NFKD'), 'mnemonic'.normalize('NFKD'), 2048, 64, 'sha512');
  const m      = await getED25519MasterKeyFromSeed(seed);
  const l1     = await deriveED25519HardenedKey(m, 44);
  const l2     = await deriveED25519HardenedKey(l1, 607);
  const l3     = await deriveED25519HardenedKey(l2, 0);
  const kp     = await keyPairFromSeed(l3.key);
  const wallet = WalletContractV5R1.create({ publicKey: kp.publicKey, workchain: 0 });
  const adminAddr = wallet.address.toString({ bounceable: false, urlSafe: true });
  console.log('Admin wallet:', adminAddr);
  const adminBal = await retry(() => client.getBalance(wallet.address), 'adminBal');
  console.log('Admin TON balance:', Number(adminBal)/1e9, 'TON\n');

  // Query all pools with a contract address
  const pools = await prisma.pool.findMany({
    where: { contractAddress: { not: null } },
    select: { id: true, tokenSymbol: true, jettonMasterAddress: true, status: true, contractAddress: true },
    orderBy: { createdAt: 'asc' },
  });

  console.log(`Found ${pools.length} contract(s) in DB:\n`);

  for (const pool of pools) {
    const addr = pool.contractAddress!;
    console.log(`──────────────────────────────────────────────────────`);
    console.log(`Pool: ${pool.id}  [${pool.tokenSymbol}]  status=${pool.status}`);
    console.log(`Contract: ${addr}`);
    await sleep(1200);

    // TON balance
    try {
      const parsedAddr = Address.parse(addr);
      const bal = await retry(() => client.getBalance(parsedAddr), 'contractBal');
      console.log(`TON balance: ${Number(bal)/1e9} TON  (${bal} nano)`);

      // Contract state
      const state = await retry(() => client.getContractState(parsedAddr), 'contractState');
      console.log(`Contract state: ${state.state}`);

      if (state.state === 'active') {
        // Try poolInfo getter
        try {
          const poolContract = client.open(GramketingPool.fromAddress(parsedAddr));
          const info = await retry(() => poolContract.getPoolInfo(), 'poolInfo');
          console.log(`depositedAmount: ${info.depositedAmount} nano`);
          console.log(`on-chain status: ${info.status} (0=ACTIVE 1=ENDED 2=DISTRIBUTED)`);
          console.log(`jettonWallet:    ${info.jettonWalletAddress.toString({ bounceable: true, urlSafe: true })}`);
          console.log(`admin (in contract): ${info.admin.toString({ bounceable: false, urlSafe: true })}`);

          // Check jetton wallet TON + token balance
          await sleep(1000);
          const jwAddr = info.jettonWalletAddress;
          const jwBal = await retry(() => client.getBalance(jwAddr), 'jwBal');
          console.log(`Jetton wallet TON balance: ${Number(jwBal)/1e9} TON`);
        } catch (e: unknown) {
          console.log(`poolInfo() failed (old bytecode?): ${e instanceof Error ? e.message : e}`);
        }
      }

      // Admin's jetton wallet balance for this token
      await sleep(1000);
      try {
        const adminJettonWallet = await retry(() => getJettonWalletAddress(pool.jettonMasterAddress, adminAddr), 'adminJW');
        const adminJWStr = adminJettonWallet.toString({ bounceable: true, urlSafe: true });
        const adminJWState = await retry(() => client.getContractState(adminJettonWallet), 'adminJWState');
        let adminTokenBal = 'unknown';
        if (adminJWState.state === 'active') {
          // Try to read jetton balance via get_wallet_data
          try {
            const res = await client.runMethod(adminJettonWallet, 'get_wallet_data', []);
            const balance = res.stack.readBigNumber();
            adminTokenBal = balance.toString() + ' nano';
          } catch {
            adminTokenBal = 'unable to read';
          }
        } else {
          adminTokenBal = '0 (wallet uninitialised)';
        }
        console.log(`Admin's ${pool.tokenSymbol} jetton wallet: ${adminJWStr}`);
        console.log(`Admin's ${pool.tokenSymbol} balance: ${adminTokenBal}`);
      } catch (e: unknown) {
        console.log(`Could not check admin token balance: ${e instanceof Error ? e.message : e}`);
      }
    } catch (e: unknown) {
      console.log(`Error checking contract: ${e instanceof Error ? e.message : e}`);
    }
    console.log('');
  }

  await prisma.$disconnect();
}

main().catch(e => { console.error('❌', e.message); process.exit(1); });
