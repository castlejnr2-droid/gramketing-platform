'use client';
import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { useTonWallet } from '@tonconnect/ui-react';
import { TonConnectButton } from '@tonconnect/ui-react';
import {
  Shield, RefreshCw, XCircle, Coins, Users, Loader2,
  AlertCircle, CheckCircle, LayoutList, Ban, TrendingUp,
  StopCircle, ExternalLink, FileText, Clock, Zap, WifiOff,
  Activity,
} from 'lucide-react';

// ── Types ─────────────────────────────────────────────────────────────────────

interface Summary {
  pools: { total: number; active: number; ended: number; distributed: number };
  participants: number;
  submissions: number;
  needsAction: NeedsActionPool[];
  revenue: {
    totalUsd: number;
    ton:   { tokens: number; usd: number; recentRecords: RevenueRecord[] };
    mgram: { tokens: number; usd: number; recentRecords: RevenueRecord[] };
  };
  bannedCount: number;
}

interface NeedsActionPool {
  id: string;
  status: 'ACTIVE' | 'ENDED';
  project: { name: string; logoUrl: string | null };
  tokenSymbol: string;
  totalReward: string;
  endDate: string;
  participantCount: number;
}

interface RevenueRecord {
  id: string;
  tokenAmount: string;
  usdValueAtTime: number;
  createdAt: string;
}

interface BannedRow {
  id: string;
  walletAddress: string;
  reason?: string;
  telegramChannel?: string;
  xLink?: string;
  bannedAt: string;
}

interface AdminLogEntry {
  id: string;
  action: string;
  level: 'info' | 'warn' | 'error';
  message: string;
  details?: Record<string, unknown> | null;
  createdAt: string;
  pool?: { id: string; tokenSymbol: string; project: { name: string } } | null;
}

