'use client';
import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { PointsBreakdownCard } from '@/components/PointsBreakdownCard';
import { ArrowLeft, ExternalLink, Calendar, Trophy } from 'lucide-react';
import { getParticipantTier } from '@/lib/points';

interface MarketerData {
  userId: string;
  walletAddress: string;
  xHandle?: string;
  telegramHandle?: string;
  joinedAt: string;
  totalPoints: number;
  xPoints: number;
  telegramPoints: number;
  referralBonusPoints: number;
  referralMultiplier: number;
  holderBoost: number;
  rank: number;
  totalParticipants: number;
  referralCount: number;
}

interface Submission {
  id: string;
  platform: 'X' | 'TELEGRAM';
  postUrl: string;
  currentViews: number;
  currentPoints: number;
  status: string;
  submittedAt: string;
  lastScrapedAt?: string;
}

interface PoolInfo {
  id: string;
  project: { name: string };
  tokenSymbol: string;
  totalReward: string;
  status: string;
}

function truncateWallet(addr: string): string {
  if (addr.length <= 14) return addr;
  return `${addr.slice(0, 8)}...${addr.slice(-6)}`;
}

function TierBadge({ totalPoints }: { totalPoints: number }) {
  const { label, color, bg, border } = getParticipantTier(totalPoints);
  return (
    <span className={`inline-flex items-center text-xs font-bold px-2 py-0.5 rounded-full border ${color} ${bg} ${border}`}>
      {label}
    </span>
  );
}

