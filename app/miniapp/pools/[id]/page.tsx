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
import {
  Users, Trophy, Clock, Plus, Wallet, ExternalLink,
  Info, Send, BarChart2, AlertCircle, Copy, CheckCheck,
} from 'lucide-react';

// ── Types ────────────────────────────────────────────────────────────────────

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
  campaignType: string;        // 'both' | 'x' | 'telegram'
  xPostLink?: string | null;
  telegramPostLink?: string | null;
  tier1Threshold?: string | null;
  tier2Threshold?: string | null;
  tier3Threshold?: string | null;
  project: {
    id: string; name: string; logoUrl?: string;
    description?: string; tokenSymbol: string;
    ownerWalletAddress?: string;
  };
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
  referrals: { walletAddress: string; username: string | null; holdingAmount: string }[];
}

interface Submission {
  id: string; platform: 'X' | 'TELEGRAM'; postUrl: string;
  views: number; likes: number; reposts: number; reactions: number;
  points: number; submittedAt: string; lastScrapedAt?: string | null;
  scrapeError?: string | null;
  refreshing?: boolean;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function formatCountdown(endDate: string): string {
  const ms = new Date(endDate).getTime() - Date.now();
  if (ms <= 0) return 'Ended';
  const d = Math.floor(ms / 86_400_000);
  const h = Math.floor((ms % 86_400_000) / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  const s = Math.floor((ms % 60_000) / 1_000);
  if (d > 0) return `${d}d ${h}h ${m}m`;
  if (h > 0) return `${h}h ${m}m ${s}s`;
  return `${m}m ${s}s`;
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function fmtReward(total: string, symbol: string) {
  const n = parseFloat(total);
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M ${symbol}`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K ${symbol}`;
  return `${n} ${symbol}`;
}

function estimateReward(pts: number, allPts: number, totalReward: string, symbol: string): string {
  if (allPts === 0 || pts === 0) return `0 ${symbol}`;
  const share = pts / allPts;
  const n = parseFloat(totalReward);
  if (isNaN(n)) return '-';
  const est = n * share;
  return fmtReward(String(est), symbol);
}

function campaignLabel(type: string) {
  if (type === 'x') return { label: 'X Only', color: 'text-sky-400 bg-sky-400/10 border-sky-400/25' };
  if (type === 'telegram') return { label: 'Telegram Only', color: 'text-[#0088CC] bg-[#0088CC]/10 border-[#0088CC]/25' };
  return { label: 'X + Telegram', color: 'text-purple-400 bg-purple-400/10 border-purple-400/25' };
}

// ── Sub-components ────────────────────────────────────────────────────────────

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try { await navigator.clipboard.writeText(text); }
    catch { /* fallback not needed for miniapp */ }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <button
      onClick={copy}
      className={`flex items-center gap-1 text-xs px-2 py-1 rounded-lg border transition-all flex-shrink-0 ${
        copied
          ? 'bg-green-500/15 border-green-500/25 text-green-400'
          : 'bg-white/5 border-white/10 text-white/40 hover:text-white'
      }`}
    >
      {copied ? <CheckCheck className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
      {copied ? 'Copied' : 'Copy'}
    </button>
  );
}

function PromotedPost({ url, platform }: { url: string; platform: 'x' | 'telegram' }) {
  const isX = platform === 'x';
  return (
    <div className={`p-3 rounded-xl border ${isX ? 'bg-sky-500/5 border-sky-500/15' : 'bg-[#0088CC]/5 border-[#0088CC]/15'}`}>
      <p className={`text-[10px] font-semibold uppercase tracking-wider mb-1.5 ${isX ? 'text-sky-400' : 'text-[#0088CC]'}`}>
        {isX ? 'X Post to Promote' : 'Telegram Post to Promote'}
      </p>
      <div className="flex items-center gap-2">
        <p className="text-xs font-mono text-white/60 truncate flex-1">{url}</p>
        <a href={url} target="_blank" rel="noopener noreferrer"
          className={`flex items-center gap-1 text-xs px-2 py-1 rounded-lg border flex-shrink-0 ${
            isX ? 'border-sky-500/25 text-sky-400' : 'border-[#0088CC]/25 text-[#0088CC]'
          }`}>
          Open <ExternalLink className="w-3 h-3" />
        </a>
      </div>
    </div>
  );
}

function StatCard({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="glass-inner p-2.5 text-center">
      <p className="text-[10px] text-white/40 mb-0.5 leading-tight">{label}</p>
      <p className={`text-xs font-bold leading-tight ${accent ? 'text-[#0088CC]' : 'text-white'}`}>{value}</p>
    </div>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function MiniAppPoolDetailPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const wallet = useTonWallet();
  const [tonConnectUI] = useTonConnectUI();
  const poolId = params.id as string;
  const refCode = searchParams.get('ref');

  // linkedWalletAddress: set when MiniAppShell confirms the Telegram account
  // is linked to a wallet (JWT already issued by the server). This lets the user
  // join, submit, and view stats without manually reconnecting TonConnect.
  const [linkedWalletAddress, setLinkedWalletAddress] = useState<string | null>(null);

  const [pool, setPool] = useState<PoolData | null>(null);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [myStats, setMyStats] = useState<MyStats | null>(null);
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [joined, setJoined] = useState(false);
  const [joiningPool, setJoiningPool] = useState(false);
  const [joinError, setJoinError] = useState<string | null>(null);
  const [submitOpen, setSubmitOpen] = useState(false);
  const [todaySubmissions, setTodaySubmissions] = useState(0);
  const [countdown, setCountdown] = useState('');
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  // isAuthed: true when TonConnect wallet is connected OR when a Telegram-linked
  // JWT session was confirmed. Either path gives the user a valid JWT cookie.
  const isAuthed = !!wallet || !!linkedWalletAddress;
  // Effective wallet address for leaderboard lookup
  const effectiveAddress = wallet?.account?.address ?? linkedWalletAddress ?? null;

  // ── Fetchers ──────────────────────────────────────────────────────────────

  const fetchPool = useCallback(async () => {
    try {
      const res = await fetch(`/api/pools/${poolId}`);
      if (!res.ok) throw new Error();
      const data = await res.json();
      setPool(data.pool);
    } catch {
      setLoadError(true);
    }
  }, [poolId]);

  const fetchLeaderboard = useCallback(async () => {
    try {
      const res = await fetch(`/api/pools/${poolId}/leaderboard`);
      const data = await res.json();
      setLeaderboard(data.leaderboard ?? []);
      setLastUpdated(new Date());
    } catch { /* silent */ }
  }, [poolId]);

  const fetchMyStats = useCallback(async () => {
    // No wallet gate here - if a JWT cookie exists (from TonConnect or Telegram link),
    // the API will return data. 401 means no session; we stay at initial unauthenticated state.
    try {
      const res = await fetch(`/api/submissions/${poolId}`, { credentials: 'include' });
      if (!res.ok) return; // 401 = no session; stay unauthenticated
      const data = await res.json();
      setSubmissions(data.submissions ?? []);
      setMyStats(data.myStats ?? null);
      setJoined(!!data.myStats);
      const today = new Date().toISOString().split('T')[0];
      setTodaySubmissions(
        (data.submissions ?? []).filter((s: Submission) => s.submittedAt.startsWith(today)).length
      );
    } catch { /* silent */ }
  }, [poolId]);

  // ── Effects ───────────────────────────────────────────────────────────────

  useEffect(() => {
    Promise.all([fetchPool(), fetchLeaderboard()]).finally(() => setLoading(false));
  }, [fetchPool, fetchLeaderboard]);

  // Re-fetch stats when TonConnect wallet connects/disconnects
  useEffect(() => { fetchMyStats(); }, [fetchMyStats, wallet]);

  // Auto-refresh leaderboard + stats every 5 minutes while the pool is active
  useEffect(() => {
    if (!pool || pool.status !== 'ACTIVE') return;
    const interval = setInterval(() => {
      fetchLeaderboard();
      fetchMyStats();
    }, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [pool, fetchLeaderboard, fetchMyStats]);

  // Listen for the JWT issued via Telegram link (MiniAppShell fires this event
  // after /api/auth/telegram-miniapp returns linked:true and sets the cookie).
  useEffect(() => {
    const handler = (e: Event) => {
      const addr = (e as CustomEvent<{ walletAddress: string }>).detail?.walletAddress;
      if (addr) setLinkedWalletAddress(addr);
      fetchMyStats();
    };
    window.addEventListener('gramketing:session-ready', handler);
    return () => window.removeEventListener('gramketing:session-ready', handler);
  }, [fetchMyStats]);

  // Track referral
  useEffect(() => {
    if (isAuthed && refCode) {
      fetch('/api/referral/track', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ referralCode: refCode, poolId }),
      }).catch(() => {});
    }
  }, [isAuthed, refCode, poolId]);

  // Live countdown - ticks every second
  useEffect(() => {
    if (!pool || pool.status !== 'ACTIVE') return;
    const tick = () => setCountdown(formatCountdown(pool.endDate));
    tick();
    const id = setInterval(tick, 1_000);
    return () => clearInterval(id);
  }, [pool]);

  // ── Actions ───────────────────────────────────────────────────────────────

  const handleJoin = async () => {
    if (!isAuthed) return;
    setJoiningPool(true);
    setJoinError(null);
    try {
      const res = await fetch(`/api/pools/${poolId}/join`, { method: 'POST', credentials: 'include' });
      if (res.ok) {
        setJoined(true);
        fetchMyStats();
      } else {
        const d = await res.json();
        setJoinError(d.error ?? 'Failed to join pool');
      }
    } catch {
      setJoinError('Network error - please try again');
    } finally {
      setJoiningPool(false);
    }
  };

  // ── Per-post force refresh ────────────────────────────────────────────────

  const refreshPost = async (postId: string) => {
    setSubmissions((prev) =>
      prev.map((s) => (s.id === postId ? { ...s, refreshing: true } : s))
    );
    try {
      const res = await fetch(`/api/posts/${postId}/refresh-metrics`, {
        method: 'POST',
        credentials: 'include',
      });
      if (res.ok) {
        const updated = await res.json();
        setSubmissions((prev) =>
          prev.map((s) =>
            s.id === postId
              ? {
                  ...s,
                  views: updated.views,
                  likes: updated.likes,
                  reposts: updated.reposts,
                  points: updated.points,
                  lastScrapedAt: updated.lastScrapedAt,
                  scrapeError: null,
                  refreshing: false,
                }
              : s
          )
        );
        // Re-fetch leaderboard so ranking reflects the updated points
        fetchLeaderboard();
      }
    } catch { /* silent */ } finally {
      setSubmissions((prev) =>
        prev.map((s) => (s.id === postId ? { ...s, refreshing: false } : s))
      );
    }
  };

  // ── Manual refresh ────────────────────────────────────────────────────────

  const handleRefresh = async () => {
    setRefreshing(true);
    await Promise.all([fetchLeaderboard(), fetchMyStats()]);
    setRefreshing(false);
  };

  // ── Derived ───────────────────────────────────────────────────────────────

  const myRank = effectiveAddress
    ? leaderboard.find((e) => e.walletAddress === effectiveAddress)?.rank ?? null
    : null;
  const totalLbPoints = leaderboard.reduce((s, e) => s + e.totalPoints, 0);
  const myEstReward = myStats
    ? estimateReward(myStats.totalPoints, totalLbPoints, pool?.totalReward ?? '0', pool?.tokenSymbol ?? '')
    : null;

  // ── Loading / error states ────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="pt-16 px-4 flex flex-col items-center gap-3">
        <div className="w-8 h-8 border-2 border-[#0088CC]/30 border-t-[#0088CC] rounded-full animate-spin" />
        <p className="text-white/40 text-sm">Loading pool...</p>
      </div>
    );
  }

