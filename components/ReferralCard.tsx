'use client';
import { useState } from 'react';
import { Copy, CheckCheck, Users, Zap } from 'lucide-react';
import {
  REFERRAL_TIER_1_THRESHOLD,
  REFERRAL_TIER_2_THRESHOLD,
  REFERRAL_TIER_3_THRESHOLD,
  REFERRAL_TIER_1_MULTIPLIER,
  REFERRAL_TIER_2_MULTIPLIER,
  REFERRAL_TIER_3_MULTIPLIER,
  REFERRAL_BASE_BONUS,
} from '@/lib/points';

interface ReferralCardProps {
  poolId: string;
  referralCode: string;
  successfulReferrals: number;
  bonusPointsEarned: number;
}

export function ReferralCard({
  poolId,
  referralCode,
  successfulReferrals,
  bonusPointsEarned,
}: ReferralCardProps) {
  const [copied, setCopied] = useState(false);

  const referralLink = `https://gramketing.io/pools/${poolId}?ref=${referralCode}`;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(referralLink);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback
      const input = document.createElement('input');
      input.value = referralLink;
      document.body.appendChild(input);
      input.select();
      document.execCommand('copy');
      document.body.removeChild(input);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const tiers = [
    {
      tier: 'Tier 1',
      threshold: `≥ ${Number(REFERRAL_TIER_1_THRESHOLD).toLocaleString()} tokens`,
      multiplier: `${REFERRAL_TIER_1_MULTIPLIER}x`,
      color: 'text-blue-300',
      bgColor: 'bg-blue-500/10 border-blue-500/20',
    },
    {
      tier: 'Tier 2',
      threshold: `≥ ${Number(REFERRAL_TIER_2_THRESHOLD).toLocaleString()} tokens`,
      multiplier: `${REFERRAL_TIER_2_MULTIPLIER}x`,
      color: 'text-purple-300',
      bgColor: 'bg-purple-500/10 border-purple-500/20',
    },
    {
      tier: 'Tier 3',
      threshold: `≥ ${Number(REFERRAL_TIER_3_THRESHOLD).toLocaleString()} tokens`,
      multiplier: `${REFERRAL_TIER_3_MULTIPLIER}x`,
      color: 'text-yellow-300',
      bgColor: 'bg-yellow-500/10 border-yellow-500/20',
    },
  ];

  return (
    <div className="glass-card p-6 space-y-6">
      <div className="flex items-center gap-2">
        <Users className="w-5 h-5 text-[#0088CC]" />
        <h3 className="font-semibold text-white">Referral Program</h3>
      </div>

      {/* Referral link */}
      <div>
        <label className="block text-xs text-white/50 mb-2 uppercase tracking-wider">
          Your Referral Link
        </label>
        <div className="flex items-center gap-2">
          <div className="flex-1 bg-white/[0.04] border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white/60 truncate font-mono">
            {referralLink}
          </div>
          <button
            onClick={handleCopy}
            className={`flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 flex-shrink-0 ${
              copied
                ? 'bg-green-500/20 text-green-400 border border-green-500/30'
                : 'btn-secondary'
            }`}
          >
            {copied ? (
              <>
                <CheckCheck className="w-3.5 h-3.5" />
                Copied!
              </>
            ) : (
              <>
                <Copy className="w-3.5 h-3.5" />
                Copy
              </>
            )}
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-white/[0.03] border border-white/5 rounded-xl p-4 text-center">
          <p className="text-2xl font-bold text-[#0088CC]">
            {successfulReferrals}
          </p>
          <p className="text-xs text-white/40 mt-1">Successful Referrals</p>
        </div>
        <div className="bg-white/[0.03] border border-white/5 rounded-xl p-4 text-center">
          <p className="text-2xl font-bold text-purple-400">
            +{bonusPointsEarned.toLocaleString(undefined, {
              maximumFractionDigits: 0,
            })}
          </p>
          <p className="text-xs text-white/40 mt-1">Bonus Points Earned</p>
        </div>
      </div>

      {/* Tier table */}
      <div>
        <p className="text-xs text-white/50 uppercase tracking-wider mb-3">
          Referral Boost Tiers
        </p>
        <div className="space-y-2">
          {tiers.map((t) => (
            <div
              key={t.tier}
              className={`flex items-center justify-between px-4 py-2.5 rounded-xl border ${t.bgColor}`}
            >
              <div>
                <span className={`text-sm font-medium ${t.color}`}>
                  {t.tier}
                </span>
                <p className="text-xs text-white/30 mt-0.5">{t.threshold}</p>
              </div>
              <span className={`text-lg font-bold ${t.color}`}>
                {t.multiplier}
              </span>
            </div>
          ))}
        </div>
        <p className="text-xs text-white/30 mt-2 italic">
          Multipliers stack additively for multiple referrals.
        </p>
      </div>

      {/* How it works */}
      <div className="p-4 rounded-xl bg-[#0088CC]/5 border border-[#0088CC]/15">
        <div className="flex items-start gap-2">
          <Zap className="w-4 h-4 text-[#0088CC] mt-0.5 flex-shrink-0" />
          <div>
            <p className="text-sm font-medium text-white/80 mb-2">
              How it works
            </p>
            <ul className="text-xs text-white/50 space-y-1.5">
              <li>
                1. Share your unique link with friends
              </li>
              <li>
                2. Friend connects their TON wallet
              </li>
              <li>
                3. If they hold the pool&apos;s project token, you earn{' '}
                <span className="text-[#0088CC] font-semibold">
                  +{REFERRAL_BASE_BONUS} bonus points
                </span>
              </li>
              <li>
                4. Their token holding tier determines your ongoing{' '}
                <span className="text-purple-400 font-semibold">
                  point multiplier
                </span>
              </li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
