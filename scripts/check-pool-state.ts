import { TonClient } from '@ton/ton';
import { Address } from '@ton/core';
import { GramketingPool } from '../contracts/output/gramketing_pool_GramketingPool';

const CONTRACT = 'EQCBTnjiADujp71xLiCuwkCAxR-X8lZebjC2vclJPSBJNKTI';
const EXPECTED_JETTON_WALLET = 'EQAU8KdeDbA7s1GLQVat_y_1bVeEawSM2tt-Ttw08bgT1bpF';

async function main() {
  const endpoint = process.env.TON_ENDPOINT ?? 'https://toncenter.com/api/v2/jsonRPC';
  const client = new TonClient({ endpoint });
  const addr = Address.parse(CONTRACT);
  const pool = client.open(GramketingPool.fromAddress(addr));

  console.log(`Querying ${CONTRACT} …\n`);
  const info = await pool.getPoolInfo();

  const jettonWalletStr = info.jettonWalletAddress.toString({ bounceable: true, urlSafe: true });

  console.log('══ Raw poolInfo ════════════════════════════════════════');
  console.log('  owner:               ', info.owner.toString({ bounceable: false, urlSafe: true }));
  console.log('  admin:               ', info.admin.toString({ bounceable: false, urlSafe: true }));
  console.log('  jettonWalletAddress: ', jettonWalletStr);
  console.log('  totalReward:         ', info.totalReward.toString(), 'nano');
  console.log('  depositedAmount:     ', info.depositedAmount.toString(), 'nano');
  console.log('  durationDays:        ', info.durationDays.toString());
  console.log('  rewardSlots:         ', info.rewardSlots.toString());
  console.log('  startTime:           ', info.startTime.toString(), `(${new Date(Number(info.startTime) * 1000).toISOString()})`);
  console.log('  endTime:             ', info.endTime.toString(), `(${new Date(Number(info.endTime) * 1000).toISOString()})`);
  console.log('  status:              ', info.status.toString(), '(0=ACTIVE 1=ENDED 2=DISTRIBUTED)');
  console.log('═══════════════════════════════════════════════════════\n');

  // Diagnosis
  const depositOk = info.depositedAmount > 0n;
  const jettonWalletOk = jettonWalletStr === EXPECTED_JETTON_WALLET;
  const statusOk = info.status === 1n;

  console.log('══ Diagnosis ═══════════════════════════════════════════');
  console.log(`  depositedAmount > 0:    ${depositOk ? '✓ YES' : '✗ NO  ← PROBLEM'}`);
  console.log(`  jettonWallet correct:   ${jettonWalletOk ? '✓ YES' : `✗ NO  ← stored=${jettonWalletStr}`}`);
  console.log(`  status == ENDED (1):    ${statusOk ? '✓ YES' : `✗ NO  status=${info.status} (0=ACTIVE 2=DISTRIBUTED)`}`);
  console.log('═══════════════════════════════════════════════════════');

  if (!depositOk) {
    console.log(`
  depositedAmount is 0.

  The tsTON jetton transfer notification was NOT received by the contract.

  Likely cause:
    The JettonTransferNotification was sent by the tsTON jetton wallet to the contract
    but the contract rejected it with "Only jetton wallet can notify" because either:
      (a) the notification sender ≠ self.jettonWalletAddress stored in the contract, OR
      (b) the deposit went to the OLD contract (EQC9WF5m…) not this one.

  Contract's stored jettonWalletAddress: ${jettonWalletStr}
  Expected tsTON jetton wallet:          ${EXPECTED_JETTON_WALLET}

  Fix without redeployment → use AdminRescue:
    The 2 tsTON are sitting in the tsTON jetton wallet (${EXPECTED_JETTON_WALLET}).
    Send AdminRescue from the admin wallet to pull them out to any address,
    then re-deposit correctly so the notification is accepted.

  TON Viewer - check the contract's jetton wallet balance:
    https://tonviewer.com/${EXPECTED_JETTON_WALLET}
`);
  }
}

main().catch(e => { console.error('ERROR:', e.message); process.exit(1); });