  if (loadError || !pool) {
    return (
      <div className="pt-16 px-4 flex flex-col items-center gap-3 text-center">
        <AlertCircle className="w-10 h-10 text-red-400" />
        <p className="text-white font-semibold">Pool not found</p>
        <p className="text-white/40 text-sm">This pool may have been removed or the link is invalid.</p>
        <Link href="/miniapp" className="btn-secondary text-sm mt-2">← Back to Pools</Link>
      </div>
    );
  }

  const { label: ctLabel, color: ctColor } = campaignLabel(pool.campaignType);
  const showXPost = pool.xPostLink && (pool.campaignType === 'x' || pool.campaignType === 'both');
  const showTgPost = pool.telegramPostLink && (pool.campaignType === 'telegram' || pool.campaignType === 'both');

  return (
    <div className="pt-5 pb-6 px-4">

      {/* ── Pool Header ── */}
      <div className="glass-card p-4 mb-4">
        {/* Identity row */}
        <div className="flex items-start gap-3 mb-4">
          <div className="w-12 h-12 rounded-xl bg-[#0088CC]/20 border border-[#0088CC]/30 flex items-center justify-center text-[#0088CC] font-bold text-base flex-shrink-0 overflow-hidden">
            {pool.project.logoUrl
              ? <img src={pool.project.logoUrl} alt={pool.project.name} className="w-full h-full object-cover" />
              : pool.project.name.slice(0, 2).toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap mb-1">
              <Link
                href={`/miniapp/project/${pool.project.id}`}
                className="text-base font-bold text-white hover:text-[#0088CC] transition-colors leading-tight"
              >
                {pool.project.name}
              </Link>
              <span className="text-[11px] text-[#0088CC] font-mono bg-[#0088CC]/10 px-1.5 py-0.5 rounded flex-shrink-0">
                ${pool.tokenSymbol}
              </span>
            </div>
            {/* Status + Campaign type */}
            <div className="flex items-center gap-2 flex-wrap">
              {pool.status === 'ACTIVE' ? (
                <span className="live-badge flex items-center gap-1 text-[10px]">
                  <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
                  LIVE
                </span>
              ) : pool.status === 'DISTRIBUTED' ? (
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full border bg-purple-500/10 text-purple-400 border-purple-500/25">
                  DISTRIBUTED
                </span>
              ) : (
                <span className="ended-badge text-[10px]">ENDED</span>
              )}
              <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full border ${ctColor}`}>
                {ctLabel}
              </span>
            </div>
          </div>
        </div>

        {/* Description */}
        {pool.project.description && (
          <p className="text-xs text-white/50 mb-4 leading-relaxed">{pool.project.description}</p>
        )}

        {/* Stats grid */}
        <div className="grid grid-cols-4 gap-1.5 mb-4">
          <StatCard label="Prize Pool" value={fmtReward(pool.totalReward, pool.tokenSymbol)} accent />
          <StatCard label="Joined" value={String(pool._count.participants)} />
          <StatCard
            label={pool.status === 'ACTIVE' ? 'Ends in' : 'Ended'}
            value={pool.status === 'ACTIVE' ? (countdown || `${pool.durationDays}d`) : fmtDate(pool.endDate)}
            accent={pool.status === 'ACTIVE'}
          />
          <StatCard label="Slots" value={String(pool.rewardSlots)} />
        </div>

        {/* Promoted posts - quick preview */}
        {(showXPost || showTgPost) && (
          <div className="space-y-2 mb-4">
            {showXPost && pool.xPostLink && (
              <PromotedPost url={pool.xPostLink} platform="x" />
            )}
            {showTgPost && pool.telegramPostLink && (
              <PromotedPost url={pool.telegramPostLink} platform="telegram" />
            )}
          </div>
        )}

        {/* CTA */}
        <div className="flex flex-col gap-2">
          {joinError && (
            <p className="text-xs text-red-400 flex items-center gap-1">
              <AlertCircle className="w-3 h-3 flex-shrink-0" />{joinError}
            </p>
          )}
          {!isAuthed ? (
            <div className="space-y-2">
              <div className="p-3 rounded-xl bg-[#0088CC]/8 border border-[#0088CC]/20 text-xs text-white/70 leading-relaxed">
                <p className="font-semibold text-white mb-1 flex items-center gap-1.5">
                  <Wallet className="w-3.5 h-3.5 text-[#0088CC]" />
                  TON Wallet Required
                </p>
                Rewards are paid on-chain directly to your wallet. Connect your TON wallet to join and earn - Telegram has a built-in TON wallet you can use.
              </div>
              <button
                onClick={() => tonConnectUI.openModal()}
                className="w-full btn-primary flex items-center justify-center gap-2"
              >
                <Wallet className="w-4 h-4" /> Connect TON Wallet to Join
              </button>
            </div>
          ) : !joined ? (
            <button
              onClick={handleJoin}
              disabled={joiningPool || pool.status !== 'ACTIVE'}
              className="w-full btn-primary flex items-center justify-center gap-2 disabled:opacity-40"
            >
              {joiningPool
                ? <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                : <Plus className="w-4 h-4" />}
              {joiningPool ? 'Joining...' : 'Join Pool'}
            </button>
          ) : (
            <button
              onClick={() => setSubmitOpen(true)}
              disabled={pool.status !== 'ACTIVE' || todaySubmissions >= 2}
              className="w-full btn-primary flex items-center justify-center gap-2 disabled:opacity-40"
            >
              <Send className="w-4 h-4" />
              {todaySubmissions >= 2 ? 'Daily limit reached' : 'Submit Post'}
            </button>
          )}

          {pool.contractAddress && (
            <a
              href={`https://tonscan.org/address/${pool.contractAddress}`}
              target="_blank"
              rel="noopener noreferrer"
              className="w-full btn-secondary flex items-center justify-center gap-2 text-xs"
            >
              View Escrow Contract <ExternalLink className="w-3 h-3" />
            </a>
          )}
        </div>
      </div>