export default function MarketerStatsPage() {
  const params = useParams();
  const router = useRouter();
  const poolId = params.poolId as string;
  const userId = params.userId as string;

  const [marketer, setMarketer] = useState<MarketerData | null>(null);
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [pool, setPool] = useState<PoolInfo | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      fetch(`/api/pools/${poolId}/leaderboard`).then((r) => r.json()),
      fetch(`/api/pools/${poolId}`).then((r) => r.json()),
    ])
      .then(([lbData, poolData]) => {
        setPool(poolData.pool);
        const entry = (lbData.leaderboard ?? []).find(
          (e: MarketerData) => e.userId === userId
        );
        setMarketer(entry ?? null);

        // Fetch submissions for this user/pool (admin-level or public view)
        return fetch(`/api/submissions/${poolId}?userId=${userId}`);
      })
      .then((r) => r.json())
      .then((d) => setSubmissions(d.submissions ?? []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [poolId, userId]);

  if (loading) {
    return (
      <div className="min-h-screen pt-24 px-4 flex items-center justify-center">
        <div className="glass-card p-8 text-white/40">Loading...</div>
      </div>
    );
  }

  if (!marketer || !pool) {
    return (
      <div className="min-h-screen pt-24 px-4 text-center">
        <div className="glass-card inline-block p-10 text-white/40">
          Marketer not found.
        </div>
      </div>
    );
  }

  const totalAllPoints =
    marketer.totalPoints > 0
      ? marketer.totalPoints / (marketer.totalPoints / marketer.totalPoints)
      : 1;

  const sharePercent =
    marketer.totalPoints > 0 ? 100 : 0;

  return (
    <div className="min-h-screen pt-24 pb-20 px-4">
      <div className="max-w-4xl mx-auto">
        {/* Back */}
        <Link
          href={`/pools/${poolId}`}
          className="flex items-center gap-2 text-white/40 hover:text-white transition-colors text-sm mb-8"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Pool Leaderboard
        </Link>

        {/* Profile header */}
        <div className="glass-card p-7 mb-6">
          <div className="flex items-start gap-5">
            {/* Avatar */}
            <div className="w-16 h-16 rounded-full bg-[#0088CC]/20 border border-[#0088CC]/30 flex items-center justify-center text-[#0088CC] text-xl font-bold flex-shrink-0">
              {(marketer.xHandle ?? marketer.walletAddress)
                .slice(0, 2)
                .toUpperCase()}
            </div>

            <div className="flex-1">
              <div className="flex items-center gap-3 flex-wrap mb-2">
                {marketer.xHandle && (
                  <h1 className="text-2xl font-bold text-white">
                    @{marketer.xHandle}
                  </h1>
                )}
                <span className="text-sm font-mono text-white/40">
                  {truncateWallet(marketer.walletAddress)}
                </span>
                <a
                  href={`https://tonscan.org/address/${marketer.walletAddress}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-white/30 hover:text-[#0088CC] transition-colors"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>
              </div>
              <div className="flex items-center gap-3 mb-2 flex-wrap">
                <TierBadge totalPoints={marketer.totalPoints} />
              </div>
              <div className="flex items-center gap-4 text-sm text-white/40 flex-wrap">
                <span className="flex items-center gap-1.5">
                  <Calendar className="w-3.5 h-3.5" />
                  Joined{' '}
                  {new Date(marketer.joinedAt).toLocaleDateString('en-US', {
                    month: 'short',
                    day: 'numeric',
                    year: 'numeric',
                  })}
                </span>
                <span className="flex items-center gap-1.5">
                  <Trophy className="w-3.5 h-3.5 text-[#0088CC]" />
                  Rank #{marketer.rank} of {marketer.totalParticipants}
                </span>
              </div>
            </div>

            {/* Points summary */}
            <div className="text-right">
              <p className="text-3xl font-bold text-[#0088CC]">
                {marketer.totalPoints.toLocaleString(undefined, {
                  maximumFractionDigits: 0,
                })}
              </p>
              <p className="text-xs text-white/40 mt-1">total points</p>
            </div>
          </div>
        </div>

        {/* Points breakdown */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
          <PointsBreakdownCard
            xPoints={marketer.xPoints}
            telegramPoints={marketer.telegramPoints}
            referralBonusPoints={marketer.referralBonusPoints}
            holderBoost={marketer.holderBoost}
            referralMultiplier={marketer.referralMultiplier}
            totalPoints={marketer.totalPoints}
          />

          {/* Pool context */}
          <div className="glass-card p-6 space-y-4">
            <h3 className="font-semibold text-white">Pool Context</h3>
            <div className="space-y-3">
              <div className="flex justify-between text-sm">
                <span className="text-white/50">Pool</span>
                <Link
                  href={`/pools/${poolId}`}
                  className="text-[#0088CC] hover:text-[#00AAFF]"
                >
                  {pool.project.name}
                </Link>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-white/50">Token</span>
                <span className="text-white">${pool.tokenSymbol}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-white/50">Total Reward</span>
                <span className="text-white">
                  {pool.totalReward} {pool.tokenSymbol}
                </span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-white/50">Status</span>
                <span
                  className={
                    pool.status === 'ACTIVE'
                      ? 'text-green-400'
                      : 'text-white/40'
                  }
                >
                  {pool.status}
                </span>
              </div>
              <div className="border-t border-white/10 pt-3 flex justify-between text-sm">
                <span className="text-white/50">Rank</span>
                <span className="font-bold text-[#0088CC]">
                  #{marketer.rank}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Submissions */}
        {submissions.length > 0 && (
          <div className="glass-card p-6 mb-6">
            <h3 className="font-semibold text-white mb-5">Submitted Posts</h3>
            <div className="space-y-3">
              {submissions.map((sub) => (
                <div
                  key={sub.id}
                  className="flex items-center justify-between p-4 rounded-xl bg-white/[0.03] border border-white/5"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-[#0088CC]/20 text-[#0088CC] flex-shrink-0">
                      {sub.platform}
                    </span>
                    <a
                      href={sub.postUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm text-white/60 hover:text-white truncate transition-colors"
                    >
                      {sub.postUrl}
                    </a>
                  </div>
                  <div className="text-right flex-shrink-0 ml-4">
                    <p className="text-sm font-semibold text-[#0088CC]">
                      {sub.currentPoints.toFixed(0)} pts
                    </p>
                    <p className="text-xs text-white/30">
                      {sub.currentViews.toLocaleString()} views
                    </p>
                    {sub.lastScrapedAt && (
                      <p className="text-xs text-white/20 mt-0.5">
                        Updated{' '}
                        {new Date(sub.lastScrapedAt).toLocaleTimeString()}
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Referral stats */}
        <div className="glass-card p-6">
          <h3 className="font-semibold text-white mb-4">Referral Stats</h3>
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-white/[0.03] rounded-xl p-4 text-center border border-white/5">
              <p className="text-2xl font-bold text-purple-400">
                {marketer.referralCount}
              </p>
              <p className="text-xs text-white/40 mt-1">Referrals</p>
            </div>
            <div className="bg-white/[0.03] rounded-xl p-4 text-center border border-white/5">
              <p className="text-2xl font-bold text-[#0088CC]">
                {marketer.referralMultiplier.toFixed(2)}x
              </p>
              <p className="text-xs text-white/40 mt-1">Active Multiplier</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
