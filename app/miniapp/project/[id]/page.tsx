'use client';
import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { PoolCard } from '@/components/PoolCard';
import { ArrowLeft, Trophy, Users } from 'lucide-react';

interface ProjectData {
  id: string;
  name: string;
  tokenSymbol: string;
  logoUrl?: string;
  description?: string;
  ownerWalletAddress: string;
  createdAt: string;
  pools: PoolItem[];
}

interface PoolItem {
  id: string;
  status: 'ACTIVE' | 'ENDED' | 'DISTRIBUTED';
  totalReward: string;
  tokenSymbol: string;
  durationDays: number;
  endDate: string;
  rewardSlots: number;
  _count: { participants: number };
}

export default function MiniAppProjectPage() {
  const params = useParams();
  const router = useRouter();
  const projectId = params.id as string;

  const [project, setProject] = useState<ProjectData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/projects/${projectId}`)
      .then((r) => r.json())
      .then((d) => setProject(d.project ?? null))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [projectId]);

  if (loading) {
    return (
      <div className="pt-12 px-4 text-center text-white/40">Loading project...</div>
    );
  }

  if (!project) {
    return (
      <div className="pt-12 px-4 text-center text-white/40">Project not found.</div>
    );
  }

  const activePools = project.pools.filter((p) => p.status === 'ACTIVE');
  const pastPools = project.pools.filter((p) => p.status !== 'ACTIVE');

  const totalParticipants = project.pools.reduce(
    (sum, p) => sum + p._count.participants,
    0
  );

  const totalRewardDistributed = project.pools
    .filter((p) => p.status === 'DISTRIBUTED')
    .reduce((sum, p) => sum + parseFloat(p.totalReward), 0);

  const initials = project.name
    .split(' ')
    .map((w: string) => w[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);

  return (
    <div className="pt-5 pb-6 px-4">
      {/* Back */}
      <button
        onClick={() => router.back()}
        className="flex items-center gap-2 text-white/40 hover:text-white transition-colors text-sm mb-5"
      >
        <ArrowLeft className="w-4 h-4" />
        Back
      </button>

      {/* Project header */}
      <div className="glass-card p-5 mb-6">
        <div className="flex items-start gap-4">
          <div className="w-14 h-14 rounded-2xl bg-[#0088CC]/20 border border-[#0088CC]/30 flex items-center justify-center text-[#0088CC] font-bold text-lg flex-shrink-0 overflow-hidden">
            {project.logoUrl ? (
              <img src={project.logoUrl} alt={project.name} className="w-full h-full object-cover" />
            ) : (
              initials
            )}
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap mb-1">
              <h1 className="text-xl font-bold text-white">{project.name}</h1>
              <span className="text-xs text-[#0088CC] font-mono bg-[#0088CC]/10 px-2 py-0.5 rounded">
                ${project.tokenSymbol}
              </span>
            </div>
            {project.description && (
              <p className="text-white/50 text-sm leading-relaxed">{project.description}</p>
            )}
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-2 mt-4">
          <div className="bg-white/[0.03] rounded-xl p-3 border border-white/5 text-center">
            <p className="text-xs text-white/40 mb-0.5">Pools</p>
            <p className="font-bold text-white">{project.pools.length}</p>
          </div>
          <div className="bg-white/[0.03] rounded-xl p-3 border border-white/5 text-center">
            <div className="flex items-center justify-center gap-1 mb-0.5">
              <Users className="w-3 h-3 text-white/30" />
              <p className="text-xs text-white/40">Marketers</p>
            </div>
            <p className="font-bold text-white">{totalParticipants}</p>
          </div>
          <div className="bg-white/[0.03] rounded-xl p-3 border border-white/5 text-center">
            <div className="flex items-center justify-center gap-1 mb-0.5">
              <Trophy className="w-3 h-3 text-white/30" />
              <p className="text-xs text-white/40">Distributed</p>
            </div>
            <p className="font-bold text-[#0088CC] text-xs">
              {totalRewardDistributed > 0
                ? `${totalRewardDistributed.toLocaleString()} ${project.tokenSymbol}`
                : '—'}
            </p>
          </div>
        </div>
      </div>

      {/* Active Pools */}
      {activePools.length > 0 && (
        <section className="mb-6">
          <div className="flex items-center gap-2 mb-3">
            <h2 className="text-base font-semibold text-white">Active Pools</h2>
            <span className="live-badge flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
              {activePools.length} live
            </span>
          </div>
          <div className="space-y-4">
            {activePools.map((pool) => (
              <PoolCard
                key={pool.id}
                id={pool.id}
                projectName={project.name}
                tokenSymbol={pool.tokenSymbol}
                logoUrl={project.logoUrl}
                totalReward={pool.totalReward}
                durationDays={pool.durationDays}
                endDate={pool.endDate}
                participantCount={pool._count.participants}
                rewardSlots={pool.rewardSlots}
                status={pool.status}
                linkTo={`/miniapp/pools/${pool.id}`}
              />
            ))}
          </div>
        </section>
      )}

      {/* Past Pools */}
      {pastPools.length > 0 && (
        <section>
          <h2 className="text-base font-semibold text-white/60 mb-3">Past Pools</h2>
          <div className="space-y-4">
            {pastPools.map((pool) => (
              <PoolCard
                key={pool.id}
                id={pool.id}
                projectName={project.name}
                tokenSymbol={pool.tokenSymbol}
                logoUrl={project.logoUrl}
                totalReward={pool.totalReward}
                durationDays={pool.durationDays}
                endDate={pool.endDate}
                participantCount={pool._count.participants}
                rewardSlots={pool.rewardSlots}
                status={pool.status}
                linkTo={`/miniapp/pools/${pool.id}`}
              />
            ))}
          </div>
        </section>
      )}

      {project.pools.length === 0 && (
        <div className="glass-card p-10 text-center text-white/40 text-sm">
          No pools created yet for this project.
        </div>
      )}
    </div>
  );
}