      {/* ── My Rank Banner (if joined) ── */}
      {joined && myStats && (
        <div className="glass-card p-3 mb-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-[#0088CC]/15 border border-[#0088CC]/25 flex items-center justify-center flex-shrink-0">
              <Trophy className="w-4 h-4 text-[#0088CC]" />
            </div>
            <div>
              <p className="text-[10px] text-white/40 uppercase tracking-wider">Your Rank</p>
              <p className="text-sm font-bold text-white">
                {myRank ? `#${myRank}` : '-'}
                <span className="text-white/30 text-xs font-normal ml-1">of {pool._count.participants}</span>
              </p>
            </div>
          </div>
          <div className="text-right">
            <p className="text-[10px] text-white/40 uppercase tracking-wider">Est. Reward</p>
            <p className="text-sm font-bold text-[#0088CC]">{myEstReward ?? '-'}</p>
          </div>
          <div className="text-right">
            <p className="text-[10px] text-white/40 uppercase tracking-wider">Points</p>
            <p className="text-sm font-bold text-white">
              {myStats.totalPoints.toLocaleString(undefined, { maximumFractionDigits: 0 })}
            </p>
          </div>
        </div>
      )}

      {/* ── Tabs ── */}
      <Tabs.Root defaultValue="leaderboard">
        <Tabs.List className="flex mb-4 gap-1 bg-white/[0.03] rounded-xl p-1 border border-white/5">
          {[
            { value: 'leaderboard', icon: <BarChart2 className="w-3.5 h-3.5" />, label: 'Board' },
            { value: 'submit',      icon: <Send className="w-3.5 h-3.5" />,     label: 'Submit' },
            { value: 'my-stats',   icon: <Trophy className="w-3.5 h-3.5" />,   label: 'My Stats' },
            { value: 'info',        icon: <Info className="w-3.5 h-3.5" />,     label: 'Info' },
          ].map((tab) => (
            <Tabs.Trigger
              key={tab.value}
              value={tab.value}
              className="flex-1 py-2 flex items-center justify-center gap-1 text-[11px] font-medium rounded-lg transition-all data-[state=active]:bg-[#0088CC] data-[state=active]:text-white text-white/45"
            >
              {tab.icon}
              {tab.label}
            </Tabs.Trigger>
          ))}
        </Tabs.List>