interface ProRataPreview {
  daysElapsed: number; daysRemaining: number; totalDays: number;
  dailyRate: number; participantTokens: number; refundTokens: number;
}
interface WinnerPreview {
  rank: number; walletAddress: string; totalPoints: number; proRataAmount: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const STATUS_STYLES: Record<string, string> = {
  ACTIVE:      'bg-green-500/15 text-green-400 border-green-500/25',
  ENDED:       'bg-yellow-500/15 text-yellow-400 border-yellow-500/25',
  DISTRIBUTED: 'bg-white/10 text-white/40 border-white/10',
};

function fmt(n: number) { return n.toLocaleString(); }
function shortAddr(a: string) { return `${a.slice(0, 6)}…${a.slice(-4)}`; }

function Stat({
  label, value, sub, icon, accent = false,
}: {
  label: string; value: string; sub?: string; icon: React.ReactNode; accent?: boolean;
}) {
  return (
    <div className="glass-card p-5 flex items-start gap-4">
      <div className={`p-2.5 rounded-xl ${accent ? 'bg-[#0088CC]/15' : 'bg-white/5'}`}>
        {icon}
      </div>
      <div className="min-w-0">
        <p className="text-xs text-white/35 mb-0.5 uppercase tracking-wide">{label}</p>
        <p className="text-xl font-bold text-white leading-none">{value}</p>
        {sub && <p className="text-xs text-white/35 mt-1">{sub}</p>}
      </div>
    </div>
  );
}

function NavCard({
  href, icon, title, description, badge,
}: {
  href: string; icon: React.ReactNode; title: string; description: string; badge?: number;
}) {
  return (
    <Link href={href} className="glass-card p-5 flex items-center gap-4 hover:border-[#0088CC]/30 hover:bg-[#0088CC]/[0.03] transition-all group">
      <div className="p-3 rounded-xl bg-white/5 group-hover:bg-[#0088CC]/15 transition-colors shrink-0">
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-semibold text-white text-sm">{title}</p>
        <p className="text-xs text-white/40 mt-0.5">{description}</p>
      </div>
      {badge !== undefined && badge > 0 && (
        <span className="shrink-0 bg-yellow-500/20 text-yellow-400 border border-yellow-500/25 text-xs font-bold px-2 py-0.5 rounded-full">
          {badge}
        </span>
      )}
      <span className="text-white/20 group-hover:text-[#0088CC] transition-colors">→</span>
    </Link>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function AdminPage() {
  const wallet = useTonWallet();

  const [summary, setSummary]       = useState<Summary | null>(null);
  const [bannedList, setBannedList] = useState<BannedRow[]>([]);
  const [loading, setLoading]       = useState(true);
  const [isAdmin, setIsAdmin]       = useState(false);
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  // Ban form
  const [banWallet, setBanWallet]     = useState('');
  const [banReason, setBanReason]     = useState('');
  const [banTelegram, setBanTelegram] = useState('');
  const [banX, setBanX]               = useState('');
  const [banLoading, setBanLoading]   = useState(false);
  const [showBanned, setShowBanned]   = useState(false);

  // Action states
  const [actionStates, setActionStates] = useState<Record<string, boolean>>({});
  const [feedback, setFeedback]         = useState<{ msg: string; ok: boolean } | null>(null);

  // X token status
  const [tokenStatus, setTokenStatus] = useState<{
    xToken: { configured: boolean; valid: boolean; error: string | null };
    expiredPostCount: number;
  } | null>(null);

  // Admin logs
  const [adminLogs, setAdminLogs]       = useState<AdminLogEntry[]>([]);
  const [logsLoading, setLogsLoading]   = useState(false);

  // Cancel modal
  const [cancelModal, setCancelModal]   = useState<{ poolId: string; tokenSymbol: string } | null>(null);
  const [cancelPreview, setCancelPrev]  = useState<ProRataPreview | null>(null);
  const [cancelWinners, setCancelWins]  = useState<WinnerPreview[]>([]);
  const [cancelLoading, setCancelLoad]  = useState(false);

  // ── Fetch ───────────────────────────────────────────────────────────────────

  const fetchLogs = useCallback(async () => {
    setLogsLoading(true);
    try {
      const res = await fetch('/api/admin/logs?limit=5', { credentials: 'include' });
      const d = await res.json();
      setAdminLogs(d.logs ?? []);
    } catch { /* ignore */ } finally {
      setLogsLoading(false);
    }
  }, []);

  const fetchData = useCallback(async (showSpinner = true) => {
    if (showSpinner) setLoading(true); else setRefreshing(true);
    try {
      const [sumRes, banRes] = await Promise.all([
        fetch('/api/admin/summary', { credentials: 'include' }),
        fetch('/api/admin/ban',     { credentials: 'include' }),
      ]);
      const [sumData, banData] = await Promise.all([sumRes.json(), banRes.json()]);
      if (sumData.error === 'Unauthorized') { setIsAdmin(false); return; }
      setIsAdmin(true);
      setSummary(sumData);
      setBannedList(banData.banned ?? []);
      setLastRefreshed(new Date());

      // Fetch X token status in background
      fetch('/api/admin/token-status', { credentials: 'include' })
        .then((r) => r.json())
        .then(setTokenStatus)
        .catch(() => {});

      // Always refresh activity feed
      fetchLogs();
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [fetchLogs]);

  useEffect(() => {
    if (!wallet) { setLoading(false); return; }
    fetchData();
  }, [wallet, fetchData]);

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

  const handleEnd = (poolId: string) =>
    doPost(`end-${poolId}`, '/api/admin/end-pool', { poolId }, 'Pool ended.', () => {
      setSummary((s) => s ? {
        ...s,
        pools: { ...s.pools, active: s.pools.active - 1, ended: s.pools.ended + 1 },
        needsAction: s.needsAction.map((p) => p.id === poolId ? { ...p, status: 'ENDED' as const } : p),
      } : s);
    });

  const handleDistribute = (poolId: string) =>
    doPost(`dist-${poolId}`, '/api/admin/distribute', { poolId }, 'Distribution triggered!', () => {
      setSummary((s) => s ? {
        ...s,
        pools: { ...s.pools, ended: s.pools.ended - 1, distributed: s.pools.distributed + 1 },
        needsAction: s.needsAction.filter((p) => p.id !== poolId),
      } : s);
    });

  const handleRescrape = (poolId: string) =>
    doPost(`scrape-${poolId}`, '/api/admin/rescrape', { poolId }, 'Re-scrape triggered!');

  const openCancel = async (pool: NeedsActionPool) => {
    setCancelModal({ poolId: pool.id, tokenSymbol: pool.tokenSymbol });
    setCancelPrev(null); setCancelWins([]);
    const res = await fetch(`/api/admin/cancel-pool?poolId=${pool.id}`, { credentials: 'include' });
    const d = await res.json();
    setCancelPrev(d.preview ?? null);
    setCancelWins(d.winners ?? []);
  };

  const confirmCancel = async () => {
    if (!cancelModal) return;
    setCancelLoad(true);
    try {
      const res = await fetch('/api/admin/cancel-pool', { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify({ poolId: cancelModal.poolId }) });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error ?? 'Failed');
      setFeedback({ msg: 'Pool cancelled with pro-rata split.', ok: true });
      setSummary((s) => s ? { ...s, needsAction: s.needsAction.filter((p) => p.id !== cancelModal.poolId) } : s);
      setCancelModal(null);
    } catch (e: unknown) {
      setFeedback({ msg: e instanceof Error ? e.message : 'Cancel failed', ok: false });
    } finally {
      setCancelLoad(false);
    }
  };

  const handleBan = async () => {
    if (!banWallet.trim()) return;
    setBanLoading(true); setFeedback(null);
    try {
      const res = await fetch('/api/admin/ban', { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify({ walletAddress: banWallet, reason: banReason, telegramChannel: banTelegram || undefined, xLink: banX || undefined }) });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error ?? 'Failed');
      setFeedback({ msg: `Banned ${banWallet}`, ok: true });
      setBanWallet(''); setBanReason(''); setBanTelegram(''); setBanX('');
      setSummary((s) => s ? { ...s, bannedCount: s.bannedCount + 1 } : s);
      const banRes = await fetch('/api/admin/ban', { credentials: 'include' });
      const banData = await banRes.json();
      setBannedList(banData.banned ?? []);
    } catch (e: unknown) {
      setFeedback({ msg: e instanceof Error ? e.message : 'Ban failed', ok: false });
    } finally {
      setBanLoading(false);
    }
  };

  // ── Guards ───────────────────────────────────────────────────────────────────

  if (!wallet) return (
    <div className="min-h-screen pt-24 px-4 flex items-center justify-center">
      <div className="glass-card p-10 text-center max-w-sm">
        <Shield className="w-10 h-10 mx-auto text-[#0088CC]/50 mb-4" />
        <h1 className="text-xl font-bold text-white mb-3">Admin Panel</h1>
        <p className="text-white/50 text-sm mb-6">Connect your admin wallet to access.</p>
        <TonConnectButton />
      </div>
    </div>
  );

  if (loading) return (
    <div className="min-h-screen pt-24 px-4 flex items-center justify-center">
      <div className="flex flex-col items-center gap-3 text-white/30">
        <Loader2 className="w-8 h-8 animate-spin" />
        <p className="text-sm">Loading dashboard…</p>
      </div>
    </div>
  );

  if (!isAdmin) return (
    <div className="min-h-screen pt-24 px-4 flex items-center justify-center">
      <div className="glass-card p-10 text-center text-red-400 max-w-sm">
        <AlertCircle className="w-10 h-10 mx-auto mb-3" />
        <p className="font-semibold">Access Denied</p>
        <p className="text-sm text-white/40 mt-2">This wallet is not the platform admin.</p>
      </div>
    </div>
  );

  const s = summary!;
  const needsActionCount = s.needsAction.length;

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen pt-24 pb-24 px-4">
      <div className="max-w-7xl mx-auto">

        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-[#0088CC]/15">
              <Shield className="w-5 h-5 text-[#0088CC]" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-white">Admin Dashboard</h1>
              {lastRefreshed && (
                <p className="text-xs text-white/30 mt-0.5">
                  Updated {lastRefreshed.toLocaleTimeString()}
                </p>
              )}
            </div>
          </div>
          <button
            onClick={() => fetchData(false)}
            disabled={refreshing}
            className="flex items-center gap-2 px-4 py-2 rounded-xl border border-white/10 text-white/50 hover:text-white hover:border-white/25 text-sm transition-all disabled:opacity-40"
          >
            <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>

        {/* Feedback */}
        {feedback && (
          <div className={`mb-6 p-3.5 rounded-xl flex items-center gap-2 text-sm border ${feedback.ok ? 'bg-green-500/10 border-green-500/20 text-green-400' : 'bg-red-500/10 border-red-500/20 text-red-400'}`}>
            {feedback.ok ? <CheckCircle className="w-4 h-4 shrink-0" /> : <AlertCircle className="w-4 h-4 shrink-0" />}
            {feedback.msg}
            <button onClick={() => setFeedback(null)} className="ml-auto opacity-50 hover:opacity-100">✕</button>
          </div>
        )}

        {/* X Token Warning */}
        {tokenStatus && (!tokenStatus.xToken.valid || !tokenStatus.xToken.configured || tokenStatus.expiredPostCount > 0) && (
          <div className="mb-6 p-4 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-start gap-3">
            <WifiOff className="w-5 h-5 text-amber-400 mt-0.5 flex-shrink-0" />
            <div className="flex-1">
              <p className="text-sm font-semibold text-amber-400">X (Twitter) Token Issue Detected</p>
              <p className="text-xs text-white/50 mt-1">
                {!tokenStatus.xToken.configured
                  ? 'TWITTER_BEARER_TOKEN is not configured in environment variables.'
                  : tokenStatus.xToken.error
                  ? tokenStatus.xToken.error
                  : `${tokenStatus.expiredPostCount} post(s) flagged with TOKEN_EXPIRED scrape errors.`}
              </p>
              <p className="text-xs text-white/40 mt-1">
                X post metrics will not update until the bearer token is refreshed. Update{' '}
                <code className="bg-white/5 px-1 rounded text-amber-300">TWITTER_BEARER_TOKEN</code>{' '}
                in your environment and redeploy.
              </p>
            </div>
          </div>
        )}

        {/* KPI strip */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-8">
          <Stat label="Total Pools"    value={fmt(s.pools.total)}       icon={<LayoutList className="w-5 h-5 text-white/50" />} />
          <Stat label="Active"         value={fmt(s.pools.active)}      icon={<Zap className="w-5 h-5 text-green-400" />} sub={`${s.pools.ended} ended`} />
          <Stat label="Distributed"    value={fmt(s.pools.distributed)} icon={<Coins className="w-5 h-5 text-yellow-400" />} />
          <Stat label="Participants"   value={fmt(s.participants)}      icon={<Users className="w-5 h-5 text-[#0088CC]" />} sub={`${fmt(s.submissions)} submissions`} accent />
          <Stat label="Revenue"        value={`$${s.revenue.totalUsd.toFixed(0)}`} icon={<TrendingUp className="w-5 h-5 text-purple-400" />} sub={`${s.revenue.ton.tokens.toFixed(2)} TON`} />
          <Stat label="Banned"         value={fmt(s.bannedCount)}       icon={<Ban className="w-5 h-5 text-red-400/70" />} />
        </div>

        {/* Navigation cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 mb-10">
          <NavCard
            href="/admin/pools"
            icon={<LayoutList className="w-5 h-5 text-[#0088CC]" />}
            title="Pool Manager"
            description="View, filter, sort and action all pools"
            badge={needsActionCount}
          />
          <NavCard
            href="/admin/submissions"
            icon={<FileText className="w-5 h-5 text-purple-400" />}
            title="Submissions"
            description="Review posts, filter by pool or platform, re-scrape"
            badge={s.submissions}
          />
          <NavCard
            href="#ban"
            icon={<Ban className="w-5 h-5 text-red-400" />}
            title="Ban Manager"
            description="Ban marketers and manage the ban list"
            badge={s.bannedCount}
          />
        </div>

        {/* Needs Action */}
        {needsActionCount > 0 && (
          <section className="mb-10">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-yellow-400" />
                <h2 className="font-semibold text-white">Needs Action</h2>
                <span className="text-xs bg-yellow-500/15 text-yellow-400 border border-yellow-500/25 px-2 py-0.5 rounded-full font-semibold">
                  {needsActionCount}
                </span>
              </div>
              <Link href="/admin/pools" className="text-xs text-white/40 hover:text-[#0088CC] transition-colors">
                All pools →
              </Link>
            </div>
            <div className="glass-card overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="border-b border-white/10 bg-white/[0.02]">
                    <tr>
                      {['Project', 'Token', 'Reward', 'Participants', 'Ended', 'Status', 'Actions'].map((h) => (
                        <th key={h} className="px-4 py-3 text-left text-xs font-medium text-white/35 uppercase tracking-wider">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {s.needsAction.map((pool) => (
                      <tr
                        key={pool.id}
                        className="hover:bg-white/[0.02] transition-colors cursor-pointer"
                        onClick={(e) => { if ((e.target as HTMLElement).closest('button,a')) return; window.location.href = `/admin/pools/${pool.id}`; }}
                      >
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            {pool.project.logoUrl ? (
                              <img src={pool.project.logoUrl} alt="" className="w-7 h-7 rounded-full object-cover shrink-0 border border-white/10" />
                            ) : (
                              <div className="w-7 h-7 rounded-full bg-[#0088CC]/20 flex items-center justify-center shrink-0 text-[10px] font-bold text-[#0088CC]">
                                {pool.tokenSymbol[0]}
                              </div>
                            )}
                            <span className="font-medium text-white">{pool.project.name}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3 font-mono text-xs text-[#0088CC]">${pool.tokenSymbol}</td>
                        <td className="px-4 py-3 text-white/70">
                          {parseFloat(pool.totalReward).toLocaleString()}
                          <span className="text-white/30 text-xs ml-1">{pool.tokenSymbol}</span>
                        </td>
                        <td className="px-4 py-3 text-white/60">{fmt(pool.participantCount)}</td>
                        <td className="px-4 py-3 text-white/40 text-xs whitespace-nowrap">{new Date(pool.endDate).toLocaleDateString()}</td>
                        <td className="px-4 py-3">
                          <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${STATUS_STYLES[pool.status]}`}>{pool.status}</span>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            {pool.status === 'ACTIVE' && (
                              <ActionBtn label="End" icon={<StopCircle className="w-3 h-3" />} onClick={() => handleEnd(pool.id)} loading={actionStates[`end-${pool.id}`]} />
                            )}
                            {pool.status === 'ENDED' && (
                              <ActionBtn label="Distribute" icon={<Coins className="w-3 h-3" />} onClick={() => handleDistribute(pool.id)} loading={actionStates[`dist-${pool.id}`]} variant="primary" />
                            )}
                            <ActionBtn label="Cancel" icon={<XCircle className="w-3 h-3" />} onClick={() => openCancel(pool)} variant="danger" />
                            <ActionBtn label="Re-scrape" icon={<RefreshCw className="w-3 h-3" />} onClick={() => handleRescrape(pool.id)} loading={actionStates[`scrape-${pool.id}`]} />
                            <Link href={`/admin/pools/${pool.id}`} className="flex items-center px-2 py-1.5 rounded-lg border border-white/15 text-white/35 hover:text-white hover:border-white/30 text-xs transition-all">
                              <ExternalLink className="w-3 h-3" />
                            </Link>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </section>
        )}

        {/* Revenue */}
        <section className="mb-10">
          <div className="flex items-center gap-2 mb-4">
            <TrendingUp className="w-4 h-4 text-[#0088CC]" />
            <h2 className="font-semibold text-white">Revenue</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

            {/* TON */}
            <div className="glass-card p-6">
              <div className="flex items-start justify-between mb-4">
                <div>
                  <p className="text-xs text-white/35 uppercase tracking-wider mb-1">TON Revenue</p>
                  <p className="text-3xl font-bold text-[#0088CC]">{s.revenue.ton.tokens.toFixed(4)} <span className="text-lg font-semibold">TON</span></p>
                  <p className="text-sm text-white/35 mt-1">≈ ${s.revenue.ton.usd.toFixed(2)} USD</p>
                </div>
              </div>
              {s.revenue.ton.recentRecords.length > 0 ? (
                <div className="space-y-2 pt-2 border-t border-white/8">
                  {s.revenue.ton.recentRecords.map((r) => (
                    <div key={r.id} className="flex items-center justify-between text-xs">
                      <span className="text-white/30">{new Date(r.createdAt).toLocaleDateString()}</span>
                      <span className="text-white/60">{parseFloat(r.tokenAmount).toFixed(4)} TON</span>
                      <span className="text-white/40">${r.usdValueAtTime.toFixed(2)}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-white/25 pt-3 border-t border-white/8">No transactions yet.</p>
              )}
            </div>

            {/* mGRAM */}
            <div className="glass-card p-6">
              <div className="flex items-start justify-between mb-4">
                <div>
                  <p className="text-xs text-white/35 uppercase tracking-wider mb-1">$mGRAM Revenue</p>
                  <p className="text-3xl font-bold text-purple-400">{s.revenue.mgram.tokens.toFixed(2)} <span className="text-lg font-semibold">mGRAM</span></p>
                  <p className="text-sm text-white/35 mt-1">≈ ${s.revenue.mgram.usd.toFixed(2)} USD</p>
                </div>
              </div>
              {s.revenue.mgram.recentRecords.length > 0 ? (
                <div className="space-y-2 pt-2 border-t border-white/8">
                  {s.revenue.mgram.recentRecords.map((r) => (
                    <div key={r.id} className="flex items-center justify-between text-xs">
                      <span className="text-white/30">{new Date(r.createdAt).toLocaleDateString()}</span>
                      <span className="text-purple-400/70">{parseFloat(r.tokenAmount).toFixed(2)} mGRAM</span>
                      <span className="text-white/40">${r.usdValueAtTime.toFixed(2)}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-white/25 pt-3 border-t border-white/8">No $mGRAM revenue yet — token not launched.</p>
              )}
            </div>
          </div>
        </section>

        {/* Activity Feed */}
        <section className="mb-10">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Activity className="w-4 h-4 text-[#0088CC]" />
              <h2 className="font-semibold text-white">Recent Activity</h2>
              <span className="text-white/30 text-xs">last 5 events</span>
            </div>
            <button
              onClick={fetchLogs}
              disabled={logsLoading}
              className="flex items-center gap-1.5 text-xs text-white/40 hover:text-white transition-colors disabled:opacity-30"
            >
              <RefreshCw className={`w-3 h-3 ${logsLoading ? 'animate-spin' : ''}`} />
              Refresh
            </button>
          </div>
          <div className="glass-card overflow-hidden">
            {logsLoading && adminLogs.length === 0 ? (
              <div className="flex items-center justify-center gap-2 py-8 text-white/25 text-sm">
                <Loader2 className="w-4 h-4 animate-spin" /> Loading…
              </div>
            ) : adminLogs.length === 0 ? (
              <p className="text-xs text-white/25 px-4 py-6">No activity yet.</p>
            ) : (
              <div className="divide-y divide-white/5">
                {adminLogs.map((log) => {
                  const levelCls =
                    log.level === 'error' ? 'bg-red-500/[0.04] border-l-2 border-red-500/40' :
                    log.level === 'warn'  ? 'bg-amber-500/[0.03] border-l-2 border-amber-500/30' :
                    'border-l-2 border-transparent';
                  return (
                    <div key={log.id} className={`px-4 py-3 ${levelCls}`}>
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                            <span className={`text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded ${
                              log.level === 'error' ? 'bg-red-500/20 text-red-400' :
                              log.level === 'warn'  ? 'bg-amber-500/20 text-amber-400' :
                              'bg-white/8 text-white/40'
                            }`}>{log.level}</span>
                            <span className="text-[10px] font-mono text-white/30 bg-white/5 px-1.5 py-0.5 rounded">{log.action}</span>
                            {log.pool && (
                              <Link href={`/admin/pools/${log.pool.id}`} className="text-[10px] text-[#0088CC]/70 hover:text-[#0088CC] transition-colors">
                                {log.pool.project.name} (${log.pool.tokenSymbol})
                              </Link>
                            )}
                          </div>
                          <p className="text-xs text-white/60 leading-relaxed">{log.message}</p>
                        </div>
                        <span className="text-[10px] text-white/25 whitespace-nowrap shrink-0">
                          {new Date(log.createdAt).toLocaleString()}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </section>

        {/* Ban tool */}
        <section id="ban" className="mb-10">
          <div className="flex items-center gap-2 mb-4">
            <Ban className="w-4 h-4 text-red-400" />
            <h2 className="font-semibold text-white">Ban Marketer</h2>
          </div>
          <div className="glass-card p-6 max-w-xl">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="sm:col-span-2">
                <label className="block text-xs text-white/50 mb-1.5 uppercase tracking-wide">Wallet Address</label>
                <input value={banWallet} onChange={(e) => setBanWallet(e.target.value)} placeholder="EQ…"
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white placeholder-white/20 focus:outline-none focus:border-red-500/40 font-mono" />
              </div>
              <div className="sm:col-span-2">
                <label className="block text-xs text-white/50 mb-1.5 uppercase tracking-wide">Reason</label>
                <input value={banReason} onChange={(e) => setBanReason(e.target.value)} placeholder="Spam, fake views, etc."
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white placeholder-white/20 focus:outline-none focus:border-red-500/40" />
              </div>
              <div>
                <label className="block text-xs text-white/50 mb-1.5 uppercase tracking-wide">Telegram <span className="text-white/25 normal-case">(optional)</span></label>
                <input value={banTelegram} onChange={(e) => setBanTelegram(e.target.value)} placeholder="https://t.me/…"
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white placeholder-white/20 focus:outline-none focus:border-red-500/40" />
              </div>
              <div>
                <label className="block text-xs text-white/50 mb-1.5 uppercase tracking-wide">X / Twitter <span className="text-white/25 normal-case">(optional)</span></label>
                <input value={banX} onChange={(e) => setBanX(e.target.value)} placeholder="https://x.com/…"
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white placeholder-white/20 focus:outline-none focus:border-red-500/40" />
              </div>
            </div>
            <button onClick={handleBan} disabled={banLoading || !banWallet.trim()}
              className="mt-5 flex items-center gap-2 px-5 py-2.5 rounded-xl bg-red-500/15 hover:bg-red-500/25 text-red-400 border border-red-500/25 text-sm font-medium transition-all disabled:opacity-40 disabled:cursor-not-allowed">
              {banLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Ban className="w-4 h-4" />}
              Ban Marketer
            </button>
          </div>
        </section>

        {/* Banned list */}
        {bannedList.length > 0 && (
          <section>
            <button
              onClick={() => setShowBanned((v) => !v)}
              className="flex items-center gap-2 mb-4 text-sm text-white/50 hover:text-white transition-colors"
            >
              <XCircle className="w-4 h-4 text-red-400/60" />
              <span className="font-semibold text-white">Banned Marketers</span>
              <span className="text-white/30">({bannedList.length})</span>
              <span className="text-white/25 text-xs ml-1">{showBanned ? '▲ hide' : '▼ show'}</span>
            </button>
            {showBanned && (
              <div className="glass-card overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead className="border-b border-white/10 bg-white/[0.02]">
                      <tr>
                        {['Wallet', 'Reason', 'Telegram', 'X', 'Banned'].map((h) => (
                          <th key={h} className="px-4 py-3 text-left font-medium text-white/30 uppercase tracking-wider">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5">
                      {bannedList.map((b) => (
                        <tr key={b.id} className="hover:bg-white/[0.02]">
                          <td className="px-4 py-2.5 font-mono text-red-400/70">{shortAddr(b.walletAddress)}</td>
                          <td className="px-4 py-2.5 text-white/45">{b.reason ?? '—'}</td>
                          <td className="px-4 py-2.5">
                            {b.telegramChannel
                              ? <a href={b.telegramChannel} target="_blank" rel="noopener noreferrer" className="text-[#0088CC] hover:underline">{b.telegramChannel.replace('https://', '')}</a>
                              : <span className="text-white/20">—</span>}
                          </td>
                          <td className="px-4 py-2.5">
                            {b.xLink
                              ? <a href={b.xLink} target="_blank" rel="noopener noreferrer" className="text-white/50 hover:underline">{b.xLink.replace('https://', '')}</a>
                              : <span className="text-white/20">—</span>}
                          </td>
                          <td className="px-4 py-2.5 text-white/25 whitespace-nowrap">{new Date(b.bannedAt).toLocaleDateString()}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </section>
        )}
      </div>

      {/* ── Cancel Modal ──────────────────────────────────────────────────────── */}
      {cancelModal && (
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
                    <span className="text-[#0088CC] font-semibold">{cancelPreview.participantTokens} {cancelModal.tokenSymbol}</span>
                  </div>
                  <div className="flex justify-between px-4 py-3">
                    <span className="text-white/60">Project refund</span>
                    <span className="text-white font-semibold">{cancelPreview.refundTokens} {cancelModal.tokenSymbol}</span>
                  </div>
                </div>
                {cancelWinners.length > 0 && (
                  <div>
                    <p className="text-xs text-white/35 uppercase tracking-wider font-medium mb-2">Winner breakdown</p>
                    <div className="rounded-xl border border-white/10 overflow-hidden">
                      <table className="w-full text-xs">
                        <thead><tr className="border-b border-white/10 bg-white/[0.02]">
                          {['#', 'Wallet', 'Points', 'Receives'].map((h) => <th key={h} className="px-3 py-2 text-left text-white/30 font-medium">{h}</th>)}
                        </tr></thead>
                        <tbody className="divide-y divide-white/5">
                          {cancelWinners.map((w) => (
                            <tr key={w.walletAddress}>
                              <td className="px-3 py-2 text-white/35">{w.rank}</td>
                              <td className="px-3 py-2 font-mono text-white/55">{shortAddr(w.walletAddress)}</td>
                              <td className="px-3 py-2 text-right text-white/55">{w.totalPoints.toLocaleString()}</td>
                              <td className="px-3 py-2 text-right text-[#0088CC] font-semibold">{w.proRataAmount} {cancelModal.tokenSymbol}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
                <p className="text-xs text-white/25">Daily rate: {cancelPreview.dailyRate} {cancelModal.tokenSymbol}/day</p>
              </div>
            ) : (
              <div className="py-8 flex items-center justify-center gap-2 text-white/30 text-sm">
                <Loader2 className="w-4 h-4 animate-spin" />Loading preview…
              </div>
            )}
            <div className="flex gap-3 pt-1">
              <button onClick={() => setCancelModal(null)} className="btn-secondary flex-1">Keep Pool</button>
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

// ── Shared action button ───────────────────────────────────────────────────────

function ActionBtn({
  label, icon, onClick, variant = 'ghost', loading = false,
}: {
  label: string; icon: React.ReactNode; onClick: () => void;
  variant?: 'primary' | 'danger' | 'ghost'; loading?: boolean;
}) {
  const cls = {
    primary: 'text-[#0088CC] border-[#0088CC]/30 hover:bg-[#0088CC]/10',
    danger:  'text-red-400 border-red-500/30 hover:bg-red-500/10',
    ghost:   'text-white/50 border-white/15 hover:text-white hover:border-white/30',
  }[variant];
  return (
    <button onClick={onClick} disabled={loading}
      className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg border text-xs font-medium transition-all disabled:opacity-30 disabled:cursor-not-allowed ${cls}`}>
      {loading ? <Loader2 className="w-3 h-3 animate-spin" /> : icon}
      <span className="hidden sm:inline">{label}</span>
    </button>
  );
}
