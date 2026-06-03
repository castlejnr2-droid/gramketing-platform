'use client';
import { getParticipantTier } from '@/lib/points';
import { useEffect, useState } from 'react';
import { useTonWallet } from '@tonconnect/ui-react';
import { TonConnectButton } from '@tonconnect/ui-react';
import Link from 'next/link';
import { ReferralCard } from '@/components/ReferralCard';
import { Trophy, TrendingUp, Settings, ChevronRight, CheckCircle, Layers } from 'lucide-react';

interface MyPool {
  poolId: string;
  poolStatus: 'ACTIVE' | 'ENDED' | 'DISTRIBUTED';
  projectName: string;
  tokenSymbol: string;
  totalReward: string;
  endDate: string;
  rank: number;
  totalParticipants: number;
  totalPoints: number;
  referralCode: string;
  referralBonusPoints: number;
}

interface OwnedPool {
  id: string;
  projectName: string;
  tokenSymbol: string;
  totalReward: string;
  status: string;
  endDate: string;
  participantCount: number;
}

interface AccountInfo {
  walletAddress: string;
  xHandle?: string;
  telegramHandle?: string;
}

function TierBadge({ totalPoints }: { totalPoints: number }) {
  const { label, color, bg, border } = getParticipantTier(totalPoints);
  return (
    <span className={`inline-flex items-center text-[10px] font-bold px-1.5 py-0.5 rounded-full border ${color} ${bg} ${border}`}>
      {label}
    </span>
  );
}

