'use client';
import { useEffect, useState, useCallback } from 'react';
import { useParams, useSearchParams, useRouter } from 'next/navigation';
import { useTonWallet, useTonConnectUI } from '@tonconnect/ui-react';
import * as Tabs from '@radix-ui/react-tabs';
import { Leaderboard } from '@/components/Leaderboard';
import { SubmitPostModal } from '@/components/SubmitPostModal';
import { ReferralCard } from '@/components/ReferralCard';
import { PointsBreakdownCard } from '@/components/PointsBreakdownCard';
import {
  Users,
  Trophy,
  Clock,
  ArrowLeft,
  ExternalLink,
  Plus,
} from 'lucide-react';

interface PoolData {
  id: string;
  status: 'ACTIVE' | 'ENDED' | 'DISTRIBUTED';
  tokenSymbol: string;
  totalReward: string;
  durationDays: number;
  startDate: string;
  endDate: string;
  rewardSlots: number;
  jettonMasterAddress: string;
  contractAddress?: string;
  project: {
    id: string;
    name: string;
    logoUrl?: string;
    description?: string;
    tokenSymbol: string;
  };
  _count: { participants: number };
}

interface LeaderboardEntry {
  rank: number;
  userId: string;
  walletAddress: string;
  username?: string | null;
  xHandle?: string | null;
  telegramHandle?: string | null;
  totalPoints: number;
  xPoints: number;
  telegramPoints: number;
  referralBonusPoints: number;
  referralMultiplier: number;
  holderBoost: number;
  totalParticipants: number;
}

