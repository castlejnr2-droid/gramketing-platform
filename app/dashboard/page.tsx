'use client';
import { getParticipantTier } from '@/lib/points';
import { useEffect, useState } from 'react';
import { useTonWallet, useTonConnectUI } from '@tonconnect/ui-react';
import Link from 'next/link';
import { ReferralCard } from '@/components/ReferralCard';
import { Trophy, TrendingUp, Settings, ChevronRight, CheckCircle, Layers, Wallet } from 'lucide-react';

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
  username?: string;
  xHandle?: string;
  telegramChannelUrl?: string;
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
  const [tonConnectUI] = useTonConnectUI();
  const [activePools, setActivePools] = useState<MyPool[]>([]);
  const [endedPools, setEndedPools] = useState<MyPool[]>([]);
  const [account, setAccount] = useState<AccountInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [ownedEndedPools, setOwnedEndedPools] = useState<OwnedPool[]>([]);

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
  const [tgChannelInput, setTgChannelInput] = useState('');
  const [usernameInput, setUsernameInput] = useState('');
  const [savingTgChannel, setSavingTgChannel] = useState(false);
  const [savingUsername, setSavingUsername] = useState(false);
  const [usernameError, setUsernameError] = useState<string | null>(null);
  const [tgChannelError, setTgChannelError] = useState<string | null>(null);

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
        if (d.account?.username) setUsernameInput(d.account.username);
        if (d.account?.telegramChannelUrl) setTgChannelInput(d.account.telegramChannelUrl);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [wallet]);

  const handleSaveUsername = async () => {
    setUsernameError(null);
    setSavingUsername(true);
    try {
      const res = await fetch('/api/auth/update-profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ username: usernameInput }),
      });
      if (!res.ok) {
        const d = await res.json();
        setUsernameError(d.error ?? 'Failed to save');
      } else {
        setAccount((prev) => prev ? { ...prev, username: usernameInput.trim() || undefined } : prev);
      }
    } catch {
      setUsernameError('Network error');
    } finally {
      setSavingUsername(false);
    }
  };

  const handleSaveTgChannel = async () => {
    setTgChannelError(null);
    setSavingTgChannel(true);
    try {
      const res = await fetch('/api/auth/link-telegram', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ channelUrl: tgChannelInput }),
      });
      if (!res.ok) {
        const d = await res.json();
        setTgChannelError(d.error ?? 'Failed to save');
      } else {
        setAccount((prev) => prev ? { ...prev, telegramChannelUrl: tgChannelInput.trim() } : prev);
      }
    } catch {
      setTgChannelError('Network error');
    } finally {
      setSavingTgChannel(false);
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
          <button
            onClick={() => tonConnectUI.openModal()}
            className="w-full flex items-center justify-center gap-2 px-6 py-3 rounded-xl text-sm font-semibold bg-[#0088CC] hover:bg-[#0099DD] text-white transition-all"
          >
            <Wallet className="w-4 h-4" />
            Connect Wallet
          </button>
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
            {/* Display Name */}
            <div>
              <label className="block text-sm font-medium text-white/70 mb-2">
                Display Name
              </label>
              <div className="flex gap-3">
                <input
                  type="text"
                  value={usernameInput}
                  onChange={(e) => { setUsernameInput(e.target.value); setUsernameError(null); }}
                  placeholder="e.g. CryptoMarketer"
                  maxLength={30}
                  className="flex-1 bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white placeholder-white/25 focus:outline-none focus:border-[#0088CC]/50"
                />
                <button
                  onClick={handleSaveUsername}
                  disabled={savingUsername}
                  className="btn-primary text-sm flex items-center gap-2 disabled:opacity-40"
                >
                  {savingUsername ? (
                    <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  ) : (
                    <CheckCircle className="w-3.5 h-3.5" />
                  )}
                  Save
                </button>
              </div>
              {usernameError && <p className="mt-1.5 text-xs text-red-400">{usernameError}</p>}
              {!usernameError && account?.username && (
                <p className="mt-1.5 text-xs text-green-400">✓ Display name: {account.username}</p>
              )}
              <p className="mt-1 text-xs text-white/30">
                Shown on leaderboards instead of your wallet address. Max 30 characters.
              </p>
            </div>

            {/* X Account */}
            <div>
              <label className="block text-sm font-medium text-white/70 mb-2">
                X (Twitter) Account
              </label>
              <div className="flex items-start gap-3 p-4 rounded-xl bg-white/[0.03] border border-white/10">
                <div className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                  <svg className="w-4 h-4 text-white/50" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.744l7.73-8.835L1.254 2.25H8.08l4.253 5.622 5.91-5.622zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
                  </svg>
                </div>
                <div>
                  <p className="text-sm font-medium text-white/60">X account verification coming soon</p>
                  <p className="text-xs text-white/30 mt-1">
                    OAuth verification is required to submit X posts and earn X points. This feature is under development.
                  </p>
                </div>
              </div>
            </div>

            {/* Telegram Channel */}
            <div>
              <label className="block text-sm font-medium text-white/70 mb-2">
                Telegram Channel
              </label>

              {/* Setup steps */}
              <div className="mb-3 p-4 rounded-xl bg-[#0088CC]/5 border border-[#0088CC]/15 space-y-2.5">
                <p className="text-xs font-semibold text-[#0088CC] uppercase tracking-wider mb-1">How to connect</p>
                <div className="flex items-start gap-2.5">
                  <span className="w-5 h-5 rounded-full bg-[#0088CC]/20 text-[#0088CC] text-[10px] font-bold flex items-center justify-center flex-shrink-0 mt-0.5">1</span>
                  <p className="text-xs text-white/60">
                    Add <span className="text-white font-semibold">@GramketingBot</span> as a member to your Telegram channel (not admin — a regular member is enough)
                  </p>
                </div>
                <div className="flex items-start gap-2.5">
                  <span className="w-5 h-5 rounded-full bg-[#0088CC]/20 text-[#0088CC] text-[10px] font-bold flex items-center justify-center flex-shrink-0 mt-0.5">2</span>
                  <p className="text-xs text-white/60">Enter your channel URL below</p>
                </div>
                <div className="flex items-start gap-2.5">
                  <span className="w-5 h-5 rounded-full bg-[#0088CC]/20 text-[#0088CC] text-[10px] font-bold flex items-center justify-center flex-shrink-0 mt-0.5">3</span>
                  <p className="text-xs text-white/60">Click Save</p>
                </div>
              </div>

              <div className="flex gap-3">
                <input
                  type="url"
                  value={tgChannelInput}
                  onChange={(e) => { setTgChannelInput(e.target.value); setTgChannelError(null); }}
                  placeholder="https://t.me/yourchannel"
                  className="flex-1 bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white placeholder-white/25 focus:outline-none focus:border-[#0088CC]/50"
                />
                <button
                  onClick={handleSaveTgChannel}
                  disabled={savingTgChannel}
                  className="btn-primary text-sm flex items-center gap-2 disabled:opacity-40"
                >
                  {savingTgChannel ? (
                    <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  ) : (
                    <CheckCircle className="w-3.5 h-3.5" />
                  )}
                  Save
                </button>
              </div>
              {tgChannelError && <p className="mt-1.5 text-xs text-red-400">{tgChannelError}</p>}
              {!tgChannelError && account?.telegramChannelUrl && (
                <p className="mt-1.5 text-xs text-green-400">✓ Channel: {account.telegramChannelUrl}</p>
              )}

              {/* Privacy note */}
              <p className="mt-3 text-xs text-white/30 leading-relaxed">
                The bot only reads post views and reactions. It cannot post, delete, or manage your channel.
              </p>
            </div>

            <p className="text-xs text-white/30 border-t border-white/5 pt-4">
              Social account verification is used to attribute post submissions and calculate your points correctly.
            </p>
          </div>
        </section>
      </div>
    </div>
  );
}
