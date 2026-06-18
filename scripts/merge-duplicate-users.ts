/**
 * merge-duplicate-users.ts
 *
 * One-time script that finds User rows that represent the same underlying TON
 * wallet (different address format encodings) and merges them into one
 * canonical record.
 *
 * Run as DRY RUN (default — safe to run any time):
 *   npx ts-node -P scripts/tsconfig.json scripts/merge-duplicate-users.ts
 *
 * Run to APPLY changes:
 *   npx ts-node -P scripts/tsconfig.json scripts/merge-duplicate-users.ts --execute
 */

import { PrismaClient } from '@prisma/client';
import { normalizeWalletAddress } from '../lib/ton';

const prisma = new PrismaClient();
const DRY_RUN = !process.argv.includes('--execute');

if (DRY_RUN) {
  console.log('=== DRY RUN — pass --execute to apply changes ===\n');
} else {
  console.log('=== EXECUTE MODE — changes will be written to DB ===\n');
}

// ── helpers ──────────────────────────────────────────────────────────────────

function log(...args: unknown[]) { console.log(...args); }

/** Score a user record: higher = more valuable to keep. */
function score(u: { telegramChatId: string | null; xAccountId: string | null; username: string | null; createdAt: Date }): number {
  return (u.telegramChatId ? 4 : 0)
       + (u.xAccountId     ? 2 : 0)
       + (u.username       ? 1 : 0);
  // ties broken by oldest createdAt (handled in comparator below)
}

// ── main ─────────────────────────────────────────────────────────────────────

