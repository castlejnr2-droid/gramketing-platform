import cron from 'node-cron';
import { scrapeAllActivePools, deployPendingContracts } from '../lib/pool-scraper';

// ── Fast deploy loop ──────────────────────────────────────────────────────────
// Checks every 30 seconds for PENDING pools with no contractAddress and deploys
// them.  Separate from the 30-minute scrape cycle so users don't wait 30 minutes
// after creating a pool — typical deployment takes 30-60 seconds on TON.
let deployRunning = false;
setInterval(async () => {
  if (deployRunning) return; // skip if previous deploy is still running
  deployRunning = true;
  try {
    await deployPendingContracts();
  } catch (err) {
    console.error('[deploy-loop] Unhandled error:', err);
  } finally {
    deployRunning = false;
  }
}, 30_000);

// ── Full scrape cycle ─────────────────────────────────────────────────────────
// Runs every 30 minutes: updates metrics, points, referrals, and flips pool
// statuses.  Also calls deployPendingContracts() at the start of each cycle.
cron.schedule('*/30 * * * *', () => {
  scrapeAllActivePools().catch(console.error);
});

console.log('Scraper started — deploy loop every 30 s, full scrape every 30 min');

// Run an immediate full scrape on boot (catches any state from while offline)
if (require.main === module) {
  scrapeAllActivePools().catch(console.error);
}
