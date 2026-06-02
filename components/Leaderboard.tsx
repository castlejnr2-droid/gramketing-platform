'use client';
import { useRouter } from 'next/navigation';

interface LeaderboardEntry {
  rank: number;
  userId: string;
  walletAddress: string;
  xHandle?: string | null;
  totalPoints: number;
  xPoints: number;
  telegramPoints: number;
  referralBonusPoints: number;
  referralMultiplier: number;
  holderBoost: number;
}

interface LeaderboardProps {
  poolId: string;
  entries: LeaderboardEntry[];
  totalPoolReward: string;
  tokenSymbol: string;
  status: 'ACTIVE' | 'ENDED' | 'DISTRIBUTED';
}

function truncateWallet(addr: string): string {
  if (addr.length <= 12) return addr;
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

function MedalIcon({ rank }: { rank: number }) {
  if (rank === 1)
    return (
      <span className="text-lg" title="1st Place">
        🥇
      </span>
    );
  if (rank === 2)
    return (
      <span className="text-lg" title="2nd Place">
        🥈
      </span>
    );
  if (rank === 3)
    return (
      <span className="text-lg" title="3rd Place">
        🥉
      </span>
    );
  return (
    <span className="text-sm font-semibold text-white/40 w-7 text-center">
      #{rank}
    </span>
  );
}

function estimateReward(
  totalPoints: number,
  allPoints: number,
  totalReward: string,
  symbol: string
): string {
  if (allPoints === 0) return `0 ${symbol}`;
  const share = totalPoints / allPoints;
  const rewardNum = parseFloat(totalReward);
  if (isNaN(rewardNum)) return '—';
  const est = rewardNum * share;
  return `${est >= 1000 ? (est / 1000).toFixed(1) + 'K' : est.toFixed(0)} ${symbol}`;
}

export function Leaderboard({
  poolId,
  entries,
  totalPoolReward,
  tokenSymbol,
  status,
}: LeaderboardProps) {
  const router = useRouter();
  const totalPoints = entries.reduce((s, e) => s + e.totalPoints, 0);

  return (
    <div className="glass-card overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-white/10">
        <div>
          <h2 className="font-semibold text-white">Leaderboard</h2>
          {status === 'ACTIVE' && (
            <p className="text-xs text-white/40 mt-0.5">Updates every 30 min</p>
          )}
        </div>
        {status !== 'ACTIVE' && (
          <span className="text-xs font-semibold bg-yellow-500/20 text-yellow-400 border border-yellow-500/30 px-3 py-1 rounded-full">
            Final Results
          </span>
        )}
      </div>

      {/* Table */}
      {entries.length === 0 ? (
        <div className="px-6 py-12 text-center text-white/40 text-sm">
          No participants yet. Be the first to join!
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-white/5">
                <th className="px-6 py-3 text-left text-xs font-medium text-white/40 uppercase tracking-wider">
                  Rank
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-white/40 uppercase tracking-wider">
                  Marketer
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-white/40 uppercase tracking-wider">
                  Points
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-white/40 uppercase tracking-wider">
                  Est. Reward
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {entries.map((entry) => (
                <tr
                  key={entry.userId}
                  className="hover:bg-white/[0.03] cursor-pointer transition-colors group"
                  onClick={() =>
                    router.push(`/leaderboard/${poolId}/${entry.userId}`)
                  }
                >
                  {/* Rank */}
                  <td className="px-6 py-4">
                    <div className="flex items-center">
                      <MedalIcon rank={entry.rank} />
                    </div>
                  </td>

                  {/* Marketer */}
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      {/* Avatar */}
                      <div className="w-8 h-8 rounded-full bg-[#0088CC]/20 border border-[#0088CC]/30 flex items-center justify-center text-[#0088CC] text-xs font-bold flex-shrink-0">
                        {(entry.xHandle ?? entry.walletAddress)
                          .slice(0, 2)
                          .toUpperCase()}
                      </div>
                      <div>
                        {entry.xHandle && (
                          <p className="text-sm font-medium text-white group-hover:text-[#00AAFF] transition-colors">
                            @{entry.xHandle}
                          </p>
                        )}
                        <p className="text-xs text-white/40">
                          {truncateWallet(entry.walletAddress)}
                        </p>
                      </div>
                    </div>
                  </td>

                  {/* Points */}
                  <td className="px-6 py-4 text-right">
                    <span className="text-sm font-semibold text-white">
                      {entry.totalPoints.toLocaleString(undefined, {
                        maximumFractionDigits: 0,
                      })}
                    </span>
                    <div className="text-xs text-white/30 mt-0.5">
                      {entry.holderBoost > 1 && (
                        <span className="text-[#0088CC]">
                          {entry.holderBoost}x boost
                        </span>
                      )}
                    </div>
                  </td>

                  {/* Estimated reward */}
                  <td className="px-6 py-4 text-right">
                    <span className="text-sm font-semibold text-[#0088CC]">
                      {estimateReward(
                        entry.totalPoints,
                        totalPoints,
                        totalPoolReward,
                        tokenSymbol
                      )}
                    </span>
                    <div className="text-xs text-white/30 mt-0.5">
                      {totalPoints > 0
                        ? ((entry.totalPoints / totalPoints) * 100).toFixed(1)
                        : '0'}
                      %
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