interface MyStats {
  totalPoints: number;
  xPoints: number;
  telegramPoints: number;
  referralBonusPoints: number;
  referralMultiplier: number;
  holderBoost: number;
  referralCode: string;
  successfulReferrals: number;
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

function formatCountdown(endDate: string): string {
  const ms = new Date(endDate).getTime() - Date.now();
  if (ms <= 0) return 'Ended';
  const d = Math.floor(ms / 86_400_000);
  const h = Math.floor((ms % 86_400_000) / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  if (d > 0) return `${d}d ${h}h ${m}m`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

export default function PoolDetailPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const router = useRouter();
  const wallet = useTonWallet();
  const poolId = params.id as string;
  const refCode = searchParams.get('ref');

  const [pool, setPool] = useState<PoolData | null>(null);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [myStats, setMyStats] = useState<MyStats | null>(null);
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [loading, setLoading] = useState(true);
  const [joined, setJoined] = useState(false);
  const [joiningPool, setJoiningPool] = useState(false);
  const [submitOpen, setSubmitOpen] = useState(false);
  const [todaySubmissions, setTodaySubmissions] = useState(0);
  const [countdown, setCountdown] = useState('');

  const fetchPool = useCallback(async () => {
    try {
      const res = await fetch(`/api/pools/${poolId}`);
      const data = await res.json();
      setPool(data.pool);
    } catch {
      // ignore
    }
  }, [poolId]);

  const fetchLeaderboard = useCallback(async () => {
    try {
      const res = await fetch(`/api/pools/${poolId}/leaderboard`);
      const data = await res.json();
      setLeaderboard(data.leaderboard ?? []);
    } catch {
      // ignore
    }
  }, [poolId]);

  const fetchMyStats = useCallback(async () => {
    if (!wallet) return;
    try {
      const res = await fetch(`/api/submissions/${poolId}`, {
        credentials: 'include',
      });
      const data = await res.json();
      setSubmissions(data.submissions ?? []);
      setMyStats(data.myStats ?? null);
      setJoined(!!data.myStats);

      const today = new Date().toISOString().split('T')[0];
      const todaySubs = (data.submissions ?? []).filter(
        (s: Submission) => s.submittedAt.startsWith(today)
      ).length;
      setTodaySubmissions(todaySubs);
    } catch {
      // ignore
    }
  }, [poolId, wallet]);

  useEffect(() => {
    Promise.all([fetchPool(), fetchLeaderboard()])
      .finally(() => setLoading(false));
  }, [fetchPool, fetchLeaderboard]);

  useEffect(() => {
    fetchMyStats();
  }, [fetchMyStats]);

  // Track referral on wallet connect
  useEffect(() => {
    if (wallet && refCode) {
      fetch('/api/referral/track', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ referralCode: refCode, poolId }),
      }).catch(() => {});
    }
  }, [wallet, refCode, poolId]);

  // Countdown timer
  useEffect(() => {
    if (!pool || pool.status !== 'ACTIVE') return;
    const tick = () => setCountdown(formatCountdown(pool.endDate));
    tick();
    const id = setInterval(tick, 30_000);
    return () => clearInterval(id);
  }, [pool]);

  const handleJoin = async () => {
    if (!wallet) return;
    setJoiningPool(true);
    try {
      const res = await fetch(`/api/pools/${poolId}/join`, {
        method: 'POST',
        credentials: 'include',
      });
      if (res.ok) {
        setJoined(true);
        fetchMyStats();
      }
    } catch {
      // ignore
    } finally {
      setJoiningPool(false);
    }
  };

  if (loading || !pool) {
    return (
      <div className="min-h-screen pt-24 px-4 flex items-center justify-center">
        <div className="glass-card p-8 text-white/40">Loading pool...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen pt-24 pb-20 px-4">
      <div className="max-w-6xl mx-auto">
        {/* Back */}
        <button
          onClick={() => router.back()}
          className="flex items-center gap-2 text-white/40 hover:text-white transition-colors text-sm mb-8"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Pools
        </button>

        {/* Pool header */}
        <div className="glass-card p-7 mb-6">
          <div className="flex flex-col sm:flex-row sm:items-start gap-5">
            {/* Logo */}
            <div className="w-16 h-16 rounded-2xl bg-[#0088CC]/20 border border-[#0088CC]/30 flex items-center justify-center text-[#0088CC] font-bold text-xl flex-shrink-0 overflow-hidden">
              {pool.project.logoUrl ? (
                <img
                  src={pool.project.logoUrl}
                  alt={pool.project.name}
                  className="w-full h-full object-cover"
                />
              ) : (
                pool.project.name.slice(0, 2).toUpperCase()
              )}
            </div>

            <div className="flex-1">
              <div className="flex items-center gap-3 flex-wrap mb-2">
                <h1 className="text-2xl font-bold text-white">
                  {pool.project.name}
                </h1>
                <span className="text-sm text-[#0088CC] font-mono bg-[#0088CC]/10 px-2 py-0.5 rounded">
                  ${pool.tokenSymbol}
                </span>
                {pool.status === 'ACTIVE' ? (
                  <span className="live-badge flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
                    LIVE
                  </span>
                ) : (
                  <span className="ended-badge">ENDED</span>
                )}
              </div>
              {pool.project.description && (
                <p className="text-sm text-white/50 mb-4">
                  {pool.project.description}
                </p>
              )}

              {/* Stats bar */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="glass-inner p-3">
                  <p className="text-xs text-white/40 mb-0.5">Prize Pool</p>
                  <p className="font-bold text-white">
                    {parseFloat(pool.totalReward) >= 1000
                      ? `${(parseFloat(pool.totalReward) / 1000).toFixed(0)}K`
                      : pool.totalReward}{' '}
                    {pool.tokenSymbol}
                  </p>
                </div>
                <div className="glass-inner p-3">
                  <div className="flex items-center gap-1 mb-0.5">
                    <Users className="w-3 h-3 text-white/30" />
                    <p className="text-xs text-white/40">Participants</p>
                  </div>
                  <p className="font-bold text-white">
                    {pool._count.participants}
                  </p>
                </div>
                <div className="glass-inner p-3">
                  <div className="flex items-center gap-1 mb-0.5">
                    <Clock className="w-3 h-3 text-white/30" />
                    <p className="text-xs text-white/40">
                      {pool.status === 'ACTIVE' ? 'Ends in' : 'Duration'}
                    </p>
                  </div>
                  <p className="font-bold text-[#0088CC]">
                    {pool.status === 'ACTIVE'
                      ? countdown || `${pool.durationDays}d`
                      : `${pool.durationDays} days`}
                  </p>
                </div>
                <div className="glass-inner p-3">
                  <div className="flex items-center gap-1 mb-0.5">
                    <Trophy className="w-3 h-3 text-white/30" />
                    <p className="text-xs text-white/40">Reward Slots</p>
                  </div>
                  <p className="font-bold text-white">{pool.rewardSlots}</p>
                </div>
              </div>
            </div>

            {/* Join / Submit */}
            <div className="flex flex-col gap-2 sm:flex-shrink-0">
              {!wallet ? (
                <p className="text-sm text-white/40 text-center">
                  Connect wallet to join
                </p>
              ) : !joined ? (
                <button
                  onClick={handleJoin}
                  disabled={joiningPool || pool.status !== 'ACTIVE'}
                  className="btn-primary flex items-center gap-2 disabled:opacity-40"
                >
                  {joiningPool ? (
                    <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  ) : (
                    <Plus className="w-4 h-4" />
                  )}
                  Join Pool
                </button>
              ) : (
                <button
                  onClick={() => setSubmitOpen(true)}
                  disabled={pool.status !== 'ACTIVE'}
                  className="btn-primary flex items-center gap-2 disabled:opacity-40"
                >
                  <Plus className="w-4 h-4" />
                  Submit Post
                </button>
              )}
              {pool.contractAddress && (
                <a
                  href={`https://tonscan.org/address/${pool.contractAddress}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn-secondary flex items-center gap-2 text-xs"
                >
                  View Contract
                  <ExternalLink className="w-3 h-3" />
                </a>
              )}
            </div>
          </div>
        </div>

        {/* Tabs */}
        <Tabs.Root defaultValue="leaderboard">
          <Tabs.List className="flex mb-6 gap-1 bg-white/[0.03] rounded-xl p-1 border border-white/5">
            {['leaderboard', 'submit', 'my-stats'].map((tab) => (
              <Tabs.Trigger
                key={tab}
                value={tab}
                className="flex-1 py-2.5 text-sm font-medium rounded-lg transition-all data-[state=active]:bg-[#0088CC] data-[state=active]:text-white text-white/50 hover:text-white capitalize"
              >
                {tab.replace('-', ' ')}
              </Tabs.Trigger>
            ))}
          </Tabs.List>

          <Tabs.Content value="leaderboard">
            <Leaderboard
              poolId={pool.id}
              entries={leaderboard}
              totalPoolReward={pool.totalReward}
              tokenSymbol={pool.tokenSymbol}
              status={pool.status}
            />
          </Tabs.Content>

          <Tabs.Content value="submit">
            {!wallet ? (
              <div className="glass-card p-12 text-center text-white/40">
                Connect your TON wallet to submit posts.
              </div>
            ) : !joined ? (
              <div className="glass-card p-12 text-center">
                <p className="text-white/50 mb-4">
                  You haven&apos;t joined this pool yet.
                </p>
                <button onClick={handleJoin} className="btn-primary">
                  Join Pool
                </button>
              </div>
            ) : pool.status !== 'ACTIVE' ? (
              <div className="glass-card p-12 text-center text-white/40">
                This pool has ended. No more submissions accepted.
              </div>
            ) : (
              <div className="glass-card p-6">
                <div className="flex items-center justify-between mb-6">
                  <h3 className="font-semibold text-white">Submit a Post</h3>
                  <span className="text-xs text-white/40">
                    {todaySubmissions}/2 submissions today
                  </span>
                </div>
                <button
                  onClick={() => setSubmitOpen(true)}
                  disabled={todaySubmissions >= 2}
                  className="btn-primary flex items-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <Plus className="w-4 h-4" />
                  Submit X or Telegram Post
                </button>

                {/* Submissions list */}
                {submissions.length > 0 && (
                  <div className="mt-8">
                    <h4 className="text-sm font-medium text-white/70 mb-4">
                      Your Submissions
                    </h4>
                    <div className="space-y-3">
                      {submissions.map((sub) => (
                        <div
                          key={sub.id}
                          className="flex items-center justify-between p-3 rounded-xl bg-white/[0.03] border border-white/5"
                        >
                          <div className="flex items-center gap-3">
                            <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-[#0088CC]/20 text-[#0088CC]">
                              {sub.platform}
                            </span>
                            <a
                              href={sub.postUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-sm text-white/60 hover:text-white truncate max-w-xs transition-colors"
                            >
                              {sub.postUrl}
                            </a>
                          </div>
                          <div className="text-right">
                            <p className="text-sm font-semibold text-[#0088CC]">
                              {sub.currentPoints.toFixed(0)} pts
                            </p>
                            <p className="text-xs text-white/30">
                              {sub.currentViews.toLocaleString()} views
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </Tabs.Content>

          <Tabs.Content value="my-stats">
            {!wallet ? (
              <div className="glass-card p-12 text-center text-white/40">
                Connect your TON wallet to see your stats.
              </div>
            ) : !myStats ? (
              <div className="glass-card p-12 text-center text-white/40">
                Join this pool to see your stats.
              </div>
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <PointsBreakdownCard
                  xPoints={myStats.xPoints}
                  telegramPoints={myStats.telegramPoints}
                  referralBonusPoints={myStats.referralBonusPoints}
                  holderBoost={myStats.holderBoost}
                  referralMultiplier={myStats.referralMultiplier}
                  totalPoints={myStats.totalPoints}
                />
                <ReferralCard
                  poolId={pool.id}
                  referralCode={myStats.referralCode}
                  successfulReferrals={0}
                  bonusPointsEarned={myStats.referralBonusPoints}
                />
              </div>
            )}
          </Tabs.Content>
        </Tabs.Root>
      </div>

      <SubmitPostModal
        poolId={pool.id}
        open={submitOpen}
        onClose={() => {
          setSubmitOpen(false);
          fetchMyStats();
        }}
        dailySubmissionsUsed={todaySubmissions}
      />
    </div>
  );
}
