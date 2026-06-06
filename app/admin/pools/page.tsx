'use client';
import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { useTonWallet } from '@tonconnect/ui-react';
import { TonConnectButton } from '@tonconnect/ui-react';
import {
  Shield,
  Search,
  RefreshCw,
  XCircle,
  Coins,
  Users,
  Loader2,
  AlertCircle,
  CheckCircle,
  ArrowLeft,
  ExternalLink,
  ChevronUp,
  ChevronDown,
  StopCircle,
  LayoutList,
} from 'lucide-react';

// ── Types ─────────────────────────────────────────────────────────────────────

interface PoolRow {
  id: string;
  status: 'ACTIVE' | 'ENDED' | 'DISTRIBUTED';
  project: { name: string; logoUrl: string | null; ownerWalletAddress: string };
  tokenSymbol: string;
  totalReward: string;
  durationDays: number;
  rewardSlots: number;
  campaignType: string;
  accessFeePaidIn: string;
  contractAddress: string | null;
  startDate: string;
  endDate: string;
  createdAt: string;
  participantCount: number;
  submissionCount: number;
}

interface ProRataPreview {
  daysElapsed: number;
  daysRemaining: number;
  totalDays: number;
  dailyRate: number;
  participantTokens: number;
  refundTokens: number;
}

interface WinnerPreview {
  rank: number;
  walletAddress: string;
  totalPoints: number;
  proRataAmount: string;
}

type SortKey = 'createdAt' | 'endDate' | 'participantCount' | 'totalReward' | 'status';
type SortDir = 'asc' | 'desc';
type StatusFilter = 'ALL' | 'ACTIVE' | 'ENDED' | 'DISTRIBUTED';

// ── Helpers ───────────────────────────────────────────────────────────────────

const STATUS_STYLES: Record<string, string> = {
  ACTIVE: 'bg-green-500/15 text-green-400 border-green-500/25',
  ENDED: 'bg-yellow-500/15 text-yellow-400 border-yellow-500/25',
  DISTRIBUTED: 'bg-white/10 text-white/40 border-white/10',
};

const CAMPAIGN_LABEL: Record<string, string> = {
  x: 'X',
  telegram: 'Telegram',
  both: 'X + TG',
};

function fmt(n: number) {
  return n.toLocaleString();
}

function shortAddr(addr: string) {
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

// ── Small components ──────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  return (
    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${STATUS_STYLES[status] ?? 'bg-white/5 text-white/40 border-white/10'}`}>
      {status}
    </span>
  );
}

function ActionBtn({
  label, icon, onClick, variant = 'ghost', loading = false, disabled = false,
}: {
  label: string; icon: React.ReactNode; onClick: () => void;
  variant?: 'primary' | 'danger' | 'ghost'; loading?: boolean; disabled?: boolean;
}) {
  const cls = {
    primary: 'text-[#0088CC] border-[#0088CC]/30 hover:bg-[#0088CC]/10',
    danger:  'text-red-400 border-red-500/30 hover:bg-red-500/10',
    ghost:   'text-white/50 border-white/15 hover:text-white hover:border-white/30',
  }[variant];
  return (
    <button
      onClick={onClick}
      disabled={disabled || loading}
      title={label}
      className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg border text-xs font-medium transition-all disabled:opacity-30 disabled:cursor-not-allowed ${cls}`}
    >
      {loading ? <Loader2 className="w-3 h-3 animate-spin" /> : icon}
      <span className="hidden sm:inline">{label}</span>
    </button>
  );
}

