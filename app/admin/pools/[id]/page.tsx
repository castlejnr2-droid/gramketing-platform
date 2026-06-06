'use client';
import { useEffect, useState, useCallback } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { useTonWallet } from '@tonconnect/ui-react';
import { TonConnectButton } from '@tonconnect/ui-react';
import {
  ArrowLeft, Shield, AlertCircle, CheckCircle, Loader2,
  ExternalLink, RefreshCw, XCircle, Coins, StopCircle,
  Users, FileText, Info, BarChart2, Copy, Check,
  Trophy, Zap, ThumbsUp, ThumbsDown,
} from 'lucide-react';

// ── Types ─────────────────────────────────────────────────────────────────────

interface PoolDetail {
  id: string;
  status: 'ACTIVE' | 'ENDED' | 'DISTRIBUTED';
  project: {
    id: string; name: string; logoUrl: string | null;
    ownerWalletAddress: string; xUrl: string | null; telegramUrl: string | null;
  };
  tokenSymbol: string;
  totalReward: string;
  durationDays: number;
  rewardSlots: number;
  campaignType: string;
  contractAddress: string | null;
  jettonMasterAddress: string;
  xPostLink: string | null;
  telegramPostLink: string | null;
  tier1Threshold: string;
  tier2Threshold: string;
  tier3Threshold: string;
  accessFeePaidIn: string;
  startDate: string;
  endDate: string;
  createdAt: string;
  participantCount: number;
  submissionCount: number;
}

interface DistributionWinner {
  walletAddress: string;
  userId: string;
  totalPoints: number;
  sharePercent: number;
  shareBasisPoints: number;
  tokenAmount: string;
}

interface LeaderboardEntry {
  rank: number;
  userId: string;
  walletAddress: string;
  username: string | null;
  xHandle: string | null;
  telegramHandle: string | null;
  joinedAt: string;
  totalPoints: number;
  xPoints: number;
  telegramPoints: number;
  referralBonusPoints: number;
  referralMultiplier: number;
  holderBoost: number;
  submissionCount: number;
}

interface Submission {
  id: string;
  platform: 'X' | 'TELEGRAM';
  postUrl: string;
  views: number;
  likes: number;
  reposts: number;
  reactions: number;
  points: number;
  status: 'PENDING' | 'VERIFIED' | 'REJECTED';
  submittedAt: string;
  lastScrapedAt: string | null;
  participant: {
    walletAddress: string;
    username: string | null;
    xHandle: string | null;
    telegramHandle: string | null;
  };
}

interface ProRataPreview {
  daysElapsed: number; daysRemaining: number; totalDays: number;
  dailyRate: number; participantTokens: number; refundTokens: number;
}
interface WinnerPreview {
  rank: number; walletAddress: string; totalPoints: number; proRataAmount: string;
}

type Tab = 'overview' | 'leaderboard' | 'participants' | 'submissions' | 'info';

// ── Helpers ───────────────────────────────────────────────────────────────────

const STATUS_STYLES: Record<string, string> = {
  ACTIVE:      'bg-green-500/15 text-green-400 border-green-500/25',
  ENDED:       'bg-yellow-500/15 text-yellow-400 border-yellow-500/25',
  DISTRIBUTED: 'bg-white/10 text-white/40 border-white/10',
};

const SUB_STATUS_STYLES: Record<string, string> = {
  PENDING:  'bg-yellow-500/15 text-yellow-400 border-yellow-500/25',
  VERIFIED: 'bg-green-500/15 text-green-400 border-green-500/25',
  REJECTED: 'bg-red-500/15 text-red-400 border-red-500/25',
};

function shortAddr(a: string) { return `${a.slice(0, 6)}…${a.slice(-4)}`; }
function fmt(n: number)       { return n.toLocaleString(); }

function CopyAddr({ addr }: { addr: string }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(addr).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  return (
    <button onClick={copy} className="flex items-center gap-1.5 font-mono text-xs text-white/60 hover:text-white transition-colors group">
      {shortAddr(addr)}
      {copied ? <Check className="w-3 h-3 text-green-400" /> : <Copy className="w-3 h-3 opacity-0 group-hover:opacity-60" />}
    </button>
  );
}

