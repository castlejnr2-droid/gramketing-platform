'use client';
import { useEffect, useState, useCallback } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import { useTonWallet, useTonConnectUI } from '@tonconnect/ui-react';
import * as Tabs from '@radix-ui/react-tabs';
import { Leaderboard } from '@/components/Leaderboard';
import { SubmitPostModal } from '@/components/SubmitPostModal';
import { ReferralCard } from '@/components/ReferralCard';
import { PointsBreakdownCard } from '@/components/PointsBreakdownCard';
import Link from 'next/link';
import { Users, Trophy, Clock, Plus, Wallet, ExternalLink } from 'lucide-react';

interface PoolData {
  id: string;
  status: 'ACTIVE' | 'ENDED' | 'DISTRIBUTED';
  tokenSymbol: string;
  totalReward: string;
  durationDays: number;
  startDate: string;
  endDate: string;
  rewardSlots: number;
  contractAddress?: string;
  jettonMasterAddress: string;
  project: { id: string; name: string; logoUrl?: string; description?: string; tokenSymbol: string };
  _count: { participants: number };
}

interface LeaderboardEntry {
  rank: number; userId: string; walletAddress: string;
  username?: string | null; xHandle?: string | null;
  totalPoints: number; xPoints: number; telegramPoints: number;
  referralBonusPoints: number; referralMultiplier: number; holderBoost: number;
  totalParticipants: number;
}

interface MyStats {
  totalPoints: number; xPoints: number; telegramPoints: number;
  referralBonusPoints: number; referralMultiplier: number; holderBoost: number;
  referralCode: string; successfulReferrals: number;
}