async function main() {
  // 1. Load all users and group by normalized address
  const allUsers = await prisma.user.findMany({
    select: {
      id: true, walletAddress: true, username: true,
      telegramChatId: true, xAccountId: true, xHandle: true,
      xAccessToken: true, xProfileImageUrl: true, xUnlinkedAt: true,
      telegramHandle: true, telegramChannelUrl: true, telegramUnlinkedAt: true,
      linkTelegramCode: true, linkTelegramCodeExpiry: true,
      createdAt: true,
    },
  });

  const groups = new Map<string, typeof allUsers>();
  const normalizationErrors: string[] = [];

  for (const u of allUsers) {
    let canonical: string;
    try {
      canonical = normalizeWalletAddress(u.walletAddress);
    } catch {
      normalizationErrors.push(`Cannot parse walletAddress "${u.walletAddress}" for user ${u.id}`);
      continue;
    }
    const g = groups.get(canonical) ?? [];
    g.push(u);
    groups.set(canonical, g);
  }

  if (normalizationErrors.length) {
    console.warn('⚠️  Could not normalize these addresses (skipping):');
    normalizationErrors.forEach((e) => console.warn('   ', e));
  }

  // 2. Filter to only groups that have duplicates
  const duplicateGroups = Array.from(groups.entries()).filter(([, members]) => members.length > 1);

  if (duplicateGroups.length === 0) {
    log('✅ No duplicate users found. Nothing to do.');
    return;
  }

  log(`Found ${duplicateGroups.length} duplicate group(s) across ${duplicateGroups.reduce((s, [, m]) => s + m.length, 0)} user records:\n`);

  let totalMerged = 0;

  for (const [canonical, members] of duplicateGroups) {
    // 3. Pick winner (most social data; tie-break by oldest record)
    const sorted = [...members].sort((a, b) => {
      const diff = score(b) - score(a);
      if (diff !== 0) return diff;
      return a.createdAt.getTime() - b.createdAt.getTime(); // older = preferred
    });
    const winner = sorted[0];
    const losers = sorted.slice(1);

    log(`\nGroup: ${canonical}`);
    log(`  Winner: ${winner.id}  (addr: ${winner.walletAddress}, tg:${winner.telegramChatId ?? '—'}, x:${winner.xAccountId ?? '—'}, name:${winner.username ?? '—'})`);
    for (const l of losers) {
      log(`  Loser:  ${l.id}  (addr: ${l.walletAddress}, tg:${l.telegramChatId ?? '—'}, x:${l.xAccountId ?? '—'}, name:${l.username ?? '—'})`);
    }

    if (DRY_RUN) {
      log('  [DRY RUN] Would merge losers into winner and delete losers.');
      totalMerged += losers.length;
      continue;
    }

    // ── 4. Execute merge inside a transaction ───────────────────────────────
    await prisma.$transaction(async (tx) => {

      // 4a. Copy social fields from losers to winner (only if winner is missing them)
      const socialPatch: Record<string, unknown> = {};
      const bestLoser = losers.find((l) => l.telegramChatId) ?? losers[0];
      if (!winner.telegramChatId && bestLoser.telegramChatId) {
        socialPatch.telegramChatId      = bestLoser.telegramChatId;
        socialPatch.telegramHandle      = bestLoser.telegramHandle ?? winner.telegramHandle;
        socialPatch.telegramChannelUrl  = bestLoser.telegramChannelUrl ?? winner.telegramChannelUrl;
        socialPatch.telegramUnlinkedAt  = bestLoser.telegramUnlinkedAt;
      }
      if (!winner.xAccountId) {
        const xLoser = losers.find((l) => l.xAccountId);
        if (xLoser) {
          socialPatch.xAccountId       = xLoser.xAccountId;
          socialPatch.xHandle          = xLoser.xHandle;
          socialPatch.xAccessToken     = xLoser.xAccessToken;
          socialPatch.xProfileImageUrl = xLoser.xProfileImageUrl;
          socialPatch.xUnlinkedAt      = xLoser.xUnlinkedAt;
        }
      }
      if (!winner.username) {
        const uLoser = losers.find((l) => l.username);
        if (uLoser) socialPatch.username = uLoser.username;
      }
      // Always ensure winner's walletAddress is the canonical form
      socialPatch.walletAddress = canonical;

      if (Object.keys(socialPatch).length > 0) {
        await tx.user.update({ where: { id: winner.id }, data: socialPatch });
        log(`  → Patched winner with: ${Object.keys(socialPatch).join(', ')}`);
      }

      for (const loser of losers) {
        log(`  Merging loser ${loser.id} → winner ${winner.id}`);

        // 4b. PoolParticipant — poolId+userId unique, so handle conflicts
        const loserParticipants = await tx.poolParticipant.findMany({
          where: { userId: loser.id },
          include: { poolPosts: true },
        });

        for (const lp of loserParticipants) {
          const wp = await tx.poolParticipant.findUnique({
            where: { poolId_userId: { poolId: lp.poolId, userId: winner.id } },
          });

          if (!wp) {
            // Winner not in this pool — reassign the loser's participant record
            await tx.poolParticipant.update({
              where: { id: lp.id },
              data: { userId: winner.id },
            });
            // Also fix any referredByUserId in OTHER participants that points to loser
            await tx.poolParticipant.updateMany({
              where: { referredByUserId: loser.id, poolId: lp.poolId },
              data:  { referredByUserId: winner.id },
            });
            log(`    PoolParticipant ${lp.id} (pool ${lp.poolId}): reassigned to winner`);
          } else {
            // Both are in the same pool — merge points into winner's record
            await tx.poolParticipant.update({
              where: { id: wp.id },
              data: {
                totalPoints:         wp.totalPoints         + lp.totalPoints,
                xPoints:             wp.xPoints             + lp.xPoints,
                telegramPoints:      wp.telegramPoints      + lp.telegramPoints,
                referralBonusPoints: wp.referralBonusPoints + lp.referralBonusPoints,
                // take the better multiplier / boost
                referralMultiplier:  Math.max(wp.referralMultiplier, lp.referralMultiplier),
                holderBoost:         Math.max(wp.holderBoost,         lp.holderBoost),
              },
            });
            log(`    PoolParticipant ${lp.id} (pool ${lp.poolId}): merged points into winner's ${wp.id}`);

            // Move PoolPosts — skip if winner's participant already has one with the same postLink
            for (const post of lp.poolPosts) {
              const existingPost = await tx.poolPost.findUnique({
                where: { poolId_postLink: { poolId: post.poolId, postLink: post.postLink } },
              });
              if (!existingPost || existingPost.participantId === wp.id) {
                // Safe to reassign (existingPost is the loser's own post or doesn't exist)
                await tx.poolPost.update({
                  where: { id: post.id },
                  data:  { participantId: wp.id },
                }).catch(() => {});
              } else {
                // Collision: winner already has this postLink — delete the loser's copy
                await tx.poolPost.delete({ where: { id: post.id } });
                log(`      PoolPost ${post.id} (${post.postLink}): deleted (winner already has this post)`);
              }
            }

            // Fix referredByUserId before deleting loser's participant
            await tx.poolParticipant.updateMany({
              where: { referredByUserId: loser.id, poolId: lp.poolId },
              data:  { referredByUserId: winner.id },
            });

            // Now safe to delete loser's participant
            await tx.poolParticipant.delete({ where: { id: lp.id } });
          }
        }

        // 4c. Submissions — unique on (poolId, userId, platform, submittedDate)
        const loserSubs = await tx.submission.findMany({ where: { userId: loser.id } });
        for (const sub of loserSubs) {
          const conflict = await tx.submission.findFirst({
            where: { poolId: sub.poolId, userId: winner.id, platform: sub.platform, submittedDate: sub.submittedDate },
          });
          if (conflict) {
            await tx.submission.delete({ where: { id: sub.id } });
            log(`    Submission ${sub.id}: deleted (winner has duplicate)`);
          } else {
            await tx.submission.update({ where: { id: sub.id }, data: { userId: winner.id } });
          }
        }

        // 4d. ReferralBoost — update referrerId and referredUserId
        await tx.referralBoost.updateMany({
          where: { referrerId: loser.id },
          data:  { referrerId: winner.id },
        });
        await tx.referralBoost.updateMany({
          where: { referredUserId: loser.id },
          data:  { referredUserId: winner.id },
        });
        // Remove any self-referrals created by the merge (referrerId == referredUserId)
        await tx.referralBoost.deleteMany({
          where: { referrerId: winner.id, referredUserId: winner.id },
        });
        // Remove duplicates: same (referrerId, referredUserId, poolId) after merge
        // We do this by keeping the one with the largest referredHolding
        const allBoosts = await tx.referralBoost.findMany({
          where: { referrerId: winner.id },
          orderBy: { referredHolding: 'desc' },
        });
        const seenKeys = new Set<string>();
        for (const boost of allBoosts) {
          const key = `${boost.referredUserId}:${boost.poolId}`;
          if (seenKeys.has(key)) {
            await tx.referralBoost.delete({ where: { id: boost.id } });
            log(`    ReferralBoost ${boost.id}: deleted duplicate`);
          } else {
            seenKeys.add(key);
          }
        }

        // 4e. TelegramNotificationPrefs
        const loserPrefs = await tx.telegramNotificationPrefs.findUnique({ where: { userId: loser.id } });
        if (loserPrefs) {
          const winnerPrefs = await tx.telegramNotificationPrefs.findUnique({ where: { userId: winner.id } });
          if (!winnerPrefs) {
            await tx.telegramNotificationPrefs.update({
              where: { id: loserPrefs.id },
              data:  { userId: winner.id, telegramChatId: (socialPatch.telegramChatId as string | undefined) ?? winner.telegramChatId ?? loserPrefs.telegramChatId },
            });
            log(`    TelegramNotificationPrefs: transferred to winner`);
          } else {
            await tx.telegramNotificationPrefs.delete({ where: { id: loserPrefs.id } });
            log(`    TelegramNotificationPrefs: deleted loser's (winner already has prefs)`);
          }
        }

        // 4f. Delete loser user (all FK children now point to winner or are deleted)
        await tx.user.delete({ where: { id: loser.id } });
        log(`  ✅ Deleted loser user ${loser.id} (walletAddress: ${loser.walletAddress})`);
        totalMerged++;
      }
    });
  }

  if (DRY_RUN) {
    log(`\n[DRY RUN] Would have merged/deleted ${totalMerged} duplicate user record(s).`);
    log('Run with --execute to apply.\n');
  } else {
    log(`\n✅ Done. Merged and deleted ${totalMerged} duplicate user record(s).\n`);
  }
}

main()
  .catch((err) => { console.error(err); process.exit(1); })
  .finally(() => prisma.$disconnect());
