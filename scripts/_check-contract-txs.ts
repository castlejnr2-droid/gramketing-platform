import * as dotenv from 'dotenv';
import * as path from 'path';
dotenv.config({ path: path.resolve(__dirname, '../.env') });

import { TonClient } from '@ton/ton';
import { Address } from '@ton/core';

const CONTRACT = 'EQBRn-Gs3tbrcZovxunRCB30zw9EC4BhRvmIYVuGBFF-h5sU';

async function main() {
  const client = new TonClient({ endpoint: process.env.TON_ENDPOINT ?? 'https://toncenter.com/api/v2/jsonRPC' });
  const addr = Address.parse(CONTRACT);

  const txs = await client.getTransactions(addr, { limit: 10 });
  if (txs.length === 0) { console.log('No transactions found.'); return; }

  console.log(`Contract transactions for ${CONTRACT} (latest ${txs.length}):\n`);

  for (const tx of txs) {
    const hash = tx.hash().toString('hex').slice(0, 16);
    const time = new Date(tx.now * 1000).toISOString();

    const inMsg  = tx.inMessage;
    const inSrc  = inMsg?.info?.type === 'internal'
      ? inMsg.info.src?.toString({ bounceable: true, urlSafe: true }) ?? 'unknown'
      : 'external';
    const inVal  = inMsg?.info?.type === 'internal' ? inMsg.info.value.coins.toString() : '—';
    const bounce = inMsg?.info?.type === 'internal' ? inMsg.info.bounce : false;

    const exitCode     = tx.description.type === 'generic'
      ? tx.description.computePhase?.type === 'vm'
        ? tx.description.computePhase.exitCode
        : 'no-vm'
      : tx.description.type;
    const aborted      = tx.description.type === 'generic' ? tx.description.aborted : false;
    const actionResult = tx.description.type === 'generic'
      ? tx.description.actionPhase?.resultCode ?? 'n/a'
      : 'n/a';

    console.log(`tx ${hash}…  ${time}`);
    console.log(`  IN   from: ${inSrc}`);
    console.log(`       value: ${inVal} nanoTON  bounce: ${bounce}`);
    console.log(`  exitCode: ${exitCode}  aborted: ${aborted}  actionResultCode: ${actionResult}`);

    let outCount = 0;
    for (const [, msg] of tx.outMessages) {
      outCount++;
      const dest = msg?.info?.type === 'internal'
        ? msg.info.dest?.toString({ bounceable: true, urlSafe: true }) ?? 'unknown'
        : 'external';
      const val = msg?.info?.type === 'internal' ? msg.info.value.coins.toString() : '—';
      console.log(`  OUT  to: ${dest}  value: ${val} nanoTON`);
    }
    if (outCount === 0) console.log('  OUT  (none)');
    console.log('');
  }
}

main().catch(e => { console.error('ERROR:', e.message); process.exit(1); });
