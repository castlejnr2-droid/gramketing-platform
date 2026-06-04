// ── Per-post scoring ──────────────────────────────────────────────────────

// Minimum views to qualify for X post points
export const X_MINIMUM_VIEWS = 100;

// Bonus points when a referred friend holds the project token
export const REFERRAL_BASE_BONUS = 500;

// X/Twitter: Views 80%, Likes 10%, Reposts 10%
export function calculateXPoints(views: number, likes: number, reposts: number): number {
  if (views < X_MINIMUM_VIEWS) return 0;
  return (views * 0.8 + likes * 0.1 + reposts * 0.1) / 10;
}

// Telegram: Views 80%, Reactions 20%
export function calculateTelegramPoints(views: number, reactions: number): number {
  return (views * 0.8 + reactions * 0.2) * 2;
}

// ── Total score ───────────────────────────────────────────────────────────

export type CampaignType = 'both' | 'x' | 'telegram';

export interface PointsInput {
  xPoints: number;
  telegramPoints: number;
  // holderBoost: 1.0–2.0, proportional to top token holder in pool
  holderBoost: number;
  // referralMultiplier: 1.0–2.0, proportional to top referrer's total referred holdings
  referralMultiplier: number;
  referralBonusPoints: number;
  campaignType?: CampaignType; // defaults to 'both'
}

export function calculateTotalPoints(input: PointsInput): number {
  const {
    xPoints,
    telegramPoints,
    holderBoost,
    referralMultiplier,
    referralBonusPoints,
    campaignType = 'both',
  } = input;

  let contentScore: number;
  if (campaignType === 'x') {
    contentScore = xPoints;
  } else if (campaignType === 'telegram') {
    contentScore = telegramPoints;
  } else {
    // Both platforms: X 50%, Telegram 50%
    contentScore = xPoints * 0.5 + telegramPoints * 0.5;
  }

  return contentScore * holderBoost * referralMultiplier + referralBonusPoints;
}

// ── Participant tiers ─────────────────────────────────────────────────────
export type ParticipantTier = 'Contributor' | 'Promoter' | 'Marketer';

export const PROMOTER_THRESHOLD = 500;
export const MARKETER_THRESHOLD = 5000;

export interface TierInfo {
  tier: ParticipantTier;
  label: string;
  color: string;
  bg: string;
  border: string;
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
