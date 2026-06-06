/**
 * Quick smoke test for fetchTweetMetrics.
 *
 * Run:
 *   npx ts-node -r tsconfig-paths/register --project scripts/tsconfig.json scripts/test-twitter-api.ts
 *
 * Requires TWITTER_BEARER_TOKEN to be set in .env (it's empty locally - copy
 * it from Vercel dashboard → Settings → Environment Variables).
 */

import * as dotenv from 'dotenv';
import * as path from 'path';
// Load plain .env (has DATABASE_URL); dotenvx may encrypt .env.local so skip it
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const bearer = process.env.TWITTER_BEARER_TOKEN;
if (!bearer) {
  console.error('ERROR: TWITTER_BEARER_TOKEN is not set in .env');
  console.error('Copy it from: Vercel dashboard → gramketing-platform → Settings → Environment Variables');
  process.exit(1);
}

import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

// Wire our local prisma instance into the lib module singleton
// eslint-disable-next-line @typescript-eslint/no-require-imports
const prismaMod = require('../lib/prisma');
prismaMod.prisma = prisma;

import { fetchTweetMetrics } from '../lib/twitter-api';

const TEST_IDS = [
  '20',                        // Jack Dorsey - first ever tweet: "just setting up my twttr"
  '1585841080431321088',       // Elon Musk - "the bird is freed" (Twitter acquisition close)
  '1519480761749016577',       // Elon Musk - Twitter acquisition offer announcement
];

async function main() {
  console.log(`Fetching metrics for ${TEST_IDS.length} tweets...\n`);

  const results = await fetchTweetMetrics(TEST_IDS);

  for (const r of results) {
    if (r.ok) {
      console.log(`Tweet ${r.tweetId}${r.fromCache ? ' [cached]' : ' [fresh]'}:`);
      console.log(`  views    : ${r.views.toLocaleString()}`);
      console.log(`  likes    : ${r.likes.toLocaleString()}`);
      console.log(`  retweets : ${r.retweets.toLocaleString()}`);
    } else {
      console.log(`Tweet ${r.tweetId}: ERROR - ${(r as { error: string }).error}`);
    }
    console.log();
  }

  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error('Fatal:', err);
  await prisma.$disconnect();
  process.exit(1);
});
