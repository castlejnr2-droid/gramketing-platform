import cron from 'node-cron';
import { scrapeAllActivePools } from '../lib/pool-scraper';

// Run on schedule every 30 minutes
cron.schedule('*/30 * * * *', () => {
  scrapeAllActivePools().catch(console.error);
});

console.log('Scraper started - running every 30 minutes');

if (require.main === module) {
  scrapeAllActivePools().catch(console.error);
}
