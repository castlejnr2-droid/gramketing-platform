'use client';
import { useEffect, useState } from 'react';
import { useTonWallet } from '@tonconnect/ui-react';
import { TonConnectButton } from '@tonconnect/ui-react';
import {
  Shield,
  RefreshCw,
  XCircle,
  Coins,
  Users,
  Loader2,
  AlertCircle,
  CheckCircle,
} from 'lucide-react';

interface PoolRow {
  id: string;
  status: string;
  project: { name: string };
  tokenSymbol: string;
  totalReward: string;
  participantCount: number;
  createdAt: string;
  endDate: string;
}

interface RevenueData {
  mgram: { totalTokens: string; totalUsd: number; records: RevenueRecord[] };
  ton: { totalTokens: string; totalUsd: number; records: RevenueRecord[] };
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

interface BannedRow {
  id: string;
  walletAddress: string;
  reason?: string;
  telegramChannel?: string;
  xLink?: string;
  bannedAt: string;
}

interface RevenueRecord {
  id: string;
  tokenAmount: string;
  usdValueAtTime: number;
  txHash?: string;
  createdAt: string;
}

function ActionButton({
  label,
  icon,
  onClick,
  variant = 'secondary',
  loading = false,
  disabled = false,
}: {
  label: string;
  icon?: React.ReactNode;
  onClick: () => void;
  variant?: 'primary' | 'secondary' | 'danger';
  loading?: boolean;
  disabled?: boolean;
}) {
  const base =
    'flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg font-medium transition-all disabled:opacity-40 disabled:cursor-not-allowed';
  const styles = {
    primary: 'bg-[#0088CC] hover:bg-[#0099DD] text-white',
    secondary: 'border border-white/20 text-white/70 hover:text-white hover:border-white/40',
    danger: 'border border-red-500/40 text-red-400 hover:bg-red-500/10',
  };
  return (
    <button
      onClick={onClick}
      disabled={disabled || loading}
      className={`${base} ${styles[variant]}`}
    >
      {loading ? (
        <Loader2 className="w-3 h-3 animate-spin" />
      ) : (
        icon
      )}
      {label}
    </button>
  );
}

export default function AdminPage() {
  const wallet = useTonWallet();
  const [pools, setPools] = useState<PoolRow[]>([]);
  const [revenue, setRevenue] = useState<RevenueData | null>(null);
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [actionStates, setActionStates] = useState<Record<string, boolean>>({});
  const [cancelModal, setCancelModal] = useState<{ poolId: string; tokenSymbol: string; totalReward: string } | null>(null);
  const [cancelPreview, setCancelPreview] = useState<ProRataPreview | null>(null);
  const [cancelWinners, setCancelWinners] = useState<WinnerPreview[]>([]);
  const [cancelLoading, setCancelLoading] = useState(false);
  const [banWallet, setBanWallet] = useState('');
  const [banReason, setBanReason] = useState('');
  const [banTelegram, setBanTelegram] = useState('');
  const [banX, setBanX] = useState('');
  const [banLoading, setBanLoading] = useState(false);
  const [bannedList, setBannedList] = useState<BannedRow[]>([]);
  const [feedback, setFeedback] = useState<{ msg: string; ok: boolean } | null>(null);

  useEffect(() => {
    if (!wallet) { setLoading(false); return; }

    Promise.all([
      fetch('/api/admin/pools', { credentials: 'include' }).then((r) => r.json()),
      fetch('/api/admin/revenue', { credentials: 'include' }).then((r) => r.json()),
      fetch('/api/admin/ban', { credentials: 'include' }).then((r) => r.json()),
    ])
      .then(([poolsData, revData, banData]) => {
        if (poolsData.error === 'Unauthorized') {
          setIsAdmin(false);
        } else {
          setIsAdmin(true);
          setPools(poolsData.pools ?? []);
          setRevenue(revData);
          setBannedList(banData.banned ?? []);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [wallet]);

  const doAction = async (
    key: string,
    url: string,
    body: object,
    successMsg: string
  ) => {
    setActionStates((s) => ({ ...s, [key]: true }));
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
    } catch (e: unknown) {
      setFeedback({
        msg: e instanceof Error ? e.message : 'Error',
        ok: false,
      });
    } finally {
      setActionStates((s) => ({ ...s, [key]: false }));
    }
  };

  const handleDistribute = (poolId: string) =>
    doAction(
      `dist-${poolId}`,
      '/api/admin/distribute',
      { poolId },
      'Distribution triggered!'
    );

  const handleEndPool = async (poolId: string) => {
    setActionStates((s) => ({ ...s, [`end-${poolId}`]: true }));
    setFeedback(null);
    try {
      const res = await fetch('/api/admin/end-pool', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ poolId }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error ?? 'Failed');
      setFeedback({ msg: 'Pool ended.', ok: true });
      setPools((prev) => prev.map((p) => p.id === poolId ? { ...p, status: 'ENDED' } : p));
    } catch (e: unknown) {
      setFeedback({ msg: e instanceof Error ? e.message : 'Error', ok: false });
    } finally {
      setActionStates((s) => ({ ...s, [`end-${poolId}`]: false }));
    }
  };

  const openCancelModal = async (pool: PoolRow) => {
    setCancelModal({ poolId: pool.id, tokenSymbol: pool.tokenSymbol, totalReward: pool.totalReward });
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
      setCancelModal(null);
      setPools((prev) => prev.map((p) => p.id === cancelModal.poolId ? { ...p, status: 'DISTRIBUTED' } : p));
    } catch (e: unknown) {
      setFeedback({ msg: e instanceof Error ? e.message : 'Cancel failed', ok: false });
    } finally {
      setCancelLoading(false);
    }
  };

  const handleBan = async () => {
    if (!banWallet.trim()) return;
    setBanLoading(true);
    setFeedback(null);
    try {
      const res = await fetch('/api/admin/ban', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          walletAddress: banWallet,
          reason: banReason,
          telegramChannel: banTelegram || undefined,
          xLink: banX || undefined,
        }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error ?? 'Failed');
      setFeedback({ msg: `Banned ${banWallet}`, ok: true });
      setBanWallet('');
      setBanReason('');
      setBanTelegram('');
      setBanX('');
      // Refresh banned list
      fetch('/api/admin/ban', { credentials: 'include' })
        .then((r) => r.json())
        .then((d) => setBannedList(d.banned ?? []))
        .catch(() => {});
    } catch (e: unknown) {
      setFeedback({
        msg: e instanceof Error ? e.message : 'Ban failed',
        ok: false,
      });
    } finally {
      setBanLoading(false);
    }
  };

  if (!wallet) {
    return (
      <div className="min-h-screen pt-24 px-4 flex items-center justify-center">
        <div className="glass-card p-10 text-center max-w-sm">
          <Shield className="w-10 h-10 mx-auto text-[#0088CC]/50 mb-4" />
          <h1 className="text-xl font-bold text-white mb-3">Admin Panel</h1>
          <p className="text-white/50 text-sm mb-6">
            Connect your admin wallet to access.
          </p>
          <TonConnectButton />
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="min-h-screen pt-24 px-4 flex items-center justify-center">
        <div className="glass-card p-8 text-white/40">Loading...</div>
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="min-h-screen pt-24 px-4 flex items-center justify-center">
        <div className="glass-card p-10 text-center text-red-400 max-w-sm">
          <AlertCircle className="w-10 h-10 mx-auto mb-3" />
          <p className="font-semibold">Access Denied</p>
          <p className="text-sm text-white/40 mt-2">
            This wallet is not the platform admin.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen pt-24 pb-20 px-4">
      <div className="max-w-7xl mx-auto">
        <div className="flex items-center gap-3 mb-10">
          <Shield className="w-6 h-6 text-[#0088CC]" />
          <h1 className="text-3xl font-bold text-white">Admin Panel</h1>
        </div>

        {/* Feedback toast */}
        {feedback && (
          <div
            className={`mb-6 p-4 rounded-xl flex items-center gap-2 text-sm border ${
              feedback.ok
                ? 'bg-green-500/10 border-green-500/20 text-green-400'
                : 'bg-red-500/10 border-red-500/20 text-red-400'
            }`}
          >
            {feedback.ok ? (
              <CheckCircle className="w-4 h-4" />
            ) : (
              <AlertCircle className="w-4 h-4" />
            )}
            {feedback.msg}
          </div>
        )}

        {/* Revenue dashboard */}
        {revenue && (
          <section className="mb-12">
            <h2 className="text-xl font-semibold text-white mb-5 flex items-center gap-2">
              <Coins className="w-5 h-5 text-[#0088CC]" />
              Platform Revenue
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* TON revenue */}
              <div className="glass-card p-6">
                <h3 className="font-semibold text-white mb-4">TON Revenue</h3>
                <div className="flex items-end justify-between mb-4">
                  <div>
                    <p className="text-3xl font-bold text-[#0088CC]">
                      {parseFloat(revenue.ton.totalTokens).toFixed(4)} TON
                    </p>
                    <p className="text-sm text-white/40 mt-1">
                      ≈ ${revenue.ton.totalUsd.toFixed(2)} USD
                    </p>
                  </div>
                </div>
                <div className="space-y-2">
                  {revenue.ton.records.slice(0, 5).map((r) => (
                    <div key={r.id} className="flex justify-between text-xs text-white/40">
                      <span>{new Date(r.createdAt).toLocaleDateString()}</span>
                      <span>{parseFloat(r.tokenAmount).toFixed(4)} TON</span>
                      <span>${r.usdValueAtTime.toFixed(2)}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* mGRAM revenue */}
              <div className="glass-card p-6">
                <h3 className="font-semibold text-white mb-4">$mGRAM Revenue</h3>
                <div className="flex items-end justify-between mb-4">
                  <div>
                    <p className="text-3xl font-bold text-purple-400">
                      {parseFloat(revenue.mgram.totalTokens || '0').toFixed(2)} mGRAM
                    </p>
                    <p className="text-sm text-white/40 mt-1">
                      ≈ ${revenue.mgram.totalUsd.toFixed(2)} USD
                    </p>
                  </div>
                </div>
                {revenue.mgram.records.length === 0 && (
                  <p className="text-xs text-white/30">
                    No $mGRAM revenue yet (token not launched)
                  </p>
                )}
              </div>
            </div>
          </section>
        )}

        {/* Pools table */}
        <section className="mb-12">
          <h2 className="text-xl font-semibold text-white mb-5 flex items-center gap-2">
            <Users className="w-5 h-5 text-[#0088CC]" />
            All Pools
          </h2>
          <div className="glass-card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b border-white/10">
                  <tr>
                    {['Project', 'Token', 'Reward', 'Participants', 'Status', 'Ends', 'Actions'].map(
                      (h) => (
                        <th
                          key={h}
                          className="px-4 py-3 text-left text-xs font-medium text-white/40 uppercase tracking-wider"
                        >
                          {h}
                        </th>
                      )
                    )}
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {pools.map((pool) => (
                    <tr key={pool.id} className="hover:bg-white/[0.02] transition-colors">
                      <td className="px-4 py-3 font-medium text-white">
                        {pool.project.name}
                      </td>
                      <td className="px-4 py-3 text-[#0088CC] font-mono text-xs">
                        ${pool.tokenSymbol}
                      </td>
                      <td className="px-4 py-3 text-white/70">
                        {pool.totalReward}
                      </td>
                      <td className="px-4 py-3 text-white/70">
                        {pool.participantCount}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                            pool.status === 'ACTIVE'
                              ? 'bg-green-500/20 text-green-400 border border-green-500/30'
                              : pool.status === 'ENDED'
                              ? 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/30'
                              : 'bg-white/10 text-white/40 border border-white/10'
                          }`}
                        >
                          {pool.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-white/40 text-xs">
                        {new Date(pool.endDate).toLocaleDateString()}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2 flex-wrap">
                          {pool.status === 'ACTIVE' && (
                            <ActionButton
                              label="End"
                              icon={<XCircle className="w-3 h-3" />}
                              onClick={() => handleEndPool(pool.id)}
                              loading={actionStates[`end-${pool.id}`]}
                              variant="secondary"
                            />
                          )}
                          {pool.status === 'ENDED' && (
                            <ActionButton
                              label="Distribute"
                              icon={<Coins className="w-3 h-3" />}
                              onClick={() => handleDistribute(pool.id)}
                              loading={actionStates[`dist-${pool.id}`]}
                              variant="primary"
                            />
                          )}
                          {(pool.status === 'ACTIVE' || pool.status === 'ENDED') && (
                            <ActionButton
                              label="Cancel"
                              icon={<XCircle className="w-3 h-3" />}
                              onClick={() => openCancelModal(pool)}
                              variant="danger"
                            />
                          )}
                          <ActionButton
                            label="Re-scrape"
                            icon={<RefreshCw className="w-3 h-3" />}
                            onClick={() =>
                              doAction(
                                `scrape-${pool.id}`,
                                '/api/admin/rescrape',
                                { poolId: pool.id },
                                'Re-scrape triggered!'
                              )
                            }
                            loading={actionStates[`scrape-${pool.id}`]}
                          />
                        </div>
                      </td>
                    </tr>
                  ))}
                  {pools.length === 0 && (
                    <tr>
                      <td
                        colSpan={7}
                        className="px-4 py-8 text-center text-white/30"
                      >
                        No pools yet.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </section>

        {/* Ban marketer */}
        <section className="mb-12">
          <h2 className="text-xl font-semibold text-white mb-5 flex items-center gap-2">
            <XCircle className="w-5 h-5 text-red-400" />
            Ban Marketer
          </h2>
          <div className="glass-card p-6 max-w-lg">
            <div className="space-y-4">
              <div>
                <label className="block text-sm text-white/60 mb-1.5">
                  Wallet Address
                </label>
                <input
                  value={banWallet}
                  onChange={(e) => setBanWallet(e.target.value)}
                  placeholder="EQ..."
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white placeholder-white/25 focus:outline-none focus:border-red-500/40 font-mono"
                />
              </div>
              <div>
                <label className="block text-sm text-white/60 mb-1.5">
                  Reason
                </label>
                <input
                  value={banReason}
                  onChange={(e) => setBanReason(e.target.value)}
                  placeholder="Spam, fake views, etc."
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white placeholder-white/25 focus:outline-none focus:border-red-500/40"
                />
              </div>
              <div>
                <label className="block text-sm text-white/60 mb-1.5">
                  Telegram Channel <span className="text-white/30">(optional)</span>
                </label>
                <input
                  value={banTelegram}
                  onChange={(e) => setBanTelegram(e.target.value)}
                  placeholder="https://t.me/..."
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white placeholder-white/25 focus:outline-none focus:border-red-500/40"
                />
              </div>
              <div>
                <label className="block text-sm text-white/60 mb-1.5">
                  X / Twitter <span className="text-white/30">(optional)</span>
                </label>
                <input
                  value={banX}
                  onChange={(e) => setBanX(e.target.value)}
                  placeholder="https://x.com/..."
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white placeholder-white/25 focus:outline-none focus:border-red-500/40"
                />
              </div>
              <button
                onClick={handleBan}
                disabled={banLoading || !banWallet.trim()}
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-red-500/20 hover:bg-red-500/30 text-red-400 border border-red-500/30 text-sm font-medium transition-all disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {banLoading ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <XCircle className="w-4 h-4" />
                )}
                Ban Marketer
              </button>
            </div>
          </div>
        </section>

        {/* Banned marketers list */}
        {bannedList.length > 0 && (
          <section>
            <h2 className="text-xl font-semibold text-white mb-5 flex items-center gap-2">
              <XCircle className="w-5 h-5 text-red-400/60" />
              Banned Marketers <span className="text-sm font-normal text-white/30">({bannedList.length})</span>
            </h2>
            <div className="glass-card overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="border-b border-white/10">
                    <tr>
                      {['Wallet', 'Reason', 'Telegram', 'X / Twitter', 'Banned At'].map((h) => (
                        <th key={h} className="px-4 py-3 text-left text-xs font-medium text-white/40 uppercase tracking-wider">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {bannedList.map((b) => (
                      <tr key={b.id} className="hover:bg-white/[0.02]">
                        <td className="px-4 py-3 font-mono text-xs text-red-400/80">
                          {b.walletAddress.slice(0, 8)}...{b.walletAddress.slice(-6)}
                        </td>
                        <td className="px-4 py-3 text-white/50 text-xs">{b.reason || '—'}</td>
                        <td className="px-4 py-3 text-xs">
                          {b.telegramChannel
                            ? <a href={b.telegramChannel} target="_blank" rel="noopener noreferrer" className="text-[#0088CC] hover:underline truncate max-w-[140px] block">{b.telegramChannel}</a>
                            : <span className="text-white/20">—</span>}
                        </td>
                        <td className="px-4 py-3 text-xs">
                          {b.xLink
                            ? <a href={b.xLink} target="_blank" rel="noopener noreferrer" className="text-white/60 hover:underline truncate max-w-[140px] block">{b.xLink}</a>
                            : <span className="text-white/20">—</span>}
                        </td>
                        <td className="px-4 py-3 text-white/30 text-xs">{new Date(b.bannedAt).toLocaleDateString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </section>
        )}
      </div>

      {/* Cancel Pool Modal */}
      {cancelModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm px-4">
          <div className="glass-modal p-8 max-w-md w-full space-y-5">
            <h3 className="text-lg font-bold text-white">Cancel Pool?</h3>
            <p className="text-sm text-white/50">
              This will end the pool immediately using a pro-rata split of rewards.
            </p>

            {cancelPreview ? (
              <div className="space-y-4 text-sm max-h-[60vh] overflow-y-auto pr-1">
                {/* Progress bar */}
                <div>
                  <div className="flex justify-between text-xs text-white/40 mb-1.5">
                    <span>Day {cancelPreview.daysElapsed} of {cancelPreview.totalDays}</span>
                    <span>{Math.round(cancelPreview.daysElapsed / cancelPreview.totalDays * 100)}% elapsed</span>
                  </div>
                  <div className="h-1.5 bg-white/10 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-[#0088CC] rounded-full"
                      style={{ width: `${Math.round(cancelPreview.daysElapsed / cancelPreview.totalDays * 100)}%` }}
                    />
                  </div>
                </div>

                {/* Token split */}
                <div className="rounded-xl border border-white/10 overflow-hidden">
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
                    <p className="text-xs text-white/40 mb-2 uppercase tracking-wider font-medium">
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
                            <tr key={w.walletAddress} className="hover:bg-white/[0.02]">
                              <td className="px-3 py-2 text-white/40">{w.rank}</td>
                              <td className="px-3 py-2 font-mono text-white/60">
                                {w.walletAddress.slice(0, 6)}...{w.walletAddress.slice(-4)}
                              </td>
                              <td className="px-3 py-2 text-right text-white/60">
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
                  <p className="text-xs text-white/30 text-center py-2">
                    No eligible participants yet. Full amount refunded to project owner.
                  </p>
                )}

                <p className="text-xs text-white/25">
                  Daily rate: {cancelPreview.dailyRate} {cancelModal.tokenSymbol}/day
                </p>
              </div>
            ) : (
              <div className="py-6 text-center text-white/30 text-sm flex items-center justify-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin" />
                Loading preview...
              </div>
            )}

            <div className="flex gap-3 pt-2">
              <button
                onClick={() => setCancelModal(null)}
                className="btn-secondary flex-1"
              >
                Keep Pool
              </button>
              <button
                onClick={confirmCancel}
                disabled={cancelLoading || !cancelPreview}
                className="flex-1 bg-red-500/20 hover:bg-red-500/30 border border-red-500/40 text-red-400 font-semibold px-6 py-2.5 rounded-xl transition-all disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
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
