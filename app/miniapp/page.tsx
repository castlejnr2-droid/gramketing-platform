'use client';
import { useEffect, useState } from 'react';
import { PoolCard } from '@/components/PoolCard';
import { Search, Loader2 } from 'lucide-react';

type StatusFilter = 'ALL' | 'ACTIVE' | 'ENDED';

interface Pool {
  id: string;
  slug?: string | null;
  project: { name: string; logoUrl: string | null };
  tokenSymbol: string;
  totalReward: string;
  durationDays: number;
  endDate: string;
  _count: { participants: number };
  rewardSlots: number;
  status: 'ACTIVE' | 'ENDED' | 'DISTRIBUTED';
}

export default function MiniAppPoolsPage() {
  const [pools, setPools] = useState<Pool[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('ALL');
  const [search, setSearch] = useState('');

  useEffect(() => {
    setLoading(true);
    const params = new URLSearchParams();
    if (statusFilter !== 'ALL') params.set('status', statusFilter);
    if (search.trim()) params.set('search', search.trim());
    fetch(`/api/pools?${params}`)
      .then((r) => r.json())
      .then((d) => setPools(d.pools ?? []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [statusFilter, search]);

  const livePools = pools.filter((p) => p.status === 'ACTIVE');
  const endedPools = pools.filter((p) => p.status !== 'ACTIVE');

  return (
    <div className="pt-5 pb-4 px-4">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white mb-1">Reward Pools</h1>
        <p className="text-white/50 text-sm">Earn rewards for promoting TON projects.</p>
      </div>

      {/* Controls */}
      <div className="flex flex-col gap-3 mb-6">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search pools..."
            className="w-full bg-white/5 border border-white/10 rounded-xl pl-9 pr-4 py-2.5 text-sm text-white placeholder-white/25 focus:outline-none focus:border-[#0088CC]/50"
          />
        </div>
        <div className="flex rounded-xl overflow-hidden border border-white/10">
          {(['ALL', 'ACTIVE', 'ENDED'] as StatusFilter[]).map((s) => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={`flex-1 py-2 text-sm font-medium transition-all ${
                statusFilter === s
                  ? 'bg-[#0088CC] text-white'
                  : 'bg-transparent text-white/50 hover:text-white'
              }`}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="w-8 h-8 text-[#0088CC]/50 animate-spin" />
        </div>
      ) : (
        <div className="space-y-10">
          {(statusFilter === 'ALL' || statusFilter === 'ACTIVE') && livePools.length > 0 && (
            <section>
              <div className="flex items-center gap-2 mb-4">
                <h2 className="text-base font-semibold text-white">Live Pools</h2>
                <span className="live-badge flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
                  {livePools.length} active
                </span>
              </div>
              <div className="space-y-4">
                {livePools.map((pool) => (
                  <PoolCard
                    key={pool.id}
                    id={pool.id}
                    slug={pool.slug}
                    projectName={pool.project.name}
                    tokenSymbol={pool.tokenSymbol}
                    logoUrl={pool.project.logoUrl}
                    totalReward={pool.totalReward}
                    durationDays={pool.durationDays}
                    endDate={pool.endDate}
                    participantCount={pool._count.participants}
                    rewardSlots={pool.rewardSlots}
                    status={pool.status}
                    linkTo={`/miniapp/pools/${pool.slug ?? pool.id}`}
                  />
                ))}
              </div>
            </section>
          )}

          {(statusFilter === 'ALL' || statusFilter === 'ENDED') && endedPools.length > 0 && (
            <section>
              <div className="flex items-center gap-2 mb-4">
                <h2 className="text-base font-semibold text-white/60">Ended Pools</h2>
                <span className="ended-badge">{endedPools.length}</span>
              </div>
              <div className="space-y-4">
                {endedPools.map((pool) => (
                  <PoolCard
                    key={pool.id}
                    id={pool.id}
                    slug={pool.slug}
                    projectName={pool.project.name}
                    tokenSymbol={pool.tokenSymbol}
                    logoUrl={pool.project.logoUrl}
                    totalReward={pool.totalReward}
                    durationDays={pool.durationDays}
                    endDate={pool.endDate}
                    participantCount={pool._count.participants}
                    rewardSlots={pool.rewardSlots}
                    status={pool.status}
                    linkTo={`/miniapp/pools/${pool.slug ?? pool.id}`}
                  />
                ))}
              </div>
            </section>
          )}

          {pools.length === 0 && (
            <div className="glass-card p-12 text-center text-white/40">
              <p className="mb-1">No pools found</p>
              <p className="text-sm">{search ? 'Try a different search.' : 'Check back soon!'}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
