'use client';
import { useEffect, useState } from 'react';
import { PoolCard } from '@/components/PoolCard';
import { Search, Loader2 } from 'lucide-react';

type StatusFilter = 'ALL' | 'ACTIVE' | 'ENDED';

interface Pool {
  id: string;
  project: { name: string; logoUrl: string | null };
  tokenSymbol: string;
  totalReward: string;
  durationDays: number;
  endDate: string;
  _count: { participants: number };
  rewardSlots: number;
  status: 'ACTIVE' | 'ENDED' | 'DISTRIBUTED';
}

function PoolSkeleton() {
  return (
    <div className="glass-card p-6 animate-pulse space-y-4">
      <div className="flex items-center gap-3">
        <div className="w-11 h-11 rounded-full bg-white/10" />
        <div className="space-y-2 flex-1">
          <div className="h-3 bg-white/10 rounded w-2/3" />
          <div className="h-2 bg-white/5 rounded w-1/3" />
        </div>
      </div>
      <div className="h-6 bg-white/10 rounded w-1/2" />
      <div className="grid grid-cols-3 gap-2">
        <div className="h-12 bg-white/5 rounded-xl" />
        <div className="h-12 bg-white/5 rounded-xl" />
        <div className="h-12 bg-white/5 rounded-xl" />
      </div>
    </div>
  );
}

export default function PoolsPage() {
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
    <div className="min-h-screen pt-24 pb-20 px-4">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-10">
          <h1 className="text-4xl font-bold text-white mb-2">Reward Pools</h1>
          <p className="text-white/50">
            Browse active marketing campaigns and earn rewards for your content.
          </p>
        </div>

        {/* Controls */}
        <div className="flex flex-col sm:flex-row gap-4 mb-8">
          {/* Search */}
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by project name or token..."
              className="w-full bg-white/5 border border-white/10 rounded-xl pl-10 pr-4 py-2.5 text-sm text-white placeholder-white/25 focus:outline-none focus:border-[#0088CC]/50"
            />
          </div>

          {/* Filter tabs */}
          <div className="flex rounded-xl overflow-hidden border border-white/10">
            {(['ALL', 'ACTIVE', 'ENDED'] as StatusFilter[]).map((s) => (
              <button
                key={s}
                onClick={() => setStatusFilter(s)}
                className={`px-5 py-2.5 text-sm font-medium transition-all ${
                  statusFilter === s
                    ? 'bg-[#0088CC] text-white'
                    : 'bg-transparent text-white/50 hover:text-white hover:bg-white/5'
                }`}
              >
                {s}
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <PoolSkeleton key={i} />
            ))}
          </div>
        ) : (
          <>
            {/* Live pools */}
            {(statusFilter === 'ALL' || statusFilter === 'ACTIVE') &&
              livePools.length > 0 && (
                <div className="mb-12">
                  <div className="flex items-center gap-3 mb-6">
                    <h2 className="text-xl font-semibold text-white">
                      Live Pools
                    </h2>
                    <span className="live-badge flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
                      {livePools.length} active
                    </span>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {livePools.map((pool) => (
                      <PoolCard
                        key={pool.id}
                        id={pool.id}
                        projectName={pool.project.name}
                        tokenSymbol={pool.tokenSymbol}
                        logoUrl={pool.project.logoUrl}
                        totalReward={pool.totalReward}
                        durationDays={pool.durationDays}
                        endDate={pool.endDate}
                        participantCount={pool._count.participants}
                        rewardSlots={pool.rewardSlots}
                        status={pool.status}
                      />
                    ))}
                  </div>
                </div>
              )}

            {/* Ended pools */}
            {(statusFilter === 'ALL' || statusFilter === 'ENDED') &&
              endedPools.length > 0 && (
                <div>
                  <div className="flex items-center gap-3 mb-6">
                    <h2 className="text-xl font-semibold text-white/70">
                      Ended Pools
                    </h2>
                    <span className="ended-badge">{endedPools.length} ended</span>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {endedPools.map((pool) => (
                      <PoolCard
                        key={pool.id}
                        id={pool.id}
                        projectName={pool.project.name}
                        tokenSymbol={pool.tokenSymbol}
                        logoUrl={pool.project.logoUrl}
                        totalReward={pool.totalReward}
                        durationDays={pool.durationDays}
                        endDate={pool.endDate}
                        participantCount={pool._count.participants}
                        rewardSlots={pool.rewardSlots}
                        status={pool.status}
                      />
                    ))}
                  </div>
                </div>
              )}

            {pools.length === 0 && (
              <div className="glass-card p-16 text-center text-white/40">
                <Loader2 className="w-10 h-10 mx-auto mb-3 opacity-30" />
                <p className="text-lg font-medium mb-1">No pools found</p>
                <p className="text-sm">
                  {search ? 'Try a different search term.' : 'Check back soon!'}
                </p>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
