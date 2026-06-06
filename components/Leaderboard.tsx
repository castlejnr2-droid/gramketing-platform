'use client';
import { useState, useEffect } from 'react';
import { getParticipantTier } from '@/lib/points';
import { X, ChevronDown, ChevronUp, Copy, CheckCheck, AlertCircle } from 'lucide-react';

interface LeaderboardEntry {
  rank: number;
  userId: string;
  walletAddress: string;
  username?: string | null;
  xHandle?: string | null;
  telegramHandle?: string | null;
  totalPoints: number;
  xPoints: number;
  telegramPoints: number;
  referralBonusPoints: number;
  referralMultiplier: number;
  holderBoost: number;
  totalParticipants: number;
}

interface LeaderboardProps {
  poolId: string;
  entries: LeaderboardEntry[];
  totalPoolReward: string;
  tokenSymbol: string;
  status: 'ACTIVE' | 'ENDED' | 'DISTRIBUTED';
}

// ── Detail modal types ──
interface Submission {
  id: string;
  platform: string;
  postUrl: string;
  currentViews: number;
  likes: number;
  reposts: number;
  reactions: number;
  currentPoints: number;
  status: string;
  submittedAt: string;
  scrapeError?: string | null;
}

interface ReferralBoostEntry {
  referredWallet: string;
  referredUsername?: string | null;
  referredXHandle?: string | null;
  referredHolding: string;
}

interface ParticipantDetail {
  userId: string;
  walletAddress: string;
  username?: string | null;
  xHandle?: string | null;
  telegramHandle?: string | null;
  totalPoints: number;
  xPoints: number;
  telegramPoints: number;
  referralBonusPoints: number;
  holderBoost: number;
  referralMultiplier: number;
  referralCode: string;
  joinedAt: string;
  rank: number;
  totalParticipants: number;
}

interface DetailData {
  participant: ParticipantDetail;
  submissions: Submission[];
  referralBoosts: ReferralBoostEntry[];
  pool: { campaignType: string };
}

