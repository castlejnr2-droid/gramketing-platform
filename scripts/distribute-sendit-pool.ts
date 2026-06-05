/**
 * scripts/distribute-sendit-pool.ts
 *
 * Sends DistributeRewards to the SENDIT pool contract.
 */

import * as dotenv from 'dotenv';
import * as path from 'path';
dotenv.config({ path: path.resolve(__dirname, '../.env') });

import { sendDistributeRewards, fetchOnChainPoolInfo } from '../lib/gramketing-pool-contract';

const CONTRACT = 'EQBRn-Gs3tbrcZovxunRCB30zw9EC4BhRvmIYVuGBFF-h5sU';

const WINNERS = [
  { walletAddress: 'UQBT3gemp3WFCdrzZySK4qYxyqlxFAnnkw6f2zAQuW7wycpY', shareBasisPoints: 3000 },
  { walletAddress: 'UQAVodkqGkP7tFeMkNvObvdAqpu4T4RGZAVZJ8gK_fm6i8qY', shareBasisPoints: 2500 },
  { walletAddress: 'UQD4MGOmgi8JgC1-lmCwy7z-5ofDTG8yx8QeeDPHdd8H3PFo', shareBasisPoints: 2000 },
  { walletAddress: 'UQA1LHKfnq3kyGADs1gZsFSvXyzNyWxaPcGPyEser39Lod9P', shareBasisPoints: 1500 },
  { walletAddress: 'UQBRYI_UJhv-HIf9mpKB5lWFt8s-Fif-jAuTCL3Cyv-lIGWr', shareBasisPoints: 1000 },
];

const TOTAL_BPS = WINNERS.reduce((s, w) => s + w.shareBasisPoints, 0);

async function main() {
  console.log('════════════════════════════════════════════════════════');
  console.log('  DistributeRewards — SENDIT pool');
  console.log('════════════════════════════════════════════════════════\n');
  console.log(`  Contract: ${CONTRACT}`);
  console.log(`  Winners:  ${WINNERS.length}  |  Total bps: ${TOTAL_BPS} (must be 10000)\n`);

  if (TOTAL_BPS !== 10000) throw new Error(`Basis points sum to ${TOTAL_BPS}, must be 10000`);

  // Pre-flight: confirm depositedAmount and status
  console.log('Pre-flight check…');
  const info = await fetchOnChainPoolInfo(CONTRACT);
  console.log(`  depositedAmount: ${info.depositedAmount.toString()} nano`);
  console.log(`  status:          ${info.status.toString()} (1=ENDED required)`);

  if (info.depositedAmount === 0n) throw new Error('depositedAmount is 0 — deposit tokens first');
  if (info.status === 2n)          throw new Error('Already distributed');
  if (info.status !== 1n)          throw new Error(`Status must be ENDED (1), got ${info.status}`);

  console.log('  ✓ Pre-flight passed.\n');

  // Print distribution plan
  const total = info.depositedAmount;
  console.log('Distribution plan:');
  for (const w of WINNERS) {
    const nano = total * BigInt(w.shareBasisPoints) / 10000n;
    const send = Number(nano) / 1e9;
    console.log(`  ${w.shareBasisPoints / 100}%  ${w.walletAddress}`);
    console.log(`       ${send.toFixed(9)} SEND  (${nano} nano)`);
  }
  console.log('');

  // Send
  console.log('Sending DistributeRewards…');
  await sendDistributeRewards(CONTRACT, WINNERS);
  console.log('  ✓ Transaction sent.\n');

  console.log('════════════════════════════════════════════════════════');
  console.log('  DISTRIBUTION SENT');
  console.log('════════════════════════════════════════════════════════');
  console.log('\nVerify payouts on TON Viewer:');
  for (const w of WINNERS) {
    console.log(`  https://tonviewer.com/${w.walletAddress}`);
  }
}

main().catch(e => { console.error('\n❌ Error:', e.message); process.exit(1); });