function SortTh({
  label, sortKey, current, dir, onSort,
}: {
  label: string; sortKey: SortKey; current: SortKey; dir: SortDir;
  onSort: (k: SortKey) => void;
}) {
  const active = current === sortKey;
  return (
    <th
      onClick={() => onSort(sortKey)}
      className="px-4 py-3 text-left text-xs font-medium text-white/40 uppercase tracking-wider cursor-pointer select-none hover:text-white/70 transition-colors whitespace-nowrap"
    >
      <span className="flex items-center gap-1">
        {label}
        <span className="opacity-50">
          {active ? (dir === 'asc' ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />) : <ChevronDown className="w-3 h-3 opacity-30" />}
        </span>
      </span>
    </th>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function AdminPoolsPage() {
  const wallet = useTonWallet();

  const [pools, setPools]           = useState<PoolRow[]>([]);
  const [loading, setLoading]       = useState(true);
  const [isAdmin, setIsAdmin]       = useState(false);
  const [search, setSearch]         = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('ALL');
  const [sortKey, setSortKey]       = useState<SortKey>('createdAt');
  const [sortDir, setSortDir]       = useState<SortDir>('desc');
  const [actionStates, setActionStates] = useState<Record<string, boolean>>({});
  const [feedback, setFeedback]     = useState<{ msg: string; ok: boolean } | null>(null);

  // Cancel modal
  const [cancelModal, setCancelModal] = useState<{ poolId: string; tokenSymbol: string } | null>(null);
  const [cancelPreview, setCancelPreview] = useState<ProRataPreview | null>(null);
  const [cancelWinners, setCancelWinners] = useState<WinnerPreview[]>([]);
  const [cancelLoading, setCancelLoading] = useState(false);

  // ── Data fetch ──────────────────────────────────────────────────────────────

  const fetchPools = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (statusFilter !== 'ALL') params.set('status', statusFilter);
    if (search.trim()) params.set('search', search.trim());
    try {
      const res = await fetch(`/api/admin/pools?${params}`, { credentials: 'include' });
      const d = await res.json();
      if (d.error === 'Unauthorized') { setIsAdmin(false); return; }
      setIsAdmin(true);
      setPools(d.pools ?? []);
    } catch {
      // network error - keep existing list
    } finally {
      setLoading(false);
    }
  }, [statusFilter, search]);

  useEffect(() => {
    if (!wallet) { setLoading(false); return; }
    fetchPools();
  }, [wallet, fetchPools]);

  // ── Sort ────────────────────────────────────────────────────────────────────

  const handleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortKey(key); setSortDir('desc'); }
  };

  const sorted = [...pools].sort((a, b) => {
    let av: number | string = 0, bv: number | string = 0;
    switch (sortKey) {
      case 'createdAt':       av = a.createdAt; bv = b.createdAt; break;
      case 'endDate':         av = a.endDate;   bv = b.endDate;   break;
      case 'participantCount': av = a.participantCount; bv = b.participantCount; break;
      case 'totalReward':     av = parseFloat(a.totalReward); bv = parseFloat(b.totalReward); break;
      case 'status':          av = a.status;    bv = b.status;    break;
    }
    if (av < bv) return sortDir === 'asc' ? -1 : 1;
    if (av > bv) return sortDir === 'asc' ?  1 : -1;
    return 0;
  });

  // ── Stats ───────────────────────────────────────────────────────────────────

  const stats = {
    total:       pools.length,
    active:      pools.filter((p) => p.status === 'ACTIVE').length,
    ended:       pools.filter((p) => p.status === 'ENDED').length,
    distributed: pools.filter((p) => p.status === 'DISTRIBUTED').length,
    participants: pools.reduce((s, p) => s + p.participantCount, 0),
    submissions:  pools.reduce((s, p) => s + p.submissionCount, 0),
  };

  // ── Actions ─────────────────────────────────────────────────────────────────

  const setAction = (key: string, v: boolean) =>
    setActionStates((s) => ({ ...s, [key]: v }));

  const doPost = async (key: string, url: string, body: object, successMsg: string, onSuccess?: () => void) => {
    setAction(key, true);
    setFeedback(null);
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(body),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error ?? 'Failed');
      setFeedback({ msg: successMsg, ok: true });
      onSuccess?.();
    } catch (e: unknown) {
      setFeedback({ msg: e instanceof Error ? e.message : 'Error', ok: false });
    } finally {
      setAction(key, false);
    }
  };

  const handleEndPool = (poolId: string) =>
    doPost(`end-${poolId}`, '/api/admin/end-pool', { poolId }, 'Pool ended.', () =>
      setPools((prev) => prev.map((p) => p.id === poolId ? { ...p, status: 'ENDED' } : p))
    );

  const handleDistribute = (poolId: string) =>
    doPost(`dist-${poolId}`, '/api/admin/distribute', { poolId }, 'Distribution triggered!');

  const handleRescrape = (poolId: string) =>
    doPost(`scrape-${poolId}`, '/api/admin/rescrape', { poolId }, 'Re-scrape triggered!');

  const openCancelModal = async (pool: PoolRow) => {
    setCancelModal({ poolId: pool.id, tokenSymbol: pool.tokenSymbol });
    setCancelPreview(null);
    setCancelWinners([]);
    try {
      const res = await fetch(`/api/admin/cancel-pool?poolId=${pool.id}`, { credentials: 'include' });
      const d = await res.json();
      setCancelPreview(d.preview ?? null);
      setCancelWinners(d.winners ?? []);
    } catch {}
  };

  const confirmCancel = async () => {
    if (!cancelModal) return;
    setCancelLoading(true);
    try {
      const res = await fetch('/api/admin/cancel-pool', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ poolId: cancelModal.poolId }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error ?? 'Failed');
      setFeedback({ msg: 'Pool cancelled with pro-rata split.', ok: true });
      setPools((prev) =>
        prev.map((p) => p.id === cancelModal.poolId ? { ...p, status: 'DISTRIBUTED' } : p)
      );
      setCancelModal(null);
    } catch (e: unknown) {
      setFeedback({ msg: e instanceof Error ? e.message : 'Cancel failed', ok: false });
    } finally {
      setCancelLoading(false);
    }
  };

  // ── Auth guards ─────────────────────────────────────────────────────────────

  if (!wallet) {
    return (
      <div className="min-h-screen pt-24 px-4 flex items-center justify-center">
        <div className="glass-card p-10 text-center max-w-sm">
          <Shield className="w-10 h-10 mx-auto text-[#0088CC]/50 mb-4" />
          <h1 className="text-xl font-bold text-white mb-3">Admin - Pools</h1>
          <p className="text-white/50 text-sm mb-6">Connect your admin wallet to continue.</p>
          <TonConnectButton />
        </div>
      </div>
    );
  }

  if (!loading && !isAdmin) {
    return (
      <div className="min-h-screen pt-24 px-4 flex items-center justify-center">
        <div className="glass-card p-10 text-center text-red-400 max-w-sm">
          <AlertCircle className="w-10 h-10 mx-auto mb-3" />
          <p className="font-semibold">Access Denied</p>
        </div>
      </div>
    );
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen pt-24 pb-24 px-4">
      <div className="max-w-screen-2xl mx-auto">

        {/* Back + heading */}
        <div className="flex items-center gap-4 mb-8">
          <Link href="/admin" className="text-white/40 hover:text-white transition-colors">
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div className="flex items-center gap-2">
            <LayoutList className="w-5 h-5 text-[#0088CC]" />
            <h1 className="text-2xl font-bold text-white">All Pools</h1>
          </div>
          <button
            onClick={fetchPools}
            disabled={loading}
            className="ml-auto text-white/40 hover:text-white transition-colors"
            title="Refresh"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>

        {/* Feedback */}
        {feedback && (
          <div className={`mb-6 p-3.5 rounded-xl flex items-center gap-2 text-sm border ${
            feedback.ok
              ? 'bg-green-500/10 border-green-500/20 text-green-400'
              : 'bg-red-500/10 border-red-500/20 text-red-400'
          }`}>
            {feedback.ok
              ? <CheckCircle className="w-4 h-4 shrink-0" />
              : <AlertCircle className="w-4 h-4 shrink-0" />}
            {feedback.msg}
            <button onClick={() => setFeedback(null)} className="ml-auto text-current opacity-50 hover:opacity-100">✕</button>
          </div>
        )}

        {/* Stats bar */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-8">
          {[
            { label: 'Total',        value: stats.total,        color: 'text-white' },
            { label: 'Active',       value: stats.active,       color: 'text-green-400' },
            { label: 'Ended',        value: stats.ended,        color: 'text-yellow-400' },
            { label: 'Distributed',  value: stats.distributed,  color: 'text-white/40' },
            { label: 'Participants', value: fmt(stats.participants), color: 'text-[#0088CC]' },
            { label: 'Submissions',  value: fmt(stats.submissions),  color: 'text-[#0088CC]' },
          ].map((s) => (
            <div key={s.label} className="glass-card p-4 text-center">
              <p className={`text-xl font-bold ${s.color}`}>{s.value}</p>
              <p className="text-xs text-white/30 mt-0.5">{s.label}</p>
            </div>
          ))}
        </div>

        {/* Controls */}
        <div className="flex flex-col sm:flex-row gap-3 mb-5">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30 pointer-events-none" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search project or token…"
              className="w-full bg-white/5 border border-white/10 rounded-xl pl-10 pr-4 py-2.5 text-sm text-white placeholder-white/25 focus:outline-none focus:border-[#0088CC]/50"
            />
          </div>
          <div className="flex rounded-xl overflow-hidden border border-white/10 shrink-0">
            {(['ALL', 'ACTIVE', 'ENDED', 'DISTRIBUTED'] as StatusFilter[]).map((s) => (
              <button
                key={s}
                onClick={() => setStatusFilter(s)}
                className={`px-4 py-2.5 text-xs font-semibold transition-all ${
                  statusFilter === s
                    ? 'bg-[#0088CC] text-white'
                    : 'text-white/40 hover:text-white hover:bg-white/5'
                }`}
              >
                {s}
              </button>
            ))}
          </div>
        </div>

        {/* Table */}
        <div className="glass-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-white/10 bg-white/[0.02]">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-white/40 uppercase tracking-wider">Project</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-white/40 uppercase tracking-wider">Token</th>
                  <SortTh label="Reward"   sortKey="totalReward"     current={sortKey} dir={sortDir} onSort={handleSort} />
                  <th className="px-4 py-3 text-left text-xs font-medium text-white/40 uppercase tracking-wider">Type</th>
                  <SortTh label="Slots"    sortKey="participantCount" current={sortKey} dir={sortDir} onSort={handleSort} />
                  <SortTh label="Created"  sortKey="createdAt"        current={sortKey} dir={sortDir} onSort={handleSort} />
                  <SortTh label="Ends"     sortKey="endDate"          current={sortKey} dir={sortDir} onSort={handleSort} />
                  <th className="px-4 py-3 text-left text-xs font-medium text-white/40 uppercase tracking-wider">Contract</th>
                  <SortTh label="Status"   sortKey="status"           current={sortKey} dir={sortDir} onSort={handleSort} />
                  <th className="px-4 py-3 text-left text-xs font-medium text-white/40 uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {loading ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <tr key={i} className="animate-pulse">
                      {Array.from({ length: 10 }).map((_, j) => (
                        <td key={j} className="px-4 py-3">
                          <div className="h-3 bg-white/10 rounded w-full" />
                        </td>
                      ))}
                    </tr>
                  ))
                ) : sorted.length === 0 ? (
                  <tr>
                    <td colSpan={10} className="px-4 py-12 text-center text-white/30">
                      No pools found.
                    </td>
                  </tr>
                ) : (
                  sorted.map((pool) => (
                    <tr key={pool.id} className="hover:bg-white/[0.02] transition-colors cursor-pointer" onClick={(e) => { if ((e.target as HTMLElement).closest('button,a')) return; window.location.href = `/admin/pools/${pool.id}`; }}>

                      {/* Project */}
                      <td className="px-4 py-3 max-w-[160px]">
                        <div>
                          <p className="font-medium text-white truncate">{pool.project.name}</p>
                          <p className="text-[10px] text-white/30 font-mono truncate">
                            {shortAddr(pool.project.ownerWalletAddress)}
                          </p>
                        </div>
                      </td>

                      {/* Token */}
                      <td className="px-4 py-3 font-mono text-xs text-[#0088CC]">
                        ${pool.tokenSymbol}
                      </td>

                      {/* Reward */}
                      <td className="px-4 py-3 text-white/80 whitespace-nowrap">
                        {parseFloat(pool.totalReward).toLocaleString()}
                        <span className="text-white/30 text-xs ml-1">{pool.tokenSymbol}</span>
                      </td>

                      {/* Campaign type */}
                      <td className="px-4 py-3 text-white/50 text-xs whitespace-nowrap">
                        {CAMPAIGN_LABEL[pool.campaignType] ?? pool.campaignType}
                      </td>

                      {/* Participants / slots */}
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span className="text-white/80">{fmt(pool.participantCount)}</span>
                        <span className="text-white/25 text-xs"> / {pool.rewardSlots}</span>
                      </td>

                      {/* Created */}
                      <td className="px-4 py-3 text-white/40 text-xs whitespace-nowrap">
                        {new Date(pool.createdAt).toLocaleDateString()}
                      </td>

                      {/* End date */}
                      <td className="px-4 py-3 text-white/40 text-xs whitespace-nowrap">
                        {new Date(pool.endDate).toLocaleDateString()}
                      </td>

                      {/* Contract */}
                      <td className="px-4 py-3">
                        {pool.contractAddress ? (
                          <a
                            href={`https://tonviewer.com/${pool.contractAddress}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-1 font-mono text-[10px] text-[#0088CC]/70 hover:text-[#0088CC] transition-colors"
                          >
                            {shortAddr(pool.contractAddress)}
                            <ExternalLink className="w-2.5 h-2.5 shrink-0" />
                          </a>
                        ) : (
                          <span className="text-white/20 text-xs">-</span>
                        )}
                      </td>

                      {/* Status */}
                      <td className="px-4 py-3">
                        <StatusBadge status={pool.status} />
                      </td>

                      {/* Actions */}
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          {pool.status === 'ACTIVE' && (
                            <ActionBtn
                              label="End"
                              icon={<StopCircle className="w-3 h-3" />}
                              onClick={() => handleEndPool(pool.id)}
                              loading={actionStates[`end-${pool.id}`]}
                            />
                          )}
                          {pool.status === 'ENDED' && (
                            <ActionBtn
                              label="Distribute"
                              icon={<Coins className="w-3 h-3" />}
                              onClick={() => handleDistribute(pool.id)}
                              loading={actionStates[`dist-${pool.id}`]}
                              variant="primary"
                            />
                          )}
                          {(pool.status === 'ACTIVE' || pool.status === 'ENDED') && (
                            <ActionBtn
                              label="Cancel"
                              icon={<XCircle className="w-3 h-3" />}
                              onClick={() => openCancelModal(pool)}
                              variant="danger"
                            />
                          )}
                          <ActionBtn
                            label="Re-scrape"
                            icon={<RefreshCw className="w-3 h-3" />}
                            onClick={() => handleRescrape(pool.id)}
                            loading={actionStates[`scrape-${pool.id}`]}
                          />
                          <Link
                            href={`/pools/${pool.id}`}
                            target="_blank"
                            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-white/15 text-white/40 hover:text-white hover:border-white/30 transition-all text-xs"
                            title="View pool"
                          >
                            <ExternalLink className="w-3 h-3" />
                          </Link>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Footer count */}
          {!loading && sorted.length > 0 && (
            <div className="px-4 py-3 border-t border-white/5 text-xs text-white/25 flex items-center gap-2">
              <Users className="w-3.5 h-3.5" />
              {sorted.length} pool{sorted.length !== 1 ? 's' : ''}
              {statusFilter !== 'ALL' && ` · filtered by ${statusFilter}`}
            </div>
          )}
        </div>
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
                {/* Progress bar */}
                <div>
                  <div className="flex justify-between text-xs text-white/40 mb-1.5">
                    <span>Day {cancelPreview.daysElapsed} of {cancelPreview.totalDays}</span>
                    <span>{Math.round(cancelPreview.daysElapsed / cancelPreview.totalDays * 100)}% elapsed</span>
                  </div>
                  <div className="h-1.5 bg-white/10 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-[#0088CC] rounded-full transition-all"
                      style={{ width: `${Math.round(cancelPreview.daysElapsed / cancelPreview.totalDays * 100)}%` }}
                    />
                  </div>
                </div>

                {/* Token split */}
                <div className="rounded-xl border border-white/10 overflow-hidden text-sm">
                  <div className="flex justify-between px-4 py-3 bg-[#0088CC]/5 border-b border-white/10">
                    <span className="text-white/60">Participants receive</span>
                    <span className="text-[#0088CC] font-semibold">
                      {cancelPreview.participantTokens} {cancelModal.tokenSymbol}
                    </span>
                  </div>
                  <div className="flex justify-between px-4 py-3">
                    <span className="text-white/60">Project refund</span>
                    <span className="text-white font-semibold">
                      {cancelPreview.refundTokens} {cancelModal.tokenSymbol}
                    </span>
                  </div>
                </div>

                {/* Winner breakdown */}
                {cancelWinners.length > 0 ? (
                  <div>
                    <p className="text-xs text-white/35 uppercase tracking-wider font-medium mb-2">
                      Winner breakdown
                    </p>
                    <div className="rounded-xl border border-white/10 overflow-hidden">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="border-b border-white/10 bg-white/[0.02]">
                            <th className="px-3 py-2 text-left text-white/30 font-medium">#</th>
                            <th className="px-3 py-2 text-left text-white/30 font-medium">Wallet</th>
                            <th className="px-3 py-2 text-right text-white/30 font-medium">Points</th>
                            <th className="px-3 py-2 text-right text-white/30 font-medium">Receives</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-white/5">
                          {cancelWinners.map((w) => (
                            <tr key={w.walletAddress}>
                              <td className="px-3 py-2 text-white/35">{w.rank}</td>
                              <td className="px-3 py-2 font-mono text-white/55">
                                {shortAddr(w.walletAddress)}
                              </td>
                              <td className="px-3 py-2 text-right text-white/55">
                                {w.totalPoints.toLocaleString()}
                              </td>
                              <td className="px-3 py-2 text-right text-[#0088CC] font-semibold">
                                {w.proRataAmount} {cancelModal.tokenSymbol}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ) : (
                  <p className="text-xs text-white/30 text-center py-1">
                    No eligible participants. Full amount refunded to project owner.
                  </p>
                )}

                <p className="text-xs text-white/25">
                  Daily rate: {cancelPreview.dailyRate} {cancelModal.tokenSymbol}/day
                </p>
              </div>
            ) : (
              <div className="py-8 flex items-center justify-center gap-2 text-white/30 text-sm">
                <Loader2 className="w-4 h-4 animate-spin" />
                Loading preview…
              </div>
            )}

            <div className="flex gap-3 pt-1">
              <button
                onClick={() => setCancelModal(null)}
                className="btn-secondary flex-1"
              >
                Keep Pool
              </button>
              <button
                onClick={confirmCancel}
                disabled={cancelLoading || !cancelPreview}
                className="flex-1 bg-red-500/20 hover:bg-red-500/30 border border-red-500/40 text-red-400 font-semibold px-5 py-2.5 rounded-xl transition-all disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2 text-sm"
              >
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
