'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Users, Trophy, Clock } from 'lucide-react';

interface PoolCardProps {
  id: string;
  projectName: string;
  tokenSymbol: string;
  logoUrl?: string | null;
  totalReward: string;
  durationDays: number;
  endDate: string | Date;
  participantCount: number;
  rewardSlots: number;
  status: 'ACTIVE' | 'ENDED' | 'DISTRIBUTED';
}

function formatCountdown(ms: number): string {
  if (ms <= 0) return 'Ended';
  const d = Math.floor(ms / 86_400_000);
  const h = Math.floor((ms % 86_400_000) / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  const s = Math.floor((ms % 60_000) / 1_000);
  if (d > 0) return `${d}d ${h}h ${m}m`;
  if (h > 0) return `${h}h ${m}m ${s}s`;
  return `${m}m ${s}s`;
}

function formatReward(totalReward: string, symbol: string): string {
  const n = parseFloat(totalReward);
  if (isNaN(n)) return `${totalReward} ${symbol}`;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M ${symbol}`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K ${symbol}`;
  return `${n.toLocaleString()} ${symbol}`;
}

export function PoolCard({
  id,
  projectName,
  tokenSymbol,
  logoUrl,
  totalReward,
  durationDays,
  endDate,
  participantCount,
  rewardSlots,
  status,
}: PoolCardProps) {
  const router = useRouter();
  const [countdown, setCountdown] = useState('');

  useEffect(() => {
    if (status !== 'ACTIVE') return;
    const end = new Date(endDate).getTime();

    const tick = () => {
      const remaining = end - Date.now();
      setCountdown(formatCountdown(remaining));
    };
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [endDate, status]);

  const initials = projectName
    .split(' ')
    .map((w) => w[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);

  return (
    <div
      className="pool-card p-6 cursor-pointer group"
      onClick={() => router.push(`/pools/${id}`)}
    >
      {/* Header */}
      <div className="flex items-start justify-between mb-5">
        <div className="flex items-center gap-3">
          {/* Logo / Fallback */}
          {logoUrl ? (
            <img
              src={logoUrl}
              alt={projectName}
              className="w-11 h-11 rounded-full object-cover border border-white/10"
              onError={(e) => {
                (e.target as HTMLImageElement).style.display = 'none';
              }}
            />
          ) : (
            <div className="w-11 h-11 rounded-full bg-[#0088CC]/20 border border-[#0088CC]/30 flex items-center justify-center text-[#0088CC] font-bold text-sm">
              {initials}
            </div>
          )}
          <div>
            <h3 className="font-semibold text-white group-hover:text-[#00AAFF] transition-colors">
              {projectName}
            </h3>
            <span className="text-xs text-white/40">${tokenSymbol}</span>
          </div>
        </div>

        {/* Status badge */}
        {status === 'ACTIVE' ? (
          <span className="live-badge flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
            LIVE
          </span>
        ) : (
          <span className="ended-badge">ENDED</span>
        )}
      </div>

      {/* Prize pool */}
      <div className="mb-5">
        <p className="text-xs text-white/40 uppercase tracking-wider mb-1">
          Prize Pool
        </p>
        <p className="text-2xl font-bold text-white">
          {formatReward(totalReward, tokenSymbol)}
        </p>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-3 gap-3 text-center">
        {/* Duration */}
        <div className="glass-inner p-2.5">
          <p className="text-xs text-white/40 mb-0.5">Duration</p>
          <p className="text-sm font-semibold text-white/80">
            {durationDays}d
          </p>
        </div>

        {/* Participants */}
        <div className="glass-inner p-2.5">
          <div className="flex items-center justify-center gap-1 mb-0.5">
            <Users className="w-3 h-3 text-white/30" />
            <p className="text-xs text-white/40">Joined</p>
          </div>
          <p className="text-sm font-semibold text-white/80">
            {participantCount}
          </p>
        </div>

        {/* Reward slots */}
        <div className="glass-inner p-2.5">
          <div className="flex items-center justify-center gap-1 mb-0.5">
            <Trophy className="w-3 h-3 text-white/30" />
            <p className="text-xs text-white/40">Slots</p>
          </div>
          <p className="text-sm font-semibold text-white/80">{rewardSlots}</p>
        </div>
      </div>

      {/* Countdown */}
      {status === 'ACTIVE' && countdown && (
        <div className="mt-4 flex items-center gap-2 text-sm text-white/50">
          <Clock className="w-3.5 h-3.5 text-[#0088CC]" />
          <span>Ends in </span>
          <span className="text-[#0088CC] font-semibold">{countdown}</span>
        </div>
      )}
    </div>
  );
}
