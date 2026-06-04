'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Trophy, Users, ChevronRight, Loader2 } from 'lucide-react';

interface Pool {
  id: string;
  project: { name: string; logoUrl: string | null };
  tokenSymbol: string;
  totalReward: string;
  status: 'ACTIVE' | 'ENDED' | 'DISTRIBUTED';
  _count: { participants: number };
}

export default function MiniAppLeaderboardPage() {
  const [pools, setPools] = useState<Pool[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/pools?limit=30')
      .then((r) => r.json())
      .then((d) => setPools(d.pools ?? []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const active = pools.filter((p) => p.status === 'ACTIVE');
  const ended = pools.filter((p) => p.status !== 'ACTIVE');

  return (
    <div className="pt-5 pb-4 px-4">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white mb-1 flex items-center gap-2">
          <Trophy className="w-6 h-6 text-[#0088CC]" /> Leaderboards
        </h1>
        <p className="text-white/50 text-sm">Select a pool to view its live rankings.</p>
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="w-8 h-8 text-[#0088CC]/50 animate-spin" />
        </div>
      ) : (
        <div className="space-y-8">
          {active.length > 0 && (
            <section>
              <h2 className="text-sm font-semibold text-white/70 uppercase tracking-wider mb-3">Live Pools</h2>
              <div className="space-y-2">
                {active.map((pool) => (
                  <Link
                    key={pool.id}
                    href={`/miniapp/pools/${pool.id}`}
                    className="glass-card p-4 flex items-center justify-between gap-3 hover:bg-white/[0.06] transition-colors"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-9 h-9 rounded-full bg-[#0088CC]/20 border border-[#0088CC]/30 flex items-center justify-center text-[#0088CC] font-bold text-xs flex-shrink-0 overflow-hidden">
                        {pool.project.logoUrl
                          ? <img src={pool.project.logoUrl} alt="" className="w-full h-full object-cover" />
                          : pool.project.name.slice(0, 2).toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <p className="font-semibold text-white text-sm truncate">{pool.project.name}</p>
                        <div className="flex items-center gap-2 text-xs text-white/40">
                          <Users className="w-3 h-3" />
                          <span>{pool._count.participants} participants</span>
                          <span>·</span>
                          <span>{pool.totalReward} {pool.tokenSymbol}</span>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <span className="live-badge flex items-center gap-1 text-[10px]">
                        <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />LIVE
                      </span>
                      <ChevronRight className="w-4 h-4 text-white/30" />
                    </div>
                  </Link>
                ))}
              </div>
            </section>
          )}

          {ended.length > 0 && (
            <section>
              <h2 className="text-sm font-semibold text-white/40 uppercase tracking-wider mb-3">Ended Pools</h2>
              <div className="space-y-2">
                {ended.map((pool) => (
                  <Link
                    key={pool.id}
                    href={`/miniapp/pools/${pool.id}`}
                    className="glass-card p-4 flex items-center justify-between gap-3 opacity-70 hover:opacity-100 transition-opacity"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-9 h-9 rounded-full bg-white/10 flex items-center justify-center text-white/40 font-bold text-xs flex-shrink-0">
                        {pool.project.name.slice(0, 2).toUpperCase()}
                      </div>
                      <div>
                        <p className="font-semibold text-white/80 text-sm">{pool.project.name}</p>
                        <p className="text-xs text-white/40">{pool._count.participants} participants</p>
                      </div>
                    </div>
                    <ChevronRight className="w-4 h-4 text-white/30 flex-shrink-0" />
                  </Link>
                ))}
              </div>
            </section>
          )}
        </div>
      )}
    </div>
  );
}