interface Submission {
  id: string; platform: 'X' | 'TELEGRAM'; postUrl: string;
  views: number; likes: number; reposts: number; reactions: number;
  points: number; submittedAt: string; lastScrapedAt?: string | null;
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

export default function MiniAppPoolDetailPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const wallet = useTonWallet();
  const [tonConnectUI] = useTonConnectUI();
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
    const res = await fetch(`/api/pools/${poolId}`);
    const data = await res.json();
    setPool(data.pool);
  }, [poolId]);

  const fetchLeaderboard = useCallback(async () => {
    const res = await fetch(`/api/pools/${poolId}/leaderboard`);
    const data = await res.json();
    setLeaderboard(data.leaderboard ?? []);
  }, [poolId]);

  const fetchMyStats = useCallback(async () => {
    if (!wallet) return;
    const res = await fetch(`/api/submissions/${poolId}`, { credentials: 'include' });
    const data = await res.json();
    setSubmissions(data.submissions ?? []);
    setMyStats(data.myStats ?? null);
    setJoined(!!data.myStats);
    const today = new Date().toISOString().split('T')[0];
    setTodaySubmissions(
      (data.submissions ?? []).filter((s: Submission) => s.submittedAt.startsWith(today)).length
    );
  }, [poolId, wallet]);

  useEffect(() => {
    Promise.all([fetchPool(), fetchLeaderboard()]).finally(() => setLoading(false));
  }, [fetchPool, fetchLeaderboard]);

  useEffect(() => { fetchMyStats(); }, [fetchMyStats]);

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
      const res = await fetch(`/api/pools/${poolId}/join`, { method: 'POST', credentials: 'include' });
      if (res.ok) { setJoined(true); fetchMyStats(); }
    } finally { setJoiningPool(false); }
  };

  if (loading || !pool) {
    return <div className="pt-8 px-4 flex justify-center"><div className="text-white/40">Loading pool...</div></div>;
  }

  return (
    <div className="pt-5 pb-4 px-4">
      {/* Pool header */}
      <div className="glass-card p-5 mb-5">
        <div className="flex items-start gap-4 mb-4">
          <div className="w-12 h-12 rounded-xl bg-[#0088CC]/20 border border-[#0088CC]/30 flex items-center justify-center text-[#0088CC] font-bold flex-shrink-0 overflow-hidden">
            {pool.project.logoUrl
              ? <img src={pool.project.logoUrl} alt={pool.project.name} className="w-full h-full object-cover" />
              : pool.project.name.slice(0, 2).toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap mb-1">
              <Link href={`/miniapp/project/${pool.project.id}`} className="text-lg font-bold text-white hover:text-[#0088CC] transition-colors">
                {pool.project.name}
              </Link>
              <span className="text-xs text-[#0088CC] font-mono bg-[#0088CC]/10 px-2 py-0.5 rounded">${pool.tokenSymbol}</span>
              {pool.status === 'ACTIVE'
                ? <span className="live-badge flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />LIVE</span>
                : <span className="ended-badge">ENDED</span>}
            </div>
            {pool.project.description && (
              <p className="text-xs text-white/50 line-clamp-2">{pool.project.description}</p>
            )}
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-4 gap-2 mb-4">
          {[
            { label: 'Prize', value: `${parseFloat(pool.totalReward) >= 1000 ? `${(parseFloat(pool.totalReward)/1000).toFixed(0)}K` : pool.totalReward} ${pool.tokenSymbol}` },
            { label: 'Joined', value: pool._count.participants, Icon: Users },
            { label: pool.status === 'ACTIVE' ? 'Ends in' : 'Duration', value: pool.status === 'ACTIVE' ? (countdown || `${pool.durationDays}d`) : `${pool.durationDays}d`, Icon: Clock },
            { label: 'Slots', value: pool.rewardSlots, Icon: Trophy },
          ].map(({ label, value }) => (
            <div key={label} className="glass-inner p-2 text-center">
              <p className="text-[10px] text-white/40 mb-0.5">{label}</p>
              <p className="text-xs font-bold text-white leading-tight">{value}</p>
            </div>
          ))}
        </div>

        {/* Join / Submit */}
        <div className="flex flex-col gap-2">
          {!wallet ? (
            <button onClick={() => tonConnectUI.openModal()} className="w-full btn-primary flex items-center justify-center gap-2">
              <Wallet className="w-4 h-4" /> Connect Wallet
            </button>
          ) : !joined ? (
            <button onClick={handleJoin} disabled={joiningPool || pool.status !== 'ACTIVE'} className="w-full btn-primary flex items-center justify-center gap-2 disabled:opacity-40">
              {joiningPool ? <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <Plus className="w-4 h-4" />}
              Join Pool
            </button>
          ) : (
            <button onClick={() => setSubmitOpen(true)} disabled={pool.status !== 'ACTIVE'} className="w-full btn-primary flex items-center justify-center gap-2 disabled:opacity-40">
              <Plus className="w-4 h-4" /> Submit Post
            </button>
          )}
          {pool.contractAddress && (
            <a
              href={`https://tonscan.org/address/${pool.contractAddress}`}
              target="_blank"
              rel="noopener noreferrer"
              className="w-full btn-secondary flex items-center justify-center gap-2 text-xs"
            >
              View Contract <ExternalLink className="w-3 h-3" />
            </a>
          )}
        </div>
      </div>

      {/* Tabs */}
      <Tabs.Root defaultValue="leaderboard">
        <Tabs.List className="flex mb-5 gap-1 bg-white/[0.03] rounded-xl p-1 border border-white/5">
          {['leaderboard', 'submit', 'my-stats'].map((tab) => (
            <Tabs.Trigger key={tab} value={tab}
              className="flex-1 py-2 text-xs font-medium rounded-lg transition-all data-[state=active]:bg-[#0088CC] data-[state=active]:text-white text-white/50 capitalize">
              {tab.replace('-', ' ')}
            </Tabs.Trigger>
          ))}
        </Tabs.List>

        <Tabs.Content value="leaderboard">
          <Leaderboard poolId={pool.id} entries={leaderboard} totalPoolReward={pool.totalReward} tokenSymbol={pool.tokenSymbol} status={pool.status} />
        </Tabs.Content>

        <Tabs.Content value="submit">
          {!wallet ? (
            <div className="glass-card p-10 text-center text-white/40">Connect your wallet to submit posts.</div>
          ) : !joined ? (
            <div className="glass-card p-10 text-center">
              <p className="text-white/50 mb-4">Join this pool to submit posts.</p>
              <button onClick={handleJoin} className="btn-primary">Join Pool</button>
            </div>
          ) : pool.status !== 'ACTIVE' ? (
            <div className="glass-card p-10 text-center text-white/40">This pool has ended.</div>
          ) : (
            <div className="glass-card p-5">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-semibold text-white text-sm">Submit a Post</h3>
                <span className="text-xs text-white/40">{todaySubmissions}/2 today</span>
              </div>
              <button onClick={() => setSubmitOpen(true)} disabled={todaySubmissions >= 2}
                className="btn-primary w-full flex items-center justify-center gap-2 disabled:opacity-40">
                <Plus className="w-4 h-4" /> Submit X or Telegram Post
              </button>
              {submissions.length > 0 && (
                <div className="mt-6 space-y-3">
                  <h4 className="text-xs font-medium text-white/60">Your Submissions</h4>
                  {submissions.map((sub) => (
                    <div key={sub.id} className="p-3 rounded-xl bg-white/[0.03] border border-white/5">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-[#0088CC]/20 text-[#0088CC] flex-shrink-0">{sub.platform}</span>
                          <a href={sub.postUrl} target="_blank" rel="noopener noreferrer"
                            className="text-xs text-white/50 hover:text-white truncate">{sub.postUrl}</a>
                        </div>
                        <div className="text-right flex-shrink-0">
                          <p className="text-sm font-semibold text-[#0088CC]">{sub.points.toFixed(0)} pts</p>
                          <p className="text-[10px] text-white/30">{sub.views.toLocaleString()} views</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3 mt-2 text-[10px] text-white/30">
                        {sub.platform === 'X' && (
                          <>
                            <span>{sub.likes.toLocaleString()} likes</span>
                            <span>{sub.reposts.toLocaleString()} reposts</span>
                          </>
                        )}
                        {sub.platform === 'TELEGRAM' && (
                          <span>{sub.reactions.toLocaleString()} reactions</span>
                        )}
                        <span className="ml-auto">
                          {sub.lastScrapedAt
                            ? `Updated ${new Date(sub.lastScrapedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
                            : 'Pending scrape'}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </Tabs.Content>

        <Tabs.Content value="my-stats">
          {!wallet ? (
            <div className="glass-card p-10 text-center text-white/40">Connect your wallet to see your stats.</div>
          ) : !myStats ? (
            <div className="glass-card p-10 text-center text-white/40">Join this pool to see your stats.</div>
          ) : (
            <div className="space-y-4">
              <PointsBreakdownCard
                xPoints={myStats.xPoints} telegramPoints={myStats.telegramPoints}
                referralBonusPoints={myStats.referralBonusPoints} holderBoost={myStats.holderBoost}
                referralMultiplier={myStats.referralMultiplier} totalPoints={myStats.totalPoints}
              />
              <ReferralCard
                poolId={pool.id} referralCode={myStats.referralCode}
                successfulReferrals={0} bonusPointsEarned={myStats.referralBonusPoints}
              />
            </div>
          )}
        </Tabs.Content>
      </Tabs.Root>

      <SubmitPostModal
        poolId={pool.id}
        open={submitOpen}
        onClose={() => { setSubmitOpen(false); fetchMyStats(); }}
        dailySubmissionsUsed={todaySubmissions}
      />
    </div>
  );
}