        {/* ── Leaderboard Tab ── */}
        <Tabs.Content value="leaderboard">
          {/* Refresh bar */}
          <div className="flex items-center justify-between mb-3">
            <p className="text-[11px] text-white/30">
              {lastUpdated
                ? `Updated ${lastUpdated.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
                : 'Auto-refreshes every 5 min'}
            </p>
            <button
              onClick={handleRefresh}
              disabled={refreshing}
              className="flex items-center gap-1.5 text-[11px] px-2.5 py-1 rounded-lg bg-white/5 border border-white/10 text-white/50 hover:text-white hover:bg-white/10 transition-all disabled:opacity-40"
            >
              <Clock className={`w-3 h-3 ${refreshing ? 'animate-spin' : ''}`} />
              {refreshing ? 'Refreshing…' : 'Refresh'}
            </button>
          </div>
          <Leaderboard
            poolId={pool.id}
            entries={leaderboard}
            totalPoolReward={pool.totalReward}
            tokenSymbol={pool.tokenSymbol}
            status={pool.status}
          />
        </Tabs.Content>

        {/* ── Submit Tab ── */}
        <Tabs.Content value="submit">
          {!isAuthed ? (
            <div className="glass-card p-10 text-center">
              <Wallet className="w-8 h-8 text-white/20 mx-auto mb-3" />
              <p className="text-white font-semibold mb-1">Connect your TON wallet</p>
              <p className="text-white/50 text-sm mb-4">
                Rewards are paid on-chain. Connect your TON wallet to join and earn.
              </p>
              <button onClick={() => tonConnectUI.openModal()} className="btn-primary">
                Connect Wallet
              </button>
            </div>
          ) : !joined ? (
            <div className="glass-card p-10 text-center">
              <Plus className="w-8 h-8 text-white/20 mx-auto mb-3" />
              <p className="text-white/50 text-sm mb-4">Join this pool to start submitting posts.</p>
              <button onClick={handleJoin} disabled={joiningPool || pool.status !== 'ACTIVE'} className="btn-primary disabled:opacity-40">
                {joiningPool ? 'Joining...' : 'Join Pool'}
              </button>
            </div>
          ) : pool.status !== 'ACTIVE' ? (
            <div className="glass-card p-10 text-center text-white/40 text-sm">
              This pool has ended - no more submissions accepted.
            </div>
          ) : (
            <div className="space-y-4">
              {/* What to promote */}
              {(showXPost || showTgPost) && (
                <div className="glass-card p-4">
                  <p className="text-xs font-semibold text-white/50 uppercase tracking-wider mb-3">
                    What to Promote
                  </p>
                  <div className="space-y-2">
                    {showXPost && pool.xPostLink && (
                      <PromotedPost url={pool.xPostLink} platform="x" />
                    )}
                    {showTgPost && pool.telegramPostLink && (
                      <PromotedPost url={pool.telegramPostLink} platform="telegram" />
                    )}
                  </div>
                </div>
              )}

              {/* Submit card */}
              <div className="glass-card p-4">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-semibold text-white">Submit a Post</h3>
                  <span className="text-xs text-white/40">{todaySubmissions}/2 today</span>
                </div>

                {todaySubmissions >= 2 ? (
                  <div className="p-3 rounded-xl bg-yellow-500/5 border border-yellow-500/20 text-xs text-yellow-400 mb-3">
                    Daily limit reached. Come back tomorrow at midnight UTC.
                  </div>
                ) : (
                  <p className="text-xs text-white/40 mb-3">
                    You have <span className="text-white font-semibold">{2 - todaySubmissions}</span> submission{2 - todaySubmissions !== 1 ? 's' : ''} remaining today.
                  </p>
                )}

                <button
                  onClick={() => setSubmitOpen(true)}
                  disabled={todaySubmissions >= 2}
                  className="btn-primary w-full flex items-center justify-center gap-2 disabled:opacity-40"
                >
                  <Send className="w-4 h-4" />
                  Submit X or Telegram Post
                </button>

                {/* Campaign hint */}
                <div className={`mt-3 p-2.5 rounded-lg border text-xs ${
                  pool.campaignType === 'x'
                    ? 'bg-sky-500/5 border-sky-500/15 text-sky-400'
                    : pool.campaignType === 'telegram'
                    ? 'bg-[#0088CC]/5 border-[#0088CC]/15 text-[#0088CC]'
                    : 'bg-purple-500/5 border-purple-500/15 text-purple-400'
                }`}>
                  {pool.campaignType === 'x' && 'This pool is X-only. Only X post URLs earn points.'}
                  {pool.campaignType === 'telegram' && 'This pool is Telegram-only. Only Telegram channel post URLs earn points.'}
                  {pool.campaignType === 'both' && 'Both platforms earn points. X and Telegram posts each count 50%.'}
                </div>
              </div>

              {/* Submissions list */}
              {submissions.length > 0 && (
                <div className="glass-card p-4">
                  <h4 className="text-xs font-semibold text-white/50 uppercase tracking-wider mb-3">
                    Your Submissions
                  </h4>
                  <div className="space-y-2.5">
                    {submissions.map((sub) => (
                      <div key={sub.id} className="p-3 rounded-xl bg-white/[0.03] border border-white/5">
                        <div className="flex items-start justify-between gap-2 mb-2">
                          <div className="flex items-center gap-2 min-w-0">
                            <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full flex-shrink-0 ${
                              sub.platform === 'X'
                                ? 'bg-sky-400/15 text-sky-400'
                                : 'bg-[#0088CC]/15 text-[#0088CC]'
                            }`}>
                              {sub.platform}
                            </span>
                            <a
                              href={sub.postUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-xs text-white/50 hover:text-white truncate"
                            >
                              {sub.postUrl.replace('https://', '')}
                            </a>
                          </div>
                          <div className="flex items-center gap-2 flex-shrink-0">
                            {sub.platform === 'X' && (
                              <button
                                onClick={() => refreshPost(sub.id)}
                                disabled={sub.refreshing}
                                className="text-[10px] px-1.5 py-0.5 rounded border border-white/10 text-white/30 hover:text-white hover:border-white/30 transition-all disabled:opacity-40"
                              >
                                {sub.refreshing ? '…' : '↻'}
                              </button>
                            )}
                            <span className="text-sm font-bold text-[#0088CC]">
                              {sub.points.toFixed(0)} pts
                            </span>
                          </div>
                        </div>

                        <div className="grid grid-cols-3 gap-2 text-[10px] text-white/40">
                          <span>{sub.views.toLocaleString()} views</span>
                          {sub.platform === 'X' ? (
                            <>
                              <span>{sub.likes.toLocaleString()} likes</span>
                              <span>{sub.reposts.toLocaleString()} reposts</span>
                            </>
                          ) : (
                            <>
                              <span>{sub.reactions.toLocaleString()} reactions</span>
                              <span />
                            </>
                          )}
                        </div>

                        {sub.scrapeError && (
                          <p className="text-[10px] text-red-400 mt-1.5 flex items-center gap-1">
                            <AlertCircle className="w-3 h-3 flex-shrink-0" />
                            {sub.scrapeError}
                          </p>
                        )}
                        <p className="text-[10px] text-white/25 mt-1.5">
                          {sub.lastScrapedAt
                            ? `Updated ${new Date(sub.lastScrapedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
                            : 'Pending first scrape (~30 min)'}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </Tabs.Content>

        {/* ── My Stats Tab ── */}
        <Tabs.Content value="my-stats">
          {!isAuthed ? (
            <div className="glass-card p-10 text-center">
              <Wallet className="w-8 h-8 text-white/20 mx-auto mb-3" />
              <p className="text-white font-semibold mb-1">Connect your TON wallet</p>
              <p className="text-white/50 text-sm mb-4">
                Rewards are paid on-chain. Connect your TON wallet to join and earn.
              </p>
              <button onClick={() => tonConnectUI.openModal()} className="btn-primary">
                Connect Wallet
              </button>
            </div>
          ) : !myStats ? (
            <div className="glass-card p-10 text-center">
              <BarChart2 className="w-8 h-8 text-white/20 mx-auto mb-3" />
              <p className="text-white/50 text-sm mb-4">Join this pool to see your stats.</p>
              <button onClick={handleJoin} disabled={joiningPool || pool.status !== 'ACTIVE'} className="btn-primary disabled:opacity-40">
                {joiningPool ? 'Joining...' : 'Join Pool'}
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              <PointsBreakdownCard
                xPoints={myStats.xPoints}
                telegramPoints={myStats.telegramPoints}
                referralBonusPoints={myStats.referralBonusPoints}
                holderBoost={myStats.holderBoost}
                referralMultiplier={myStats.referralMultiplier}
                totalPoints={myStats.totalPoints}
              />

              {/* Per-post breakdown */}
              {submissions.length > 0 && (
                <div className="glass-card p-4">
                  <p className="text-xs font-semibold text-white/40 uppercase tracking-wider mb-3">
                    My Posts
                  </p>
                  <div className="space-y-2.5">
                    {submissions.map((sub) => (
                      <div key={sub.id} className="p-3 rounded-xl bg-white/[0.03] border border-white/5">
                        <div className="flex items-start justify-between gap-2 mb-1.5">
                          <div className="flex items-center gap-2 min-w-0">
                            <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full flex-shrink-0 ${
                              sub.platform === 'X'
                                ? 'bg-sky-400/15 text-sky-400'
                                : 'bg-[#0088CC]/15 text-[#0088CC]'
                            }`}>
                              {sub.platform}
                            </span>
                            <a
                              href={sub.postUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-xs text-white/50 hover:text-white truncate"
                            >
                              {sub.postUrl.replace('https://', '')}
                            </a>
                          </div>
                          <div className="flex items-center gap-2 flex-shrink-0">
                            {sub.platform === 'X' && (
                              <button
                                onClick={() => refreshPost(sub.id)}
                                disabled={sub.refreshing}
                                className="text-[10px] px-1.5 py-0.5 rounded border border-white/10 text-white/30 hover:text-white hover:border-white/30 transition-all disabled:opacity-40"
                              >
                                {sub.refreshing ? '…' : '↻'}
                              </button>
                            )}
                            <span className="text-sm font-bold text-[#0088CC]">
                              {sub.points.toFixed(0)} pts
                            </span>
                          </div>
                        </div>
                        <div className="grid grid-cols-3 gap-2 text-[10px] text-white/40">
                          <span>{sub.views.toLocaleString()} views</span>
                          {sub.platform === 'X' ? (
                            <>
                              <span>{sub.likes.toLocaleString()} likes</span>
                              <span>{sub.reposts.toLocaleString()} reposts</span>
                            </>
                          ) : (
                            <>
                              <span>{sub.reactions.toLocaleString()} reactions</span>
                              <span />
                            </>
                          )}
                        </div>
                        {sub.scrapeError && (
                          <p className="text-[10px] text-red-400 mt-1.5 flex items-center gap-1">
                            <AlertCircle className="w-3 h-3 flex-shrink-0" />
                            {sub.scrapeError}
                          </p>
                        )}
                        <p className="text-[10px] text-white/25 mt-1">
                          {sub.lastScrapedAt
                            ? `Updated ${new Date(sub.lastScrapedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
                            : 'Pending first scrape (~30 min)'}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <ReferralCard
                poolId={pool.id}
                referralCode={myStats.referralCode}
                successfulReferrals={myStats.successfulReferrals}
                bonusPointsEarned={myStats.referralBonusPoints}
                basePath="/miniapp"
              />
            </div>
          )}
        </Tabs.Content>

        {/* ── Info Tab ── */}
        <Tabs.Content value="info">
          <div className="space-y-3">

            {/* Pool details */}
            <div className="glass-card p-4">
              <p className="text-xs font-semibold text-white/40 uppercase tracking-wider mb-3">Pool Details</p>
              <div className="space-y-2.5">
                {[
                  { label: 'Status', value: pool.status },
                  { label: 'Campaign Type', value: ctLabel },
                  { label: 'Start Date', value: fmtDate(pool.startDate) },
                  { label: 'End Date', value: fmtDate(pool.endDate) },
                  { label: 'Duration', value: `${pool.durationDays} days` },
                  { label: 'Total Reward', value: fmtReward(pool.totalReward, pool.tokenSymbol) },
                  { label: 'Reward Slots', value: `Top ${pool.rewardSlots} participants` },
                  { label: 'Participants', value: String(pool._count.participants) },
                ].map(({ label, value }) => (
                  <div key={label} className="flex items-center justify-between gap-3">
                    <span className="text-xs text-white/40">{label}</span>
                    <span className="text-xs font-medium text-white/80 text-right">{value}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Tier thresholds */}
            {(BigInt(pool.tier1Threshold ?? 0) > 0n || BigInt(pool.tier2Threshold ?? 0) > 0n || BigInt(pool.tier3Threshold ?? 0) > 0n) && (
              <div className="glass-card p-4">
                <p className="text-xs font-semibold text-white/40 uppercase tracking-wider mb-3">
                  Holder Boost Tiers
                </p>
                <div className="space-y-2">
                  {[
                    { label: 'Tier 1', mult: '1.2×', val: pool.tier1Threshold, color: 'text-blue-300 bg-blue-500/10 border-blue-500/20' },
                    { label: 'Tier 2', mult: '1.5×', val: pool.tier2Threshold, color: 'text-purple-300 bg-purple-500/10 border-purple-500/20' },
                    { label: 'Tier 3', mult: '2.0×', val: pool.tier3Threshold, color: 'text-yellow-300 bg-yellow-500/10 border-yellow-500/20' },
                  ].filter(t => BigInt(t.val ?? 0) > 0n).map((t) => (
                    <div key={t.label} className={`flex items-center justify-between px-3 py-2 rounded-lg border ${t.color}`}>
                      <span className="text-xs font-semibold">{t.label} ({t.mult})</span>
                      <span className="text-xs">
                        {/* mGRAM always has 9 decimals - divide stored nano value accordingly */}
                        {(BigInt(t.val!) / 1_000_000_000n).toLocaleString()}+ tokens
                      </span>
                    </div>
                  ))}
                </div>
                <p className="text-[10px] text-white/30 mt-2">
                  Hold the minimum tokens to unlock the corresponding boost multiplier.
                </p>
              </div>
            )}

            {/* Token / Contract */}
            <div className="glass-card p-4">
              <p className="text-xs font-semibold text-white/40 uppercase tracking-wider mb-3">
                On-Chain Info
              </p>
              <div className="space-y-3">
                <div>
                  <p className="text-[10px] text-white/30 mb-1">Jetton Master Address</p>
                  <div className="flex items-center gap-2">
                    <p className="text-[11px] font-mono text-white/60 truncate flex-1">
                      {pool.jettonMasterAddress}
                    </p>
                    <CopyButton text={pool.jettonMasterAddress} />
                  </div>
                </div>
                {pool.contractAddress && (
                  <div>
                    <p className="text-[10px] text-white/30 mb-1">Escrow Contract Address</p>
                    <div className="flex items-center gap-2">
                      <p className="text-[11px] font-mono text-white/60 truncate flex-1">
                        {pool.contractAddress}
                      </p>
                      <CopyButton text={pool.contractAddress} />
                    </div>
                    <a
                      href={`https://tonscan.org/address/${pool.contractAddress}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-xs text-[#0088CC] mt-1.5"
                    >
                      View on TON Scan <ExternalLink className="w-3 h-3" />
                    </a>
                  </div>
                )}
              </div>
            </div>

            {/* Promoted posts in info tab too */}
            {(showXPost || showTgPost) && (
              <div className="glass-card p-4">
                <p className="text-xs font-semibold text-white/40 uppercase tracking-wider mb-3">
                  Posts to Promote
                </p>
                <div className="space-y-2">
                  {showXPost && pool.xPostLink && (
                    <PromotedPost url={pool.xPostLink} platform="x" />
                  )}
                  {showTgPost && pool.telegramPostLink && (
                    <PromotedPost url={pool.telegramPostLink} platform="telegram" />
                  )}
                </div>
              </div>
            )}

            {/* Reward distribution info */}
            <div className="glass-card p-4">
              <p className="text-xs font-semibold text-white/40 uppercase tracking-wider mb-3">
                How Rewards Are Distributed
              </p>
              <div className="space-y-2 text-xs text-white/50">
                <p>The top <strong className="text-white">{pool.rewardSlots} participants</strong> by points share the entire prize pool proportionally.</p>
                <p>Distribution is triggered by the platform admin after the pool ends. Tokens are sent directly from the escrow contract to winners&apos; wallets.</p>
                <p>Typical payout: within <strong className="text-white">24–48 hours</strong> of pool end.</p>
              </div>
            </div>

          </div>
        </Tabs.Content>
      </Tabs.Root>

      {/* Submit modal */}
      <SubmitPostModal
        poolId={pool.id}
        open={submitOpen}
        onClose={() => { setSubmitOpen(false); fetchMyStats(); }}
        dailySubmissionsUsed={todaySubmissions}
        campaignType={pool.campaignType as 'both' | 'x' | 'telegram'}
      />
    </div>
  );
}
