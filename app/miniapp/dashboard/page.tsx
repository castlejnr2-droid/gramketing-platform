'use client';
import { useEffect, useState } from 'react';
import { useTonWallet, useTonConnectUI } from '@tonconnect/ui-react';
import Link from 'next/link';
import { getParticipantTier } from '@/lib/points';
import { Trophy, TrendingUp, Layers, ChevronRight, Wallet } from 'lucide-react';
import { ReferralCard } from '@/components/ReferralCard';

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
  id: string; projectName: string; tokenSymbol: string;
  totalReward: string; status: string; endDate: string; participantCount: number;
}

interface AccountInfo {
  walletAddress: string; username?: string; xHandle?: string; telegramChannelUrl?: string;
}

function TierBadge({ totalPoints }: { totalPoints: number }) {
  const { label, color, bg, border } = getParticipantTier(totalPoints);
  return (
    <span className={`inline-flex items-center text-[10px] font-bold px-1.5 py-0.5 rounded-full border ${color} ${bg} ${border}`}>
      {label}
    </span>
  );
}

export default function MiniAppDashboardPage() {
  const wallet = useTonWallet();
  const [tonConnectUI] = useTonConnectUI();
  const [activePools, setActivePools] = useState<MyPool[]>([]);
  const [endedPools, setEndedPools] = useState<MyPool[]>([]);
  const [ownedPools, setOwnedPools] = useState<OwnedPool[]>([]);
  const [account, setAccount] = useState<AccountInfo | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!wallet) { setLoading(false); return; }
    fetch('/api/dashboard', { credentials: 'include' })
      .then((r) => r.json())
      .then((d) => {
        setActivePools(d.activePools ?? []);
        setEndedPools(d.endedPools ?? []);
        setAccount(d.account ?? null);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [wallet]);

  useEffect(() => {
    if (!wallet) return;
    fetch(`/api/pools?ownerAddress=${encodeURIComponent(wallet.account.address)}&limit=20`)
      .then((r) => r.json())
      .then((d) => setOwnedPools((d.pools ?? []).map((p: { id: string; project: { name: string }; tokenSymbol: string; totalReward: string; status: string; endDate: string; _count: { participants: number } }) => ({
        id: p.id, projectName: p.project.name, tokenSymbol: p.tokenSymbol,
        totalReward: p.totalReward, status: p.status, endDate: p.endDate,
        participantCount: p._count.participants,
      }))))
      .catch(() => {});
  }, [wallet]);

  if (!wallet) {
    return (
      <div className="pt-12 px-4 flex flex-col items-center justify-center min-h-[60vh] text-center">
        <Trophy className="w-12 h-12 text-[#0088CC]/50 mb-4" />
        <h2 className="text-xl font-bold text-white mb-2">Connect Your Wallet</h2>
        <p className="text-white/50 text-sm mb-6">Connect your TON wallet to view your dashboard.</p>
        <button onClick={() => tonConnectUI.openModal()}
          className="btn-primary flex items-center gap-2">
          <Wallet className="w-4 h-4" /> Connect Wallet
        </button>
      </div>
    );
  }

  if (loading) {
    return <div className="pt-12 px-4 text-center text-white/40">Loading dashboard...</div>;
  }

  return (
    <div className="pt-5 pb-4 px-4 space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-white mb-1">Dashboard</h1>
        {account && (
          <p className="text-xs text-white/40 font-mono">
            {account.walletAddress.slice(0, 8)}...{account.walletAddress.slice(-6)}
          </p>
        )}
      </div>

      {/* Active pools */}
      <section>
        <h2 className="text-base font-semibold text-white mb-3 flex items-center gap-2">
          <TrendingUp className="w-4 h-4 text-[#0088CC]" /> My Active Pools
        </h2>
        {activePools.length === 0 ? (
          <div className="glass-card p-8 text-center text-white/40 text-sm">
            <p className="mb-3">Not in any active pools.</p>
            <Link href="/miniapp" className="btn-primary text-sm">Browse Pools</Link>
          </div>
        ) : (
          <div className="space-y-3">
            {activePools.map((p) => (
              <div key={p.poolId} className="glass-card p-4">
                <div className="flex items-center justify-between gap-3 mb-4">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <span className="font-semibold text-white text-sm">{p.projectName}</span>
                      <span className="text-xs text-[#0088CC] bg-[#0088CC]/10 px-1.5 py-0.5 rounded font-mono">${p.tokenSymbol}</span>
                      <TierBadge totalPoints={p.totalPoints} />
                    </div>
                    <div className="flex items-center gap-3 text-xs text-white/40">
                      <span>Rank <span className="text-[#0088CC] font-semibold">#{p.rank}</span> of {p.totalParticipants}</span>
                      <span>{p.totalPoints.toFixed(0)} pts</span>
                    </div>
                  </div>
                  <Link href={`/miniapp/pools/${p.poolId}`} className="btn-secondary text-xs flex items-center gap-1 flex-shrink-0">
                    View <ChevronRight className="w-3 h-3" />
                  </Link>
                </div>
                <div className="pt-3 border-t border-white/5">
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

      {/* Owned pools */}
      {ownedPools.length > 0 && (
        <section>
          <h2 className="text-base font-semibold text-white mb-3 flex items-center gap-2">
            <Layers className="w-4 h-4 text-[#0088CC]" /> My Created Pools
          </h2>
          <div className="space-y-3">
            {ownedPools.map((p) => (
              <div key={p.id} className="glass-card p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-semibold text-white text-sm">{p.projectName}</span>
                      {p.status === 'ACTIVE'
                        ? <span className="live-badge flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />LIVE</span>
                        : <span className="ended-badge text-[10px]">{p.status}</span>}
                    </div>
                    <p className="text-xs text-white/40">{p.participantCount} participants · {p.totalReward} {p.tokenSymbol}</p>
                  </div>
                  <Link href={`/miniapp/pools/${p.id}`} className="btn-secondary text-xs flex items-center gap-1 flex-shrink-0">
                    View <ChevronRight className="w-3 h-3" />
                  </Link>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Ended pools */}
      {endedPools.length > 0 && (
        <section>
          <h2 className="text-base font-semibold text-white/60 mb-3 flex items-center gap-2">
            <Trophy className="w-4 h-4 text-white/30" /> Ended Pools
          </h2>
          <div className="space-y-3">
            {endedPools.map((p) => (
              <div key={p.poolId} className="glass-card p-4 opacity-70">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-semibold text-white/80 text-sm">{p.projectName}</span>
                      <span className="ended-badge text-[10px]">ENDED</span>
                    </div>
                    <p className="text-xs text-white/40">Final rank #{p.rank} · {p.totalPoints.toFixed(0)} pts</p>
                  </div>
                  <Link href={`/miniapp/pools/${p.poolId}`} className="btn-secondary text-xs flex items-center gap-1 flex-shrink-0 opacity-70">
                    Results <ChevronRight className="w-3 h-3" />
                  </Link>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