// ── Helpers ──
function truncateWallet(addr: string): string {
  if (addr.length <= 12) return addr;
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

function displayName(entry: { username?: string | null; xHandle?: string | null; walletAddress: string }): string {
  if (entry.username) return entry.username;
  if (entry.xHandle) return `@${entry.xHandle}`;
  return truncateWallet(entry.walletAddress);
}

function MedalIcon({ rank }: { rank: number }) {
  if (rank === 1) return <span className="text-lg" title="1st Place">🥇</span>;
  if (rank === 2) return <span className="text-lg" title="2nd Place">🥈</span>;
  if (rank === 3) return <span className="text-lg" title="3rd Place">🥉</span>;
  return <span className="text-sm font-semibold text-white/40 w-7 text-center">#{rank}</span>;
}

function TierBadge({ totalPoints }: { totalPoints: number }) {
  const { label, color, bg, border } = getParticipantTier(totalPoints);
  return (
    <span className={`inline-flex items-center text-[10px] font-bold px-1.5 py-0.5 rounded-full border ${color} ${bg} ${border}`}>
      {label}
    </span>
  );
}

function estimateReward(totalPoints: number, allPoints: number, totalReward: string, symbol: string): string {
  if (allPoints === 0) return `0 ${symbol}`;
  const share = totalPoints / allPoints;
  const rewardNum = parseFloat(totalReward);
  if (isNaN(rewardNum)) return '-';
  const est = rewardNum * share;
  return `${est >= 1000 ? (est / 1000).toFixed(1) + 'K' : est.toFixed(0)} ${symbol}`;
}

// ── Referral Link Row ──
function ReferralLinkRow({ poolId, referralCode }: { poolId: string; referralCode: string }) {
  const [copied, setCopied] = useState(false);
  const [origin, setOrigin] = useState('');
  useEffect(() => { setOrigin(window.location.origin); }, []);
  const link = `${origin || 'https://gramketing.io'}/pools/${poolId}?ref=${referralCode}`;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(link);
    } catch {
      const el = document.createElement('input');
      el.value = link;
      document.body.appendChild(el);
      el.select();
      document.execCommand('copy');
      document.body.removeChild(el);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="glass-inner px-4 py-3 space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-white/40 uppercase tracking-wider">Referral link</span>
        <button
          onClick={handleCopy}
          className={`flex items-center gap-1 text-xs px-2.5 py-1 rounded-lg border transition-all ${
            copied
              ? 'bg-green-500/20 border-green-500/30 text-green-400'
              : 'bg-white/5 border-white/10 text-white/50 hover:text-white hover:border-white/20'
          }`}
        >
          {copied ? <CheckCheck className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
          {copied ? 'Copied!' : 'Copy'}
        </button>
      </div>
      <p className="text-xs text-white/40 font-mono truncate">{link}</p>
      <p className="text-[10px] text-white/25">Share this link to earn referral boost</p>
    </div>
  );
}

// ── Detail Modal ──
function ParticipantModal({
  poolId,
  userId,
  onClose,
  totalPoolReward,
  tokenSymbol,
  allPoints,
}: {
  poolId: string;
  userId: string;
  onClose: () => void;
  totalPoolReward: string;
  tokenSymbol: string;
  allPoints: number;
}) {
  const [data, setData] = useState<DetailData | null>(null);
  const [loading, setLoading] = useState(true);
  const [referralExpanded, setReferralExpanded] = useState(false);

  useEffect(() => {
    fetch(`/api/pools/${poolId}/participant/${userId}`)
      .then((r) => r.json())
      .then((d) => { setData(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, [poolId, userId]);

  const p = data?.participant;
  const campaignType = data?.pool.campaignType ?? 'both';

  const contentScore = (() => {
    if (!p) return 0;
    if (campaignType === 'x') return p.xPoints;
    if (campaignType === 'telegram') return p.telegramPoints;
    return p.xPoints * 0.5 + p.telegramPoints * 0.5;
  })();

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="glass-card w-full max-w-lg max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/10 sticky top-0 bg-[#0A0E1A]/80 backdrop-blur-sm z-10">
          <h3 className="font-semibold text-white">Participant Detail</h3>
          <button onClick={onClose} className="text-white/40 hover:text-white transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {loading ? (
          <div className="px-6 py-12 text-center text-white/40 text-sm">Loading...</div>
        ) : !data || !p ? (
          <div className="px-6 py-12 text-center text-white/40 text-sm">Failed to load data.</div>
        ) : (
          <div className="px-6 py-5 space-y-5">
            {/* Identity */}
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-full bg-[#0088CC]/20 border border-[#0088CC]/30 flex items-center justify-center text-[#0088CC] font-bold text-lg flex-shrink-0">
                {(p.username ?? p.xHandle ?? p.walletAddress).slice(0, 2).toUpperCase()}
              </div>
              <div>
                <p className="font-semibold text-white text-lg">
                  {displayName(p)}
                </p>
                <p className="text-xs text-white/40 font-mono">{truncateWallet(p.walletAddress)}</p>
                <div className="flex items-center gap-2 mt-1">
                  <TierBadge totalPoints={p.totalPoints} />
                  <span className="text-xs text-white/40">
                    Rank #{p.rank} of {p.totalParticipants}
                  </span>
                </div>
              </div>
            </div>

            {/* Score formula */}
            <div className="space-y-2.5">
              <p className="text-xs font-semibold text-white/40 uppercase tracking-wider">Score Breakdown</p>

              {/* X Posts */}
              {(campaignType === 'x' || campaignType === 'both') && (
                <div className="glass-inner px-4 py-3">
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-sm text-white/70 flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-[#0088CC]" />
                      X Posts
                      {campaignType === 'both' && <span className="text-white/30 text-xs">(50%)</span>}
                    </span>
                    <span className="text-sm font-semibold text-white">
                      {p.xPoints.toLocaleString(undefined, { maximumFractionDigits: 0 })} pts
                    </span>
                  </div>
                  {data.submissions.filter((s) => s.platform === 'X').length > 0 && (
                    <div className="space-y-1 mt-2">
                      {data.submissions.filter((s) => s.platform === 'X').map((s) => (
                        <div key={s.id} className="text-xs text-white/40 space-y-0.5">
                          <div className="flex justify-between">
                            <span className="truncate max-w-[60%]">
                              <a href={s.postUrl} target="_blank" rel="noopener noreferrer" className="hover:text-[#0088CC] transition-colors">
                                {s.postUrl.replace('https://x.com/', '')}
                              </a>
                            </span>
                            <span className="text-white/50 shrink-0 ml-2">
                              {s.currentViews.toLocaleString()}v · {s.likes}♥ · {s.reposts}↺ → {s.currentPoints.toFixed(0)}pts
                            </span>
                          </div>
                          {s.scrapeError && (
                            <div className="flex items-center gap-1 text-amber-400/80 text-[10px]">
                              <AlertCircle className="w-3 h-3 flex-shrink-0" />
                              {s.scrapeError.startsWith('TOKEN_EXPIRED') ? 'X token expired - last known metrics shown' : s.scrapeError}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                  <div className="mt-2 pt-2 border-t border-white/5 grid grid-cols-3 gap-1 text-[10px] text-white/30">
                    <span>Views × 80%</span>
                    <span>Likes × 10%</span>
                    <span>Reposts × 10%</span>
                  </div>
                </div>
              )}

              {/* Telegram Posts */}
              {(campaignType === 'telegram' || campaignType === 'both') && (
                <div className="glass-inner px-4 py-3">
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-sm text-white/70 flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-[#00BBFF]" />
                      Telegram Posts
                      {campaignType === 'both' && <span className="text-white/30 text-xs">(50%)</span>}
                    </span>
                    <span className="text-sm font-semibold text-white">
                      {p.telegramPoints.toLocaleString(undefined, { maximumFractionDigits: 0 })} pts
                    </span>
                  </div>
                  {data.submissions.filter((s) => s.platform === 'TELEGRAM').length > 0 && (
                    <div className="space-y-1 mt-2">
                      {data.submissions.filter((s) => s.platform === 'TELEGRAM').map((s) => (
                        <div key={s.id} className="text-xs text-white/40 flex justify-between">
                          <span className="truncate max-w-[60%]">
                            <a href={s.postUrl} target="_blank" rel="noopener noreferrer" className="hover:text-[#00BBFF] transition-colors">
                              {s.postUrl.replace('https://t.me/', '')}
                            </a>
                          </span>
                          <span className="text-white/50 shrink-0 ml-2">
                            {s.currentViews.toLocaleString()}v · {s.reactions}♡ → {s.currentPoints.toFixed(0)}pts
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                  <div className="mt-2 pt-2 border-t border-white/5 grid grid-cols-2 gap-1 text-[10px] text-white/30">
                    <span>Views × 80%</span>
                    <span>Reactions × 20%</span>
                  </div>
                </div>
              )}

              {/* Content score subtotal */}
              <div className="glass-inner px-4 py-2.5 flex items-center justify-between">
                <span className="text-sm text-white/50">Content Score</span>
                <span className="text-sm font-semibold text-white/80">
                  {contentScore.toLocaleString(undefined, { maximumFractionDigits: 1 })} pts
                </span>
              </div>

              {/* Holder Boost */}
              <div className="glass-inner px-4 py-2.5 flex items-center justify-between">
                <span className="text-sm text-white/70 flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-yellow-400" />
                  Holder Boost
                </span>
                <span className="text-sm font-semibold text-yellow-400">
                  {p.holderBoost.toFixed(2)}x
                </span>
              </div>

              {/* Referral Boost (expandable) */}
              <div className="glass-inner overflow-hidden">
                <button
                  className="w-full px-4 py-2.5 flex items-center justify-between"
                  onClick={() => setReferralExpanded(!referralExpanded)}
                >
                  <span className="text-sm text-white/70 flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-purple-400" />
                    Referral Boost
                  </span>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-purple-400">
                      {p.referralMultiplier.toFixed(2)}x
                    </span>
                    {referralExpanded ? (
                      <ChevronUp className="w-4 h-4 text-white/30" />
                    ) : (
                      <ChevronDown className="w-4 h-4 text-white/30" />
                    )}
                  </div>
                </button>
                {referralExpanded && data.referralBoosts.length > 0 && (
                  <div className="px-4 pb-3 border-t border-white/5 pt-2 space-y-1.5">
                    {data.referralBoosts.map((b, i) => (
                      <div key={i} className="text-xs text-white/40 flex justify-between">
                        <span>
                          {b.referredUsername ?? (b.referredXHandle ? `@${b.referredXHandle}` : truncateWallet(b.referredWallet))}
                        </span>
                        <span className="text-white/50">
                          {(BigInt(b.referredHolding) / 1_000_000_000n).toLocaleString()} tokens
                        </span>
                      </div>
                    ))}
                  </div>
                )}
                {referralExpanded && data.referralBoosts.length === 0 && (
                  <div className="px-4 pb-3 border-t border-white/5 pt-2 text-xs text-white/30">
                    No token-holding referrals yet.
                  </div>
                )}
              </div>

              {/* Referral Bonus */}
              {p.referralBonusPoints > 0 && (
                <div className="glass-inner px-4 py-2.5 flex items-center justify-between">
                  <span className="text-sm text-white/70 flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-[#9966FF]" />
                    Referral Bonus
                  </span>
                  <span className="text-sm font-semibold text-[#9966FF]">
                    +{p.referralBonusPoints.toLocaleString(undefined, { maximumFractionDigits: 0 })} pts
                  </span>
                </div>
              )}

              {/* Referral Link */}
              <ReferralLinkRow poolId={poolId} referralCode={p.referralCode} />

              {/* Total */}
              <div className="border-t border-white/10 pt-3 flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold text-white">Total Score</p>
                  <p className="text-[10px] text-white/30 mt-0.5">
                    = (contentScore × holderBoost × referralBoost) + referralBonus
                  </p>
                </div>
                <span className="text-xl font-bold text-[#0088CC]">
                  {p.totalPoints.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                </span>
              </div>

              {/* Est. reward */}
              <div className="p-3 rounded-xl bg-[#0088CC]/10 border border-[#0088CC]/20 flex items-center justify-between">
                <span className="text-sm text-white/60">Est. Reward</span>
                <span className="text-sm font-bold text-[#0088CC]">
                  {estimateReward(p.totalPoints, allPoints, totalPoolReward, tokenSymbol)}
                </span>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Main Leaderboard ──
export function Leaderboard({
  poolId,
  entries,
  totalPoolReward,
  tokenSymbol,
  status,
}: LeaderboardProps) {
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const totalPoints = entries.reduce((s, e) => s + e.totalPoints, 0);

  return (
    <>
      <div className="glass-card overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/10">
          <div>
            <h2 className="font-semibold text-white">Leaderboard</h2>
            {status === 'ACTIVE' && (
              <p className="text-xs text-white/40 mt-0.5">Updates every 30 min · Click a row for details</p>
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
                  <th className="px-6 py-3 text-left text-xs font-medium text-white/40 uppercase tracking-wider">Rank</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-white/40 uppercase tracking-wider">Participant</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-white/40 uppercase tracking-wider">Points</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-white/40 uppercase tracking-wider">Est. Reward</th>
                </tr>
              </thead>
              <tbody>
                {entries.map((entry) => (
                  <tr
                    key={entry.userId}
                    className="glass-row cursor-pointer group"
                    onClick={() => setSelectedUserId(entry.userId)}
                  >
                    {/* Rank */}
                    <td className="px-6 py-4">
                      <div className="flex items-center">
                        <MedalIcon rank={entry.rank} />
                      </div>
                    </td>

                    {/* Participant */}
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-[#0088CC]/20 border border-[#0088CC]/30 flex items-center justify-center text-[#0088CC] text-xs font-bold flex-shrink-0">
                          {(entry.username ?? entry.xHandle ?? entry.walletAddress).slice(0, 2).toUpperCase()}
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <p className="text-sm font-medium text-white group-hover:text-[#00AAFF] transition-colors">
                              {displayName(entry)}
                            </p>
                            <TierBadge totalPoints={entry.totalPoints} />
                          </div>
                          <p className="text-xs text-white/40">
                            {truncateWallet(entry.walletAddress)}
                          </p>
                        </div>
                      </div>
                    </td>

                    {/* Points */}
                    <td className="px-6 py-4 text-right">
                      <span className="text-sm font-semibold text-white">
                        {entry.totalPoints.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                      </span>
                      <div className="text-xs text-white/30 mt-0.5">
                        {entry.holderBoost > 1 && (
                          <span className="text-yellow-400">{entry.holderBoost.toFixed(2)}x boost</span>
                        )}
                      </div>
                    </td>

                    {/* Estimated reward */}
                    <td className="px-6 py-4 text-right">
                      <span className="text-sm font-semibold text-[#0088CC]">
                        {estimateReward(entry.totalPoints, totalPoints, totalPoolReward, tokenSymbol)}
                      </span>
                      <div className="text-xs text-white/30 mt-0.5">
                        {totalPoints > 0 ? ((entry.totalPoints / totalPoints) * 100).toFixed(1) : '0'}%
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Detail Modal */}
      {selectedUserId && (
        <ParticipantModal
          poolId={poolId}
          userId={selectedUserId}
          onClose={() => setSelectedUserId(null)}
          totalPoolReward={totalPoolReward}
          tokenSymbol={tokenSymbol}
          allPoints={totalPoints}
        />
      )}
    </>
  );
}
