/**
 * Centralised admin event logger.
 * Writes to the AdminLog DB table so failures are visible in the admin panel.
 * All writes are wrapped in try-catch — logging must never crash the caller.
 */

import { prisma } from './prisma';
import { Prisma } from '@prisma/client';

export type AdminLogLevel = 'info' | 'warn' | 'error';

export type AdminLogAction =
  | 'DEPLOY_CONTRACT'
  | 'DISTRIBUTE_REWARDS'
  | 'END_POOL'
  | 'CANCEL_POOL'
  | 'RESCRAPE'
  | 'FEE_RECORDED'
  | 'SCRAPE_ERROR'
  | 'SCRAPE_CYCLE';

export async function logAdminEvent(opts: {
  action: AdminLogAction;
  level: AdminLogLevel;
  poolId?: string | null;
  message: string;
  details?: Record<string, unknown>;
}): Promise<void> {
  try {
    await prisma.adminLog.create({
      data: {
        action: opts.action,
        level: opts.level,
        poolId: opts.poolId ?? null,
        message: opts.message,
        details: opts.details ? (opts.details as Prisma.InputJsonValue) : Prisma.DbNull,
      },
    });
  } catch (err) {
    // Never propagate — logging must not break callers
    console.error('[AdminLog write failed]', err);
  }
}
