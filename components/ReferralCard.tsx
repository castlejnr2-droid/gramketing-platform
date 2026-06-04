'use client';
import { useState } from 'react';
import { Copy, CheckCheck, Users, Zap } from 'lucide-react';
import { REFERRAL_BASE_BONUS } from '@/lib/points';

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
          <div className="glass-inner flex-1 px-4 py-2.5 text-sm text-white/60 truncate font-mono">
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
          <p className="text-2xl font-bold text-[#0088CC]">{successfulReferrals}</p>
          <p className="text-xs text-white/40 mt-1">Successful Referrals</p>
        </div>
        <div className="bg-white/[0.03] border border-white/5 rounded-xl p-4 text-center">
          <p className="text-2xl font-bold text-purple-400">
            +{bonusPointsEarned.toLocaleString(undefined, { maximumFractionDigits: 0 })}
          </p>
          <p className="text-xs text-white/40 mt-1">Bonus Points Earned</p>
        </div>
      </div>

      {/* Referral Boost info */}
      <div className="p-4 rounded-xl bg-purple-500/5 border border-purple-500/15 space-y-2">
        <p className="text-xs font-semibold text-white/50 uppercase tracking-wider mb-3">
          Proportional Referral Boost
        </p>
        <div className="flex items-center justify-between text-sm">
          <span className="text-white/60">Range</span>
          <span className="font-semibold text-purple-300">1.0x – 2.0x</span>
        </div>
        <div className="flex items-center justify-between text-sm">
          <span className="text-white/60">Calculation</span>
          <span className="text-white/50 text-xs">Your referrals' holdings vs. pool max</span>
        </div>
        <p className="text-xs text-white/30 mt-1">
          Earn more by referring users who hold larger amounts of the project token. Your boost is recalculated each scrape cycle relative to the top referrer in the pool.
        </p>
      </div>

      {/* How it works */}
      <div className="p-4 rounded-xl bg-[#0088CC]/5 border border-[#0088CC]/15">
        <div className="flex items-start gap-2">
          <Zap className="w-4 h-4 text-[#0088CC] mt-0.5 flex-shrink-0" />
          <div>
            <p className="text-sm font-medium text-white/80 mb-2">How it works</p>
            <ul className="text-xs text-white/50 space-y-1.5">
              <li>1. Share your unique link with friends</li>
              <li>2. Friend connects their TON wallet</li>
              <li>
                3. If they hold the pool&apos;s project token, you earn{' '}
                <span className="text-[#0088CC] font-semibold">+{REFERRAL_BASE_BONUS} bonus points</span>
              </li>
              <li>
                4. Their total token holdings boost your{' '}
                <span className="text-purple-400 font-semibold">referral multiplier</span> proportionally
              </li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