export default function DashboardPage() {
  const wallet = useTonWallet();
  const [activePools, setActivePools] = useState<MyPool[]>([]);
  const [endedPools, setEndedPools] = useState<MyPool[]>([]);
  const [account, setAccount] = useState<AccountInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [ownedEndedPools, setOwnedEndedPools] = useState<OwnedPool[]>([]);
  const [xInput, setXInput] = useState('');

  useEffect(() => {
    if (!wallet) return;
    fetch(`/api/pools?ownerAddress=${encodeURIComponent(wallet.account.address)}&limit=50`)
      .then((r) => r.json())
      .then((d) => {
        setOwnedEndedPools((d.pools ?? []).map((p: {
          id: string;
          project: { name: string };
          tokenSymbol: string;
          totalReward: string;
          status: string;
          endDate: string;
          _count: { participants: number };
        }) => ({
          id: p.id,
          projectName: p.project.name,
          tokenSymbol: p.tokenSymbol,
          totalReward: p.totalReward,
          status: p.status,
          endDate: p.endDate,
          participantCount: p._count.participants,
        })));
      })
      .catch(() => {});
  }, [wallet]);
  const [tgInput, setTgInput] = useState('');
  const [savingX, setSavingX] = useState(false);
  const [savingTg, setSavingTg] = useState(false);

  useEffect(() => {
    if (!wallet) {
      setLoading(false);
      return;
    }

    fetch('/api/dashboard', { credentials: 'include' })
      .then((r) => r.json())
      .then((d) => {
        setActivePools(d.activePools ?? []);
        setEndedPools(d.endedPools ?? []);
        setAccount(d.account ?? null);
        if (d.account?.xHandle) setXInput(d.account.xHandle);
        if (d.account?.telegramHandle) setTgInput(d.account.telegramHandle);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [wallet]);

  const handleSaveX = async () => {
    setSavingX(true);
    try {
      await fetch('/api/auth/link-x', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ xHandle: xInput }),
      });
    } catch {
      // ignore
    } finally {
      setSavingX(false);
    }
  };

  const handleSaveTg = async () => {
    setSavingTg(true);
    try {
      await fetch('/api/auth/link-telegram', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ telegramHandle: tgInput }),
      });
    } catch {
      // ignore
    } finally {
      setSavingTg(false);
    }
  };

  if (!wallet) {
    return (
      <div className="min-h-screen pt-24 px-4 flex items-center justify-center">
        <div className="glass-card p-12 text-center max-w-md w-full">
          <Trophy className="w-12 h-12 mx-auto text-[#0088CC]/50 mb-5" />
          <h1 className="text-2xl font-bold text-white mb-3">
            Connect Your Wallet
          </h1>
          <p className="text-white/50 text-sm mb-8">
            Connect your TON wallet to view your dashboard, track your rankings,
            and manage your pool participations.
          </p>
          <TonConnectButton />
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="min-h-screen pt-24 px-4 flex items-center justify-center">
        <div className="glass-card p-8 text-white/40">
          Loading dashboard...
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen pt-24 pb-20 px-4">
      <div className="max-w-6xl mx-auto">
        <div className="mb-10">
          <h1 className="text-4xl font-bold text-white mb-2">Dashboard</h1>
          <p className="text-white/50 text-sm font-mono">
            {wallet.account.address.slice(0, 8)}...{wallet.account.address.slice(-6)}
          </p>
        </div>

        {/* My Created Pools */}
        <section className="mb-12">
          <h2 className="text-xl font-semibold text-white mb-5 flex items-center gap-2">
            <Layers className="w-5 h-5 text-[#0088CC]" />
            My Created Pools
          </h2>
          {ownedEndedPools.length === 0 ? (
            <div className="glass-card p-10 text-center text-white/40">
              <p className="mb-4">You haven&apos;t created any pools yet.</p>
              <Link href="/create-pool" className="btn-primary text-sm inline-flex items-center gap-2">
                Create Pool <ChevronRight className="w-4 h-4" />
              </Link>
            </div>
          ) : (
            <div className="space-y-3">
              {ownedEndedPools.map((p) => (
                <div key={p.id} className="glass-card p-5">
                  <div className="flex items-center justify-between flex-wrap gap-4">
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="font-semibold text-white">{p.projectName}</h3>
                        <span className="text-xs text-[#0088CC] bg-[#0088CC]/10 px-2 py-0.5 rounded font-mono">
                          ${p.tokenSymbol}
                        </span>
                        {p.status === 'ACTIVE' ? (
                          <span className="live-badge flex items-center gap-1.5">
                            <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
                            LIVE
                          </span>
                        ) : (
                          <span className="ended-badge">{p.status}</span>
                        )}
                      </div>
                      <div className="flex items-center gap-4 text-sm text-white/40">
                        <span>Reward: <span className="text-white/70">{p.totalReward} {p.tokenSymbol}</span></span>
                        <span>{p.participantCount} participants</span>
                        <span>Ends: {new Date(p.endDate).toLocaleDateString()}</span>
                      </div>
                    </div>
                    <Link href={`/pools/${p.id}`} className="btn-secondary text-sm flex items-center gap-2">
                      View <ChevronRight className="w-4 h-4" />
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Active Pools */}
        <section className="mb-12">
          <h2 className="text-xl font-semibold text-white mb-5 flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-[#0088CC]" />
            My Active Pools
          </h2>
          {activePools.length === 0 ? (
            <div className="glass-card p-10 text-center text-white/40">
              <p className="mb-4">You&apos;re not participating in any active pools.</p>
              <Link href="/pools" className="btn-primary text-sm">
                Browse Pools
              </Link>
            </div>
          ) : (
            <div className="space-y-4">
              {activePools.map((p) => (
                <div key={p.poolId} className="glass-card p-5">
                  <div className="flex items-center justify-between flex-wrap gap-4">
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="font-semibold text-white">
                          {p.projectName}
                        </h3>
                        <span className="text-xs text-[#0088CC] bg-[#0088CC]/10 px-2 py-0.5 rounded font-mono">
                          ${p.tokenSymbol}
                        </span>
                        <span className="live-badge flex items-center gap-1.5">
                          <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
                          LIVE
                        </span>
                      </div>
                      <div className="flex items-center gap-3 mb-1.5 flex-wrap">
                        <TierBadge totalPoints={p.totalPoints} />
                      </div>
                      <div className="flex items-center gap-4 text-sm text-white/40">
                        <span>
                          Rank{' '}
                          <span className="text-[#0088CC] font-semibold">
                            #{p.rank}
                          </span>{' '}
                          of {p.totalParticipants}
                        </span>
                        <span>
                          {p.totalPoints.toLocaleString(undefined, {
                            maximumFractionDigits: 0,
                          })}{' '}
                          pts
                        </span>
                        <span>
                          Prize: {p.totalReward} {p.tokenSymbol}
                        </span>
                      </div>
                    </div>
                    <Link
                      href={`/pools/${p.poolId}`}
                      className="btn-secondary text-sm flex items-center gap-2"
                    >
                      View Pool
                      <ChevronRight className="w-4 h-4" />
                    </Link>
                  </div>

                  {/* Referral card for active pools */}
                  <div className="mt-5 pt-5 border-t border-white/5">
                    <ReferralCard
                      poolId={p.poolId}
                      referralCode={p.referralCode}
                      successfulReferrals={0}
                      bonusPointsEarned={p.referralBonusPoints}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Ended Pools */}
        {endedPools.length > 0 && (
          <section className="mb-12">
            <h2 className="text-xl font-semibold text-white/70 mb-5 flex items-center gap-2">
              <Trophy className="w-5 h-5 text-white/30" />
              Ended Pools
            </h2>
            <div className="space-y-3">
              {endedPools.map((p) => (
                <div key={p.poolId} className="glass-card p-5 opacity-80">
                  <div className="flex items-center justify-between flex-wrap gap-4">
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="font-semibold text-white/80">
                          {p.projectName}
                        </h3>
                        <span className="text-xs text-white/30 bg-white/5 px-2 py-0.5 rounded font-mono">
                          ${p.tokenSymbol}
                        </span>
                        <span className="ended-badge">ENDED</span>
                      </div>
                      <div className="flex items-center gap-3 mb-1.5 flex-wrap">
                        <TierBadge totalPoints={p.totalPoints} />
                      </div>
                      <div className="flex items-center gap-4 text-sm text-white/40">
                        <span>
                          Final Rank:{' '}
                          <span className="text-white/70 font-semibold">
                            #{p.rank}
                          </span>
                        </span>
                        <span>
                          {p.totalPoints.toLocaleString(undefined, {
                            maximumFractionDigits: 0,
                          })}{' '}
                          pts
                        </span>
                      </div>
                    </div>
                    <Link
                      href={`/pools/${p.poolId}`}
                      className="btn-secondary text-sm flex items-center gap-2 opacity-70"
                    >
                      View Results
                      <ChevronRight className="w-4 h-4" />
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Account Settings */}
        <section>
          <h2 className="text-xl font-semibold text-white mb-5 flex items-center gap-2">
            <Settings className="w-5 h-5 text-[#0088CC]" />
            Account Settings
          </h2>
          <div className="glass-card p-6 space-y-6">
            {/* Link X account */}
            <div>
              <label className="block text-sm font-medium text-white/70 mb-2">
                X (Twitter) Handle
              </label>
              <div className="flex gap-3">
                <input
                  type="text"
                  value={xInput}
                  onChange={(e) =>
                    setXInput(
                      e.target.value.replace('@', '').trim()
                    )
                  }
                  placeholder="username (without @)"
                  className="flex-1 bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white placeholder-white/25 focus:outline-none focus:border-[#0088CC]/50"
                />
                <button
                  onClick={handleSaveX}
                  disabled={savingX}
                  className="btn-primary text-sm flex items-center gap-2 disabled:opacity-40"
                >
                  {savingX ? (
                    <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  ) : (
                    <CheckCircle className="w-3.5 h-3.5" />
                  )}
                  Save
                </button>
              </div>
              {account?.xHandle && (
                <p className="mt-1.5 text-xs text-green-400">
                  ✓ Linked: @{account.xHandle}
                </p>
              )}
            </div>

            {/* Link Telegram */}
            <div>
              <label className="block text-sm font-medium text-white/70 mb-2">
                Telegram Username
              </label>
              <div className="flex gap-3">
                <input
                  type="text"
                  value={tgInput}
                  onChange={(e) =>
                    setTgInput(e.target.value.replace('@', '').trim())
                  }
                  placeholder="username (without @)"
                  className="flex-1 bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white placeholder-white/25 focus:outline-none focus:border-[#0088CC]/50"
                />
                <button
                  onClick={handleSaveTg}
                  disabled={savingTg}
                  className="btn-primary text-sm flex items-center gap-2 disabled:opacity-40"
                >
                  {savingTg ? (
                    <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  ) : (
                    <CheckCircle className="w-3.5 h-3.5" />
                  )}
                  Save
                </button>
              </div>
              {account?.telegramHandle && (
                <p className="mt-1.5 text-xs text-green-400">
                  ✓ Linked: @{account.telegramHandle}
                </p>
              )}
            </div>

            <p className="text-xs text-white/30 border-t border-white/5 pt-4">
              Linking your social accounts helps verify your post submissions and
              enables future Telegram Bot notifications.
            </p>
          </div>
        </section>
      </div>
    </div>
  );
}
