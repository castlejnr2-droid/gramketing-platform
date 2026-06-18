import { Address } from '@ton/core';

/**
 * Canonical TON address format used everywhere in this codebase:
 *   bounceable=true, urlSafe=true, testOnly=false  →  "EQD..." with dashes
 *
 * This must be the ONLY format stored in User.walletAddress, JWTs,
 * and any other address field that is later compared with a DB value.
 */
export function normalizeWalletAddress(addr: string): string {
  return Address.parse(addr).toString({ bounceable: true, urlSafe: true, testOnly: false });
}

/**
 * Returns every known string encoding of the same underlying address.
 * Use this when searching the DB for users whose address may have been
 * stored in a legacy format (urlSafe=false, non-bounceable, raw 0:hash…).
 */
export function walletAddressVariants(addr: string): string[] {
  const p = Address.parse(addr);
  return Array.from(new Set([
    p.toString({ urlSafe: true,  bounceable: true  }),
    p.toString({ urlSafe: false, bounceable: true  }),
    p.toString({ urlSafe: true,  bounceable: false }),
    p.toString({ urlSafe: false, bounceable: false }),
    p.toRawString(),
  ]));
}