function ActionBtn({
  label, icon, onClick, variant = 'ghost', loading = false, disabled = false,
}: {
  label: string; icon: React.ReactNode; onClick: () => void;
  variant?: 'primary' | 'danger' | 'ghost'; loading?: boolean; disabled?: boolean;
}) {
  const cls = {
    primary: 'bg-[#0088CC]/15 text-[#0088CC] border-[#0088CC]/30 hover:bg-[#0088CC]/25',
    danger:  'bg-red-500/10 text-red-400 border-red-500/30 hover:bg-red-500/20',
    ghost:   'text-white/60 border-white/15 hover:text-white hover:border-white/30',
  }[variant];
  return (
    <button
      onClick={onClick}
      disabled={disabled || loading}
      className={`flex items-center gap-2 px-4 py-2 rounded-xl border text-sm font-medium transition-all disabled:opacity-30 disabled:cursor-not-allowed ${cls}`}
    >
      {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : icon}
      {label}
    </button>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function AdminPoolDetailPage() {
  const wallet = useTonWallet();
  const { id: poolId } = useParams<{ id: string }>();

  const [pool, setPool]             = useState<PoolDetail | null>(null);
  const [distribution, setDist]     = useState<DistributionWinner[]>([]);
  const [leaderboard, setLb]        = useState<LeaderboardEntry[]>([]);
  const [submissions, setSubs]      = useState<Submission[]>([]);
  const [tab, setTab]               = useState<Tab>('overview');
  const [loading, setLoading]       = useState(true);
  const [lbLoading, setLbLoading]   = useState(false);
  const [subLoading, setSubLoading] = useState(false);
  const [isAdmin, setIsAdmin]       = useState(false);
  const [subPlatform, setSubPlatform] = useState<'ALL' | 'X' | 'TELEGRAM'>('ALL');
  const [subStatus, setSubStatus]   = useState<'ALL' | 'PENDING' | 'VERIFIED' | 'REJECTED'>('ALL');
  const [actionStates, setActionStates] = useState<Record<string, boolean>>({});
  const [feedback, setFeedback]     = useState<{ msg: string; ok: boolean } | null>(null);

  // Cancel modal
  const [cancelOpen, setCancelOpen]     = useState(false);
  const [cancelPreview, setCancelPrev]  = useState<ProRataPreview | null>(null);
  const [cancelWinners, setCancelWins]  = useState<WinnerPreview[]>([]);
  const [cancelLoading, setCancelLoad]  = useState(false);

  // ── Fetch ───────────────────────────────────────────────────────────────────

  const fetchPool = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/pools/${poolId}`, { credentials: 'include' });
      const d = await res.json();
      if (d.error === 'Unauthorized') { setIsAdmin(false); return; }
      if (d.error) return;
      setIsAdmin(true);
      setPool(d.pool);
      setDist(d.distribution ?? []);
    } finally {
      setLoading(false);
    }
  }, [poolId]);

  const fetchLeaderboard = useCallback(async () => {
    setLbLoading(true);
    try {
      const res = await fetch(`/api/pools/${poolId}/leaderboard`, { credentials: 'include' });
      const d = await res.json();
      setLb(d.leaderboard ?? []);
    } finally {
      setLbLoading(false);
    }
  }, [poolId]);

  const fetchSubmissions = useCallback(async (platform: string, status: string) => {
    setSubLoading(true);
    const params = new URLSearchParams();
    if (platform !== 'ALL') params.set('platform', platform);
    if (status !== 'ALL') params.set('status', status);
    const qs = params.toString();
    try {
      const res = await fetch(`/api/admin/pools/${poolId}/submissions${qs ? `?${qs}` : ''}`, { credentials: 'include' });
      const d = await res.json();
      setSubs(d.submissions ?? []);
    } finally {
      setSubLoading(false);
    }
  }, [poolId]);

  useEffect(() => { if (wallet) fetchPool(); else setLoading(false); }, [wallet, fetchPool]);

  useEffect(() => {
    if (tab === 'leaderboard' && leaderboard.length === 0) fetchLeaderboard();
    if (tab === 'participants' && leaderboard.length === 0) fetchLeaderboard();
    if (tab === 'submissions') fetchSubmissions(subPlatform, subStatus);
  }, [tab]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (tab === 'submissions') fetchSubmissions(subPlatform, subStatus);
  }, [subPlatform, subStatus]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Actions ─────────────────────────────────────────────────────────────────

  const setAction = (k: string, v: boolean) =>
    setActionStates((s) => ({ ...s, [k]: v }));

  const doPost = async (key: string, url: string, body: object, msg: string, onOk?: () => void) => {
    setAction(key, true); setFeedback(null);
    try {
      const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify(body) });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error ?? 'Failed');
      setFeedback({ msg, ok: true });
      onOk?.();
    } catch (e: unknown) {
      setFeedback({ msg: e instanceof Error ? e.message : 'Error', ok: false });
    } finally {
      setAction(key, false);
    }
  };

  const handleEnd = () =>
    doPost('end', '/api/admin/end-pool', { poolId }, 'Pool ended.', () =>
      setPool((p) => p ? { ...p, status: 'ENDED' } : p));

  const handleDistribute = () =>
    doPost('dist', '/api/admin/distribute', { poolId }, 'Distribution triggered!', () =>
      setPool((p) => p ? { ...p, status: 'DISTRIBUTED' } : p));

  const handleRescrape = () =>
    doPost('scrape', '/api/admin/rescrape', { poolId }, 'Re-scrape triggered!');

  const openCancel = async () => {
    setCancelOpen(true); setCancelPrev(null); setCancelWins([]);
    const res = await fetch(`/api/admin/cancel-pool?poolId=${poolId}`, { credentials: 'include' });
    const d = await res.json();
    setCancelPrev(d.preview ?? null);
    setCancelWins(d.winners ?? []);
  };

  const confirmCancel = async () => {
    setCancelLoad(true);
    try {
      const res = await fetch('/api/admin/cancel-pool', { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify({ poolId }) });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error ?? 'Failed');
      setFeedback({ msg: 'Pool cancelled with pro-rata split.', ok: true });
      setPool((p) => p ? { ...p, status: 'DISTRIBUTED' } : p);
      setCancelOpen(false);
    } catch (e: unknown) {
      setFeedback({ msg: e instanceof Error ? e.message : 'Cancel failed', ok: false });
    } finally {
      setCancelLoad(false);
    }
  };

  const updateSubStatus = async (subId: string, newStatus: 'VERIFIED' | 'REJECTED' | 'PENDING') => {
    const key = `sub-${subId}`;
    setAction(key, true);
    try {
      const res = await fetch(`/api/admin/submissions/${subId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ status: newStatus }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error ?? 'Failed');
      setSubs((prev) => prev.map((s) => s.id === subId ? { ...s, status: newStatus } : s));
    } catch (e: unknown) {
      setFeedback({ msg: e instanceof Error ? e.message : 'Failed', ok: false });
    } finally {
      setAction(key, false);
    }
  };

  // ── Guards ───────────────────────────────────────────────────────────────────

  if (!wallet) return (
    <div className="min-h-screen pt-24 px-4 flex items-center justify-center">
      <div className="glass-card p-10 text-center max-w-sm">
        <Shield className="w-10 h-10 mx-auto text-[#0088CC]/50 mb-4" />
        <p className="text-white/60 text-sm mb-6">Connect your admin wallet.</p>
        <TonConnectButton />
      </div>
    </div>
  );

  if (loading) return (
    <div className="min-h-screen pt-24 px-4 flex items-center justify-center">
      <Loader2 className="w-8 h-8 text-white/30 animate-spin" />
    </div>
  );

  if (!isAdmin || !pool) return (
    <div className="min-h-screen pt-24 px-4 flex items-center justify-center">
      <div className="glass-card p-10 text-center text-red-400 max-w-sm">
        <AlertCircle className="w-10 h-10 mx-auto mb-3" />
        <p className="font-semibold">{!isAdmin ? 'Access Denied' : 'Pool not found'}</p>
      </div>
    </div>
  );

  const now = Date.now();
  const end = new Date(pool.endDate).getTime();
  const start = new Date(pool.startDate).getTime();
  const totalMs = end - start;
  const elapsedMs = Math.min(now - start, totalMs);
  const elapsedPct = Math.round((elapsedMs / totalMs) * 100);
  const daysLeft = Math.max(0, Math.ceil((end - now) / 86_400_000));
  const isLive = pool.status === 'ACTIVE' && now < end;

  // For leaderboard reward share %
  const totalPoints = leaderboard.reduce((sum, e) => sum + e.totalPoints, 0);

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen pt-24 pb-24 px-4">
      <div className="max-w-6xl mx-auto">

        {/* Back */}
        <div className="flex items-center gap-3 mb-7">
          <Link href="/admin/pools" className="text-white/40 hover:text-white transition-colors">
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <span className="text-white/20">/</span>
          <span className="text-white/50 text-sm">{pool.project.name}</span>
        </div>

        {/* Feedback */}
        {feedback && (
          <div className={`mb-6 p-3.5 rounded-xl flex items-center gap-2 text-sm border ${feedback.ok ? 'bg-green-500/10 border-green-500/20 text-green-400' : 'bg-red-500/10 border-red-500/20 text-red-400'}`}>
            {feedback.ok ? <CheckCircle className="w-4 h-4 shrink-0" /> : <AlertCircle className="w-4 h-4 shrink-0" />}
            {feedback.msg}
            <button onClick={() => setFeedback(null)} className="ml-auto opacity-50 hover:opacity-100">✕</button>
          </div>
        )}

        {/* Pool header */}
        <div className="glass-card p-6 mb-6">
          <div className="flex flex-col sm:flex-row sm:items-start gap-5">
            {/* Logo + name */}
            <div className="flex items-center gap-4 flex-1 min-w-0">
              {pool.project.logoUrl ? (
                <img src={pool.project.logoUrl} alt="" className="w-14 h-14 rounded-full object-cover shrink-0 border border-white/10" />
              ) : (
                <div className="w-14 h-14 rounded-full bg-[#0088CC]/20 flex items-center justify-center shrink-0">
                  <span className="text-[#0088CC] font-bold text-lg">{pool.tokenSymbol[0]}</span>
                </div>
              )}
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h1 className="text-xl font-bold text-white">{pool.project.name}</h1>
                  <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${STATUS_STYLES[pool.status]}`}>{pool.status}</span>
                </div>
                <p className="text-[#0088CC] font-mono text-sm mt-0.5">${pool.tokenSymbol}</p>
                <p className="text-white/30 text-xs mt-1 font-mono">{shortAddr(pool.id)}</p>
              </div>
            </div>

            {/* Actions */}
            <div className="flex flex-wrap gap-2 shrink-0">
              {pool.status === 'ACTIVE' && (
                <ActionBtn label="End Pool" icon={<StopCircle className="w-4 h-4" />} onClick={handleEnd} loading={actionStates.end} />
              )}
              {pool.status === 'ENDED' && (
                <ActionBtn label="Distribute" icon={<Coins className="w-4 h-4" />} onClick={handleDistribute} loading={actionStates.dist} variant="primary" />
              )}
              {(pool.status === 'ACTIVE' || pool.status === 'ENDED') && (
                <ActionBtn label="Cancel" icon={<XCircle className="w-4 h-4" />} onClick={openCancel} variant="danger" />
              )}
              <ActionBtn label="Re-scrape" icon={<RefreshCw className="w-4 h-4" />} onClick={handleRescrape} loading={actionStates.scrape} />
              <Link href={`/pools/${poolId}`} target="_blank"
                className="flex items-center gap-2 px-4 py-2 rounded-xl border border-white/15 text-white/50 hover:text-white hover:border-white/30 text-sm font-medium transition-all">
                <ExternalLink className="w-4 h-4" />
                View
              </Link>
            </div>
          </div>

          {/* Progress bar */}
          <div className="mt-5">
            <div className="flex justify-between text-xs text-white/35 mb-1.5">
              <span>{new Date(pool.startDate).toLocaleDateString()}</span>
              <span className="text-white/50">
                {isLive ? `${daysLeft}d left` : pool.status === 'ACTIVE' ? 'Expired' : 'Ended'}
              </span>
              <span>{new Date(pool.endDate).toLocaleDateString()}</span>
            </div>
            <div className="h-1.5 bg-white/10 rounded-full overflow-hidden">
              <div className="h-full bg-[#0088CC] rounded-full" style={{ width: `${Math.min(elapsedPct, 100)}%` }} />
            </div>
          </div>
        </div>

        {/* Stats row */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
          {[
            { label: 'Participants', value: `${fmt(pool.participantCount)} / ${pool.rewardSlots}`, icon: <Users className="w-4 h-4 text-[#0088CC]" /> },
            { label: 'Submissions',  value: fmt(pool.submissionCount), icon: <FileText className="w-4 h-4 text-purple-400" /> },
            { label: 'Total Reward', value: `${parseFloat(pool.totalReward).toLocaleString()} ${pool.tokenSymbol}`, icon: <Coins className="w-4 h-4 text-yellow-400" /> },
            { label: 'Duration',     value: `${pool.durationDays} days`, icon: <Zap className="w-4 h-4 text-green-400" /> },
          ].map((s) => (
            <div key={s.label} className="glass-card p-4">
              <div className="flex items-center gap-2 mb-1">{s.icon}<span className="text-xs text-white/35">{s.label}</span></div>
              <p className="text-white font-semibold text-sm">{s.value}</p>
            </div>
          ))}
        </div>

        {/* Tabs */}
        <div className="flex flex-wrap gap-1 p-1 rounded-xl border border-white/10 bg-white/[0.02] mb-5 w-fit">
          {([
            { key: 'overview',      icon: <BarChart2 className="w-3.5 h-3.5" />, label: 'Overview' },
            { key: 'leaderboard',   icon: <Trophy className="w-3.5 h-3.5" />,    label: 'Leaderboard' },
            { key: 'participants',  icon: <Users className="w-3.5 h-3.5" />,     label: 'Participants' },
            { key: 'submissions',   icon: <FileText className="w-3.5 h-3.5" />,  label: 'Submissions' },
            { key: 'info',          icon: <Info className="w-3.5 h-3.5" />,      label: 'Info' },
          ] as { key: Tab; icon: React.ReactNode; label: string }[]).map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                tab === t.key ? 'bg-[#0088CC] text-white' : 'text-white/40 hover:text-white'
              }`}
            >
              {t.icon}{t.label}
            </button>
          ))}
        </div>

        {/* ── Overview tab ─────────────────────────────────────────────────── */}
        {tab === 'overview' && (
          <div className="space-y-6">
            {distribution.length > 0 ? (
              <div className="glass-card overflow-hidden">
                <div className="px-5 py-4 border-b border-white/10">
                  <p className="font-semibold text-white">Distribution Preview</p>
                  <p className="text-xs text-white/40 mt-0.5">How rewards will be split if distributed now</p>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="border-b border-white/10 bg-white/[0.02]">
                      <tr>
                        {['Rank', 'Wallet', 'Points', 'Share', 'Amount'].map((h) => (
                          <th key={h} className="px-4 py-3 text-left text-xs font-medium text-white/35 uppercase tracking-wider">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5">
                      {distribution.map((w, i) => (
                        <tr key={w.walletAddress} className={`hover:bg-white/[0.02] ${i < pool.rewardSlots ? '' : 'opacity-40'}`}>
                          <td className="px-4 py-3">
                            {i < pool.rewardSlots
                              ? <span className="text-yellow-400 font-bold">#{i + 1}</span>
                              : <span className="text-white/30">#{i + 1}</span>}
                          </td>
                          <td className="px-4 py-3"><CopyAddr addr={w.walletAddress} /></td>
                          <td className="px-4 py-3 text-white/70">{fmt(w.totalPoints)}</td>
                          <td className="px-4 py-3 text-white/50">{w.sharePercent.toFixed(1)}%</td>
                          <td className="px-4 py-3 font-semibold text-[#0088CC]">
                            {parseFloat(w.tokenAmount).toLocaleString()} {pool.tokenSymbol}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : (
              <div className="glass-card p-12 text-center text-white/30">
                <Trophy className="w-10 h-10 mx-auto mb-3 opacity-20" />
                <p>No participants with points yet.</p>
              </div>
            )}
          </div>
        )}

        {/* ── Leaderboard tab ───────────────────────────────────────────────── */}
        {tab === 'leaderboard' && (
          <div className="glass-card overflow-hidden">
            {lbLoading ? (
              <div className="p-12 text-center"><Loader2 className="w-6 h-6 text-white/30 animate-spin mx-auto" /></div>
            ) : leaderboard.length === 0 ? (
              <div className="p-12 text-center text-white/30">No participants yet.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead className="border-b border-white/10 bg-white/[0.02]">
                    <tr>
                      {['#', 'Wallet', 'Username', 'X', 'Telegram', 'Total', 'X Pts', 'TG Pts', 'Ref Bonus', 'Ref Mult', 'Holder', 'Share %', 'Joined'].map((h) => (
                        <th key={h} className="px-3 py-3 text-left font-medium text-white/30 uppercase tracking-wider whitespace-nowrap">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {leaderboard.map((e) => {
                      const sharePct = totalPoints > 0 ? (e.totalPoints / totalPoints * 100) : 0;
                      return (
                        <tr key={e.userId} className={`hover:bg-white/[0.02] transition-colors ${e.rank <= pool.rewardSlots ? 'bg-yellow-500/[0.02]' : ''}`}>
                          <td className="px-3 py-2.5">
                            {e.rank <= pool.rewardSlots
                              ? <span className="text-yellow-400 font-bold">#{e.rank}</span>
                              : <span className="text-white/30">#{e.rank}</span>}
                          </td>
                          <td className="px-3 py-2.5"><CopyAddr addr={e.walletAddress} /></td>
                          <td className="px-3 py-2.5 text-white/50">{e.username ?? '—'}</td>
                          <td className="px-3 py-2.5 text-white/50">{e.xHandle ? `@${e.xHandle}` : '—'}</td>
                          <td className="px-3 py-2.5 text-white/50">{e.telegramHandle ? `@${e.telegramHandle}` : '—'}</td>
                          <td className="px-3 py-2.5 font-semibold text-white">{fmt(Math.round(e.totalPoints))}</td>
                          <td className="px-3 py-2.5 text-[#1DA1F2]">{fmt(Math.round(e.xPoints))}</td>
                          <td className="px-3 py-2.5 text-[#0088CC]">{fmt(Math.round(e.telegramPoints))}</td>
                          <td className="px-3 py-2.5 text-purple-400">{fmt(Math.round(e.referralBonusPoints))}</td>
                          <td className="px-3 py-2.5 text-purple-300">{e.referralMultiplier > 1 ? `${e.referralMultiplier}×` : '—'}</td>
                          <td className="px-3 py-2.5 text-yellow-400">{e.holderBoost > 1 ? `${e.holderBoost}×` : '—'}</td>
                          <td className="px-3 py-2.5 text-white/50">{sharePct.toFixed(1)}%</td>
                          <td className="px-3 py-2.5 text-white/25 whitespace-nowrap">{new Date(e.joinedAt).toLocaleDateString()}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                <div className="px-4 py-3 border-t border-white/5 text-xs text-white/25 flex items-center gap-2">
                  <Users className="w-3.5 h-3.5" />
                  {leaderboard.length} participants · top {pool.rewardSlots} earn rewards
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── Participants tab ──────────────────────────────────────────────── */}
        {tab === 'participants' && (
          <div className="glass-card overflow-hidden">
            {lbLoading ? (
              <div className="p-12 text-center"><Loader2 className="w-6 h-6 text-white/30 animate-spin mx-auto" /></div>
            ) : leaderboard.length === 0 ? (
              <div className="p-12 text-center text-white/30">No participants yet.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead className="border-b border-white/10 bg-white/[0.02]">
                    <tr>
                      {['Wallet', 'Username', 'X', 'Telegram', 'Joined', 'Submissions', 'Holder Boost', 'Ref Multiplier'].map((h) => (
                        <th key={h} className="px-3 py-3 text-left font-medium text-white/30 uppercase tracking-wider whitespace-nowrap">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {leaderboard.map((e) => (
                      <tr key={e.userId} className="hover:bg-white/[0.02] transition-colors">
                        <td className="px-3 py-2.5"><CopyAddr addr={e.walletAddress} /></td>
                        <td className="px-3 py-2.5 text-white/50">{e.username ?? '—'}</td>
                        <td className="px-3 py-2.5 text-white/50">{e.xHandle ? `@${e.xHandle}` : '—'}</td>
                        <td className="px-3 py-2.5 text-white/50">{e.telegramHandle ? `@${e.telegramHandle}` : '—'}</td>
                        <td className="px-3 py-2.5 text-white/25 whitespace-nowrap">{new Date(e.joinedAt).toLocaleDateString()}</td>
                        <td className="px-3 py-2.5 text-white/60">{e.submissionCount}</td>
                        <td className="px-3 py-2.5">
                          {e.holderBoost > 1
                            ? <span className="text-yellow-400 font-semibold">{e.holderBoost}×</span>
                            : <span className="text-white/20">—</span>}
                        </td>
                        <td className="px-3 py-2.5">
                          {e.referralMultiplier > 1
                            ? <span className="text-purple-400 font-semibold">{e.referralMultiplier}×</span>
                            : <span className="text-white/20">—</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div className="px-4 py-3 border-t border-white/5 text-xs text-white/25 flex items-center gap-2">
                  <Users className="w-3.5 h-3.5" />
                  {leaderboard.length} participants
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── Submissions tab ───────────────────────────────────────────────── */}
        {tab === 'submissions' && (
          <div className="space-y-4">
            {/* Filters */}
            <div className="flex flex-wrap gap-2">
              {/* Platform filter */}
              <div className="flex rounded-xl overflow-hidden border border-white/10">
                {(['ALL', 'X', 'TELEGRAM'] as const).map((p) => (
                  <button key={p} onClick={() => setSubPlatform(p)}
                    className={`px-4 py-2 text-xs font-semibold transition-all ${subPlatform === p ? 'bg-[#0088CC] text-white' : 'text-white/40 hover:text-white hover:bg-white/5'}`}>
                    {p === 'ALL' ? 'All' : p === 'X' ? 'X / Twitter' : 'Telegram'}
                  </button>
                ))}
              </div>

              {/* Status filter */}
              <div className="flex rounded-xl overflow-hidden border border-white/10">
                {(['ALL', 'PENDING', 'VERIFIED', 'REJECTED'] as const).map((s) => (
                  <button key={s} onClick={() => setSubStatus(s)}
                    className={`px-4 py-2 text-xs font-semibold transition-all ${subStatus === s ? 'bg-[#0088CC] text-white' : 'text-white/40 hover:text-white hover:bg-white/5'}`}>
                    {s === 'ALL' ? 'All Status' : s === 'PENDING' ? 'Pending' : s === 'VERIFIED' ? 'Approved' : 'Rejected'}
                  </button>
                ))}
              </div>
            </div>

            <div className="glass-card overflow-hidden">
              {subLoading ? (
                <div className="p-12 text-center"><Loader2 className="w-6 h-6 text-white/30 animate-spin mx-auto" /></div>
              ) : submissions.length === 0 ? (
                <div className="p-12 text-center text-white/30">No submissions yet.</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead className="border-b border-white/10 bg-white/[0.02]">
                      <tr>
                        {['Platform', 'Post', 'Author', 'Views', 'Likes', 'Reposts', 'Points', 'Status', 'Scraped', 'Submitted', 'Actions'].map((h) => (
                          <th key={h} className="px-3 py-3 text-left font-medium text-white/30 uppercase tracking-wider whitespace-nowrap">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5">
                      {submissions.map((s) => (
                        <tr key={s.id} className="hover:bg-white/[0.02] transition-colors">
                          <td className="px-3 py-2.5">
                            <span className={`font-semibold ${s.platform === 'X' ? 'text-white/60' : 'text-[#0088CC]'}`}>
                              {s.platform === 'X' ? 'X' : 'TG'}
                            </span>
                          </td>
                          <td className="px-3 py-2.5">
                            <a href={s.postUrl} target="_blank" rel="noopener noreferrer"
                              className="flex items-center gap-1 text-[#0088CC]/70 hover:text-[#0088CC] transition-colors font-mono">
                              {s.postUrl.replace(/https?:\/\/(www\.)?/, '').slice(0, 28)}…
                              <ExternalLink className="w-2.5 h-2.5 shrink-0" />
                            </a>
                          </td>
                          <td className="px-3 py-2.5">
                            <div>
                              {s.participant.username && <p className="text-white/60">{s.participant.username}</p>}
                              <CopyAddr addr={s.participant.walletAddress} />
                            </div>
                          </td>
                          <td className="px-3 py-2.5 text-white/55">{fmt(s.views)}</td>
                          <td className="px-3 py-2.5 text-white/55">{fmt(s.likes)}</td>
                          <td className="px-3 py-2.5 text-white/55">{fmt(s.reposts)}</td>
                          <td className="px-3 py-2.5 font-semibold text-[#0088CC]">{s.points.toFixed(0)}</td>
                          <td className="px-3 py-2.5">
                            <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full border ${SUB_STATUS_STYLES[s.status]}`}>
                              {s.status === 'VERIFIED' ? 'approved' : s.status.toLowerCase()}
                            </span>
                          </td>
                          <td className="px-3 py-2.5 text-white/25 whitespace-nowrap">
                            {s.lastScrapedAt ? new Date(s.lastScrapedAt).toLocaleDateString() : '—'}
                          </td>
                          <td className="px-3 py-2.5 text-white/25 whitespace-nowrap">
                            {new Date(s.submittedAt).toLocaleDateString()}
                          </td>
                          <td className="px-3 py-2.5">
                            <div className="flex items-center gap-1">
                              {s.status !== 'VERIFIED' && (
                                <button
                                  onClick={() => updateSubStatus(s.id, 'VERIFIED')}
                                  disabled={actionStates[`sub-${s.id}`]}
                                  title="Approve"
                                  className="p-1.5 rounded-lg border border-green-500/30 text-green-400/60 hover:text-green-400 hover:bg-green-500/10 transition-all disabled:opacity-30"
                                >
                                  {actionStates[`sub-${s.id}`]
                                    ? <Loader2 className="w-3 h-3 animate-spin" />
                                    : <ThumbsUp className="w-3 h-3" />}
                                </button>
                              )}
                              {s.status !== 'REJECTED' && (
                                <button
                                  onClick={() => updateSubStatus(s.id, 'REJECTED')}
                                  disabled={actionStates[`sub-${s.id}`]}
                                  title="Reject"
                                  className="p-1.5 rounded-lg border border-red-500/30 text-red-400/60 hover:text-red-400 hover:bg-red-500/10 transition-all disabled:opacity-30"
                                >
                                  {actionStates[`sub-${s.id}`]
                                    ? <Loader2 className="w-3 h-3 animate-spin" />
                                    : <ThumbsDown className="w-3 h-3" />}
                                </button>
                              )}
                              {s.status !== 'PENDING' && (
                                <button
                                  onClick={() => updateSubStatus(s.id, 'PENDING')}
                                  disabled={actionStates[`sub-${s.id}`]}
                                  title="Reset to pending"
                                  className="p-1.5 rounded-lg border border-white/15 text-white/30 hover:text-white hover:border-white/30 transition-all disabled:opacity-30"
                                >
                                  <RefreshCw className="w-3 h-3" />
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <div className="px-4 py-3 border-t border-white/5 text-xs text-white/25 flex items-center gap-2">
                    <FileText className="w-3.5 h-3.5" />
                    {submissions.length} submission{submissions.length !== 1 ? 's' : ''}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── Info tab ──────────────────────────────────────────────────────── */}
        {tab === 'info' && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">

            {/* On-chain */}
            <div className="glass-card p-5 space-y-4">
              <p className="font-semibold text-white text-sm">On-chain</p>
              {[
                { label: 'Contract', value: pool.contractAddress, link: pool.contractAddress ? `https://tonviewer.com/${pool.contractAddress}` : null },
                { label: 'Jetton Master', value: pool.jettonMasterAddress, link: `https://tonviewer.com/${pool.jettonMasterAddress}` },
                { label: 'Owner Wallet', value: pool.project.ownerWalletAddress, link: `https://tonviewer.com/${pool.project.ownerWalletAddress}` },
              ].map((r) => (
                <div key={r.label}>
                  <p className="text-xs text-white/30 mb-0.5">{r.label}</p>
                  {r.value ? (
                    <div className="flex items-center gap-2">
                      <CopyAddr addr={r.value} />
                      {r.link && (
                        <a href={r.link} target="_blank" rel="noopener noreferrer" className="text-white/25 hover:text-[#0088CC] transition-colors">
                          <ExternalLink className="w-3 h-3" />
                        </a>
                      )}
                    </div>
                  ) : (
                    <p className="text-white/25 text-xs">—</p>
                  )}
                </div>
              ))}
            </div>

            {/* Campaign */}
            <div className="glass-card p-5 space-y-4">
              <p className="font-semibold text-white text-sm">Campaign</p>
              <InfoRow label="Type" value={{ both: 'X + Telegram', x: 'X only', telegram: 'Telegram only' }[pool.campaignType] ?? pool.campaignType} />
              <InfoRow label="Duration" value={`${pool.durationDays} days`} />
              <InfoRow label="Reward slots" value={String(pool.rewardSlots)} />
              <InfoRow label="Access fee paid in" value={pool.accessFeePaidIn} />
              {pool.xPostLink && (
                <div>
                  <p className="text-xs text-white/30 mb-0.5">X post</p>
                  <a href={pool.xPostLink} target="_blank" rel="noopener noreferrer"
                    className="text-xs text-[#0088CC] hover:underline truncate block">{pool.xPostLink}</a>
                </div>
              )}
              {pool.telegramPostLink && (
                <div>
                  <p className="text-xs text-white/30 mb-0.5">Telegram post</p>
                  <a href={pool.telegramPostLink} target="_blank" rel="noopener noreferrer"
                    className="text-xs text-[#0088CC] hover:underline truncate block">{pool.telegramPostLink}</a>
                </div>
              )}
            </div>

            {/* Dates */}
            <div className="glass-card p-5 space-y-4">
              <p className="font-semibold text-white text-sm">Dates</p>
              <InfoRow label="Created"   value={new Date(pool.createdAt).toLocaleString()} />
              <InfoRow label="Started"   value={new Date(pool.startDate).toLocaleString()} />
              <InfoRow label="Ends"      value={new Date(pool.endDate).toLocaleString()} />
              <InfoRow label="Days left" value={isLive ? `${daysLeft}d` : pool.status === 'ACTIVE' ? 'Expired' : 'Ended'} />
            </div>

            {/* Thresholds */}
            <div className="glass-card p-5 space-y-4">
              <p className="font-semibold text-white text-sm">Tier Thresholds</p>
              <InfoRow label="Tier 1 (holder boost)" value={pool.tier1Threshold !== '0' ? `${pool.tier1Threshold} ${pool.tokenSymbol}` : 'Not set'} />
              <InfoRow label="Tier 2"                value={pool.tier2Threshold !== '0' ? `${pool.tier2Threshold} ${pool.tokenSymbol}` : 'Not set'} />
              <InfoRow label="Tier 3"                value={pool.tier3Threshold !== '0' ? `${pool.tier3Threshold} ${pool.tokenSymbol}` : 'Not set'} />
            </div>

          </div>
        )}

      </div>

      {/* ── Cancel Modal ──────────────────────────────────────────────────────── */}
      {cancelOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm px-4">
          <div className="glass-modal p-7 max-w-md w-full space-y-5">
            <div>
              <h3 className="text-lg font-bold text-white">Cancel Pool?</h3>
              <p className="text-sm text-white/50 mt-1">
                Tokens split pro-rata. Participants receive their earned share; the project gets the remainder.
              </p>
            </div>

            {cancelPreview ? (
              <div className="space-y-4 max-h-[55vh] overflow-y-auto pr-1">
                <div>
                  <div className="flex justify-between text-xs text-white/40 mb-1.5">
                    <span>Day {cancelPreview.daysElapsed} of {cancelPreview.totalDays}</span>
                    <span>{Math.round(cancelPreview.daysElapsed / cancelPreview.totalDays * 100)}% elapsed</span>
                  </div>
                  <div className="h-1.5 bg-white/10 rounded-full overflow-hidden">
                    <div className="h-full bg-[#0088CC] rounded-full" style={{ width: `${Math.round(cancelPreview.daysElapsed / cancelPreview.totalDays * 100)}%` }} />
                  </div>
                </div>
                <div className="rounded-xl border border-white/10 overflow-hidden text-sm">
                  <div className="flex justify-between px-4 py-3 bg-[#0088CC]/5 border-b border-white/10">
                    <span className="text-white/60">Participants receive</span>
                    <span className="text-[#0088CC] font-semibold">{cancelPreview.participantTokens} {pool.tokenSymbol}</span>
                  </div>
                  <div className="flex justify-between px-4 py-3">
                    <span className="text-white/60">Project refund</span>
                    <span className="text-white font-semibold">{cancelPreview.refundTokens} {pool.tokenSymbol}</span>
                  </div>
                </div>
                {cancelWinners.length > 0 && (
                  <div>
                    <p className="text-xs text-white/35 uppercase tracking-wider font-medium mb-2">Winner breakdown</p>
                    <div className="rounded-xl border border-white/10 overflow-hidden">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="border-b border-white/10 bg-white/[0.02]">
                            {['#', 'Wallet', 'Points', 'Receives'].map((h) => (
                              <th key={h} className="px-3 py-2 text-left text-white/30 font-medium">{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-white/5">
                          {cancelWinners.map((w) => (
                            <tr key={w.walletAddress}>
                              <td className="px-3 py-2 text-white/35">{w.rank}</td>
                              <td className="px-3 py-2 font-mono text-white/55">{shortAddr(w.walletAddress)}</td>
                              <td className="px-3 py-2 text-right text-white/55">{w.totalPoints.toLocaleString()}</td>
                              <td className="px-3 py-2 text-right text-[#0088CC] font-semibold">{w.proRataAmount} {pool.tokenSymbol}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
                <p className="text-xs text-white/25">Daily rate: {cancelPreview.dailyRate} {pool.tokenSymbol}/day</p>
              </div>
            ) : (
              <div className="py-8 flex items-center justify-center gap-2 text-white/30 text-sm">
                <Loader2 className="w-4 h-4 animate-spin" />Loading preview…
              </div>
            )}

            <div className="flex gap-3 pt-1">
              <button onClick={() => setCancelOpen(false)} className="btn-secondary flex-1">Keep Pool</button>
              <button onClick={confirmCancel} disabled={cancelLoading || !cancelPreview}
                className="flex-1 bg-red-500/20 hover:bg-red-500/30 border border-red-500/40 text-red-400 font-semibold px-5 py-2.5 rounded-xl transition-all disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2 text-sm">
                {cancelLoading && <Loader2 className="w-4 h-4 animate-spin" />}
                Confirm Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between items-center">
      <span className="text-xs text-white/35">{label}</span>
      <span className="text-sm text-white/70 font-medium">{value}</span>
    </div>
  );
}
