// Holder boost multiplier when marketer holds the pool's project token
export const HOLDER_BOOST = 1.5;

// Referral holding tier thresholds (in raw token units — easily configurable)
export const REFERRAL_TIER_1_THRESHOLD = 1_000n;   // small holding
export const REFERRAL_TIER_2_THRESHOLD = 10_000n;  // medium holding
export const REFERRAL_TIER_3_THRESHOLD = 100_000n; // large holding

// Referral multipliers
export const REFERRAL_TIER_1_MULTIPLIER = 1.2;
export const REFERRAL_TIER_2_MULTIPLIER = 1.5;
export const REFERRAL_TIER_3_MULTIPLIER = 2.0;

// Bonus points when a referred friend connects wallet AND holds project token
export const REFERRAL_BASE_BONUS = 500;

// Minimum views to qualify for X post points
export const X_MINIMUM_VIEWS = 100;

export function calculateXPoints(views: number, holdsToken: boolean): number {
  if (views < X_MINIMUM_VIEWS) return 0;
  const base = Math.floor(views / 10);
  return holdsToken ? base * HOLDER_BOOST : base;
}

export function calculateTelegramPoints(views: number, holdsToken: boolean): number {
  const base = views * 2;
  return holdsToken ? base * HOLDER_BOOST : base;
}

export function getReferralTierMultiplier(holding: bigint): number {
  if (holding >= REFERRAL_TIER_3_THRESHOLD) return REFERRAL_TIER_3_MULTIPLIER;
  if (holding >= REFERRAL_TIER_2_THRESHOLD) return REFERRAL_TIER_2_MULTIPLIER;
  if (holding >= REFERRAL_TIER_1_THRESHOLD) return REFERRAL_TIER_1_MULTIPLIER;
  return 1.0;
}

// Multiple referrals stack ADDITIVELY
export function calculateReferralMultiplier(
  referralBoosts: Array<{ boostMultiplier: number }>
): number {
  if (referralBoosts.length === 0) return 1.0;
  // Stack additively: each boost adds its bonus above 1.0
  const additiveBonus = referralBoosts.reduce(
    (sum, r) => sum + (r.boostMultiplier - 1.0),
    0
  );
  return 1.0 + additiveBonus;
}

export interface PointsInput {
  xPoints: number;
  telegramPoints: number;
  holderBoost: number;        // 1.0 or 1.5
  referralMultiplier: number;
  referralBonusPoints: number;
}

export function calculateTotalPoints(input: PointsInput): number {
  const { xPoints, telegramPoints, holderBoost, referralMultiplier, referralBonusPoints } =
    input;
  return (xPoints + telegramPoints) * holderBoost * referralMultiplier + referralBonusPoints;
}

// ── Participant tiers ─────────────────────────────────────────────────────
export type ParticipantTier = 'Contributor' | 'Promoter' | 'Marketer';

export const PROMOTER_THRESHOLD = 500;
export const MARKETER_THRESHOLD = 5000;

export interface TierInfo {
  tier: ParticipantTier;
  label: string;
  color: string;       // Tailwind text colour
  bg: string;          // Tailwind bg colour
  border: string;      // Tailwind border colour
  next?: { tier: ParticipantTier; pointsNeeded: number };
}

export function getParticipantTier(totalPoints: number): TierInfo {
  if (totalPoints >= MARKETER_THRESHOLD) {
    return {
      tier: 'Marketer',
      label: 'Marketer',
      color: 'text-yellow-400',
      bg: 'bg-yellow-400/10',
      border: 'border-yellow-400/30',
    };
  }
  if (totalPoints >= PROMOTER_THRESHOLD) {
    return {
      tier: 'Promoter',
      label: 'Promoter',
      color: 'text-[#0088CC]',
      bg: 'bg-[#0088CC]/10',
      border: 'border-[#0088CC]/30',
      next: { tier: 'Marketer', pointsNeeded: MARKETER_THRESHOLD - totalPoints },
    };
  }
  return {
    tier: 'Contributor',
    label: 'Contributor',
    color: 'text-white/50',
    bg: 'bg-white/5',
    border: 'border-white/10',
    next: { tier: 'Promoter', pointsNeeded: PROMOTER_THRESHOLD - totalPoints },
  };
}
