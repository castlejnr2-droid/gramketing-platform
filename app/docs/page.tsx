'use client';
import { useState } from 'react';
import Link from 'next/link';
import { ScoringExample } from '@/components/ScoringExample';

function TelegramIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm5.894 8.221-1.97 9.28c-.145.658-.537.818-1.084.508l-3-2.21-1.447 1.394c-.16.16-.295.295-.605.295l.213-3.053 5.56-5.023c.242-.213-.054-.333-.373-.12L7.19 13.676l-2.96-.924c-.643-.204-.657-.643.136-.953l11.57-4.461c.537-.194 1.006.131.958.883z" />
    </svg>
  );
}

function XIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.744l7.73-8.835L1.254 2.25H8.08l4.253 5.622 5.91-5.622zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
  );
}

const sections = [
  { id: 'what-is', label: 'What is GRAMKETING', group: 'Overview' },
  { id: 'how-pools', label: 'How Pools Work', group: 'Overview' },
  { id: 'leaderboard', label: 'How the Leaderboard Works', group: 'Overview' },
  { id: 'distribution', label: 'Reward Distribution', group: 'Overview' },
  { id: 'participant-tiers', label: 'Participant Tiers', group: 'For Contributors & Promoters' },
  { id: 'connect-x', label: 'Connect Your X Account', group: 'For Contributors & Promoters' },
  { id: 'connect-tg', label: 'Connect Telegram', group: 'For Contributors & Promoters' },
  { id: 'submit-posts', label: 'Submitting Posts', group: 'For Contributors & Promoters' },
  { id: 'daily-limit', label: 'Daily Submission Limits', group: 'For Contributors & Promoters' },
  { id: 'points-calc', label: 'Points Calculation', group: 'For Contributors & Promoters' },
  { id: 'scoring-system', label: 'Scoring System', group: 'For Contributors & Promoters' },
  { id: 'holder-boost', label: 'Holder Boost (Proportional)', group: 'For Contributors & Promoters' },
  { id: 'referral', label: 'Referral System', group: 'For Contributors & Promoters' },
  { id: 'points-decrease', label: 'Points Can Decrease', group: 'For Contributors & Promoters' },
  { id: 'create-pool', label: 'Creating a Pool', group: 'For Projects' },
  { id: 'pricing', label: 'Pricing Table', group: 'For Projects' },
  { id: 'escrow', label: 'Escrow System', group: 'For Projects' },
  { id: 'reward-slots', label: 'Reward Slots', group: 'For Projects' },
  { id: 'pool-end', label: 'When Pool Ends', group: 'For Projects' },
];

const groups = ['Overview', 'For Contributors & Promoters', 'For Projects'];

function Section({
  id,
  title,
  children,
}: {
  id: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div id={id} className="glass-card p-7 scroll-mt-24">
      <h2 className="text-xl font-bold text-white mb-4">{title}</h2>
      <div className="text-white/60 text-sm leading-relaxed space-y-3">
        {children}
      </div>
    </div>
  );
}

interface ScoringMetric {
  name: string;
  platformPct: number;
  combinedPct: number;
}

function ScoringTable({
  platform,
  emoji,
  color,
  metrics,
  totalCombined,
}: {
  platform: string;
  emoji: string;
  color: 'blue' | 'green';
  metrics: ScoringMetric[];
  totalCombined: number;
}) {
  const accent = color === 'blue' ? '#0088CC' : '#22c55e';
  const barBg = color === 'blue' ? 'rgba(0,136,204,0.15)' : 'rgba(34,197,94,0.15)';
  const barFill = color === 'blue' ? '#0088CC' : '#22c55e';
  const summaryBg = color === 'blue' ? 'rgba(0,136,204,0.08)' : 'rgba(34,197,94,0.08)';
  const summaryBorder = color === 'blue' ? 'rgba(0,136,204,0.25)' : 'rgba(34,197,94,0.25)';

  return (
    <div className="mb-6">
      <div className="flex items-center gap-2 mb-3">
        <span className="text-lg">{emoji}</span>
        <span className="text-sm font-bold tracking-wider" style={{ color: accent }}>
          {platform.toUpperCase()}
        </span>
      </div>

      {/* Header */}
      <div className="grid grid-cols-[1fr_2fr_72px_80px] gap-2 px-3 pb-1.5 text-xs font-medium text-white/30 uppercase tracking-wider">
        <span>Metric</span>
        <span></span>
        <span className="text-right">Platform</span>
        <span className="text-right">Combined</span>
      </div>

      {/* Metric rows */}
      <div className="space-y-1.5">
        {metrics.map((m) => (
          <div
            key={m.name}
            className="grid grid-cols-[1fr_2fr_72px_80px] gap-2 items-center px-3 py-2.5 rounded-lg border border-white/8 bg-white/[0.03]"
          >
            <span className="text-sm text-white/70">{m.name}</span>
            <div className="h-2 rounded-full overflow-hidden" style={{ background: barBg }}>
              <div
                className="h-full rounded-full transition-all"
                style={{ width: `${m.platformPct}%`, background: barFill }}
              />
            </div>
            <span className="text-right text-sm text-white/50">{m.platformPct}%</span>
            <span className="text-right text-sm font-bold" style={{ color: accent }}>
              {m.combinedPct}%
            </span>
          </div>
        ))}
      </div>

      {/* Summary row */}
      <div
        className="mt-2 flex items-center justify-between px-3 py-2.5 rounded-lg text-sm font-semibold"
        style={{ background: summaryBg, border: `1px solid ${summaryBorder}` }}
      >
        <span style={{ color: accent }}>
          {platform} total
        </span>
        <span style={{ color: accent }}>{totalCombined}% of final score</span>
      </div>
    </div>
  );
}

function CodeBlock({ children }: { children: React.ReactNode }) {
  return (
    <pre className="bg-white/[0.04] border border-white/10 rounded-xl p-4 text-xs text-[#00AAFF] overflow-x-auto font-mono">
      {children}
    </pre>
  );
}

export default function DocsPage() {
  const [activeSection, setActiveSection] = useState('what-is');

  const handleNavClick = (id: string) => {
    setActiveSection(id);
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' });
  };

  return (
    <div className="min-h-screen pt-24 pb-20 px-4">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-10">
          <h1 className="text-4xl font-bold text-white mb-3">Documentation</h1>
          <p className="text-white/50">
            Everything you need to know about GRAMKETING.
          </p>
        </div>

        <div className="flex gap-8">
          {/* Sidebar */}
          <aside className="hidden lg:block w-60 flex-shrink-0">
            <div className="sticky top-24 glass-card p-4 space-y-1">
              {groups.map((group) => (
                <div key={group} className="mb-4">
                  <p className="text-xs font-semibold text-white/30 uppercase tracking-wider px-3 mb-2">
                    {group}
                  </p>
                  {sections
                    .filter((s) => s.group === group)
                    .map((s) => (
                      <button
                        key={s.id}
                        onClick={() => handleNavClick(s.id)}
                        className={`w-full text-left px-3 py-1.5 rounded-lg text-sm transition-all ${
                          activeSection === s.id
                            ? 'text-[#0088CC] bg-[#0088CC]/10'
                            : 'text-white/50 hover:text-white hover:bg-white/5'
                        }`}
                      >
                        {s.label}
                      </button>
                    ))}
                </div>
              ))}
            </div>
          </aside>

          {/* Content */}
          <div className="flex-1 space-y-6">
            {/* ── OVERVIEW ── */}
            <div>
              <h2 className="text-lg font-semibold text-[#0088CC] mb-4 uppercase tracking-wider">
                Overview
              </h2>
              <div className="space-y-6">
                <Section id="what-is" title="What is GRAMKETING?">
                  <p>
                    GRAMKETING is a Web3 performance marketing platform built on
                    the TON blockchain. It connects projects that want to grow
                    their community, holders and investors with contributors,
                    promoters, and marketers who want to earn rewards for their
                    content.
                  </p>
                  <p>
                    Projects create reward pools funded with their own tokens.
                    Participants — Contributors, Promoters, and Marketers —
                    compete by posting about the project on X (Twitter) and
                    Telegram. At the end of a pool&apos;s duration, rewards are
                    distributed proportionally based on each participant&apos;s
                    accumulated points.
                  </p>
                  <p>
                    Everything runs on TON — wallets connect via TON Connect
                    2.0, payments are made in TON or $mGRAM, and reward
                    distribution is handled by a Tact smart contract.
                  </p>
                </Section>

                <Section id="how-pools" title="How Pools Work">
                  <p>A pool has a lifecycle:</p>
                  <ol className="list-decimal list-inside space-y-2 ml-2">
                    <li>Project creates a pool and pays an access fee to the platform treasury.</li>
                    <li>Project deposits reward tokens into an escrow smart contract.</li>
                    <li>Pool goes ACTIVE — contributors, promoters, and marketers can join and submit posts.</li>
                    <li>The scraper runs every 30 minutes, updating view counts and points.</li>
                    <li>When the duration expires, the pool is marked ENDED.</li>
                    <li>Platform admin triggers distribution — rewards flow to winners&apos; wallets.</li>
                  </ol>
                </Section>

                <Section id="leaderboard" title="How the Leaderboard Works">
                  <p>
                    The leaderboard ranks all participants by total points.
                    Points are updated every 30 minutes when the scraper runs.
                    Each update is saved as a snapshot in the database.
                  </p>
                  <p>
                    The leaderboard is public — anyone can view it. Click any
                    participant&apos;s row to see their full stats breakdown.
                  </p>
                  <p className="font-medium text-white/70">Detailed scoring example</p>
                  <ScoringExample />
                </Section>

                <Section id="distribution" title="Reward Distribution">
                  <p>
                    Rewards are distributed proportionally based on each
                    participant&apos;s share of total points. If the pool has 10 reward
                    slots, the top 10 point-earners share the pool.
                  </p>
                  <CodeBlock>{`Example: 3-slot pool, 1,000,000 tokens total

Alice: 5,000 pts  → 50% share → 500,000 tokens
Bob:   3,000 pts  → 30% share → 300,000 tokens
Carol: 2,000 pts  → 20% share → 200,000 tokens`}</CodeBlock>
                  <p>
                    Distribution is triggered by the platform admin after pool
                    end. The smart contract sends tokens directly from escrow to
                    each winner&apos;s wallet.
                  </p>
                </Section>
              </div>
            </div>

            {/* ── FOR MARKETERS ── */}
            <div>
              <h2 className="text-lg font-semibold text-[#0088CC] mb-4 uppercase tracking-wider">
                For Contributors, Promoters &amp; Marketers
              </h2>
              <div className="space-y-6">
                <Section id="participant-tiers" title="Participant Tiers">
                  <p>
                    Every wallet that joins GRAMKETING is assigned a tier based on their total
                    points earned across all pools. Tiers are calculated dynamically and update
                    in real time as you earn points.
                  </p>
                  <div className="mt-4 overflow-x-auto">
                    <table className="w-full text-sm border-collapse">
                      <thead>
                        <tr className="border-b border-white/10">
                          <th className="py-2 px-3 text-left text-white/50 font-medium">Tier</th>
                          <th className="py-2 px-3 text-left text-white/50 font-medium">Points Required</th>
                          <th className="py-2 px-3 text-left text-white/50 font-medium">Badge</th>
                          <th className="py-2 px-3 text-left text-white/50 font-medium">Description</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-white/5">
                        <tr>
                          <td className="py-3 px-3 font-semibold text-white/60">Contributor</td>
                          <td className="py-3 px-3 text-white/50">0 pts (default)</td>
                          <td className="py-3 px-3"><span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full border text-white/50 bg-white/5 border-white/10">Contributor</span></td>
                          <td className="py-3 px-3 text-white/50">Default tier for anyone who joins the platform. Start here and earn your way up.</td>
                        </tr>
                        <tr>
                          <td className="py-3 px-3 font-semibold text-[#0088CC]">Promoter</td>
                          <td className="py-3 px-3 text-white/50">500+ pts</td>
                          <td className="py-3 px-3"><span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full border text-[#0088CC] bg-[#0088CC]/10 border-[#0088CC]/30">Promoter</span></td>
                          <td className="py-3 px-3 text-white/50">Earned by reaching 500 total points. Shows you&apos;re actively driving real engagement.</td>
                        </tr>
                        <tr>
                          <td className="py-3 px-3 font-semibold text-yellow-400">Marketer</td>
                          <td className="py-3 px-3 text-white/50">5,000+ pts</td>
                          <td className="py-3 px-3"><span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full border text-yellow-400 bg-yellow-400/10 border-yellow-400/30">Marketer</span></td>
                          <td className="py-3 px-3 text-white/50">Top-tier status for proven performers. Displayed in gold on leaderboards and public profiles.</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                  <p className="mt-4">
                    Tier badges are shown on the leaderboard, your public stats page, and your dashboard.
                    They reflect your <strong>total lifetime points</strong> across all pools — not just one pool.
                  </p>
                </Section>

                <Section id="connect-x" title="How to Connect Your X Account">
                  <p>
                    Go to Dashboard → Account Settings → enter your X username
                    (without the @). This links your X handle to your wallet
                    address so submissions can be attributed to you.
                  </p>
                  <p>
                    Full Twitter OAuth is coming in a future update for automatic
                    post detection.
                  </p>
                </Section>

                <Section id="connect-tg" title="How to Connect Your Telegram Account">
                  <p>
                    Go to Dashboard → Account Settings → enter your Telegram
                    username. This enables Telegram post submission and future
                    bot notifications.
                  </p>
                </Section>

                <Section id="submit-posts" title="Submitting Posts">
                  <p>
                    Open a pool page → Submit tab → paste your X or Telegram
                    post URL. Supported formats:
                  </p>
                  <CodeBlock>{`X:        https://x.com/username/status/1234567890
Telegram: https://t.me/yourchannel/456`}</CodeBlock>
                  <p>
                    After submission, the post is queued for the next scrape
                    cycle. Views are updated within 30 minutes.
                  </p>
                  <div className="mt-4 p-4 rounded-xl bg-[#0088CC]/5 border border-[#0088CC]/20">
                    <p className="text-sm font-semibold text-[#0088CC] mb-1">
                      Telegram: Channel Posts Only
                    </p>
                    <p className="text-sm text-white/60">
                      Only posts from <strong className="text-white">public Telegram channels</strong> are
                      supported — not group messages, private chats, or DMs.
                      Channel posts have a public URL in the format{' '}
                      <code className="text-[#0088CC] bg-[#0088CC]/10 px-1 rounded">
                        t.me/yourchannel/123
                      </code>{' '}
                      and are the only post type where view counts are publicly
                      accessible. Group messages and DMs do not expose view
                      data, so they cannot be tracked or verified.
                    </p>
                  </div>
                </Section>

                <Section id="daily-limit" title="Daily Submission Limits">
                  <p>
                    You can submit a maximum of{' '}
                    <strong className="text-white">2 posts per day</strong>{' '}
                    per pool. This applies across both platforms — 2 X posts, 2
                    Telegram posts, or one of each.
                  </p>
                  <p>
                    The daily limit resets at midnight UTC. Submitted posts are
                    scraped continuously until the pool ends.
                  </p>
                </Section>

                <Section id="points-calc" title="How Points Are Calculated">
                  <p>Each platform scores your posts differently, then boosts are applied pool-wide:</p>
                  <CodeBlock>{`── Per-post scoring ──────────────────────────────
X post score     = (views × 0.8 + likes × 0.1 + reposts × 0.1) / 10
                   (minimum 100 views to qualify)

Telegram score   = (views × 0.8 + reactions × 0.2) × 2

── Campaign weighting ────────────────────────────
X-only pool      : contentScore = xPoints
Telegram-only    : contentScore = telegramPoints
Both (50 / 50)   : contentScore = xPoints × 0.5 + telegramPoints × 0.5

── Boosts (recalculated each scrape cycle) ───────
holderBoost      = 1.0 + (yourBalance / topBalanceInPool)   → 1.0x – 2.0x
referralBoost    = 1.0 + (yourReferredTotal / topInPool)    → 1.0x – 2.0x

── Final score ───────────────────────────────────
totalPoints = (contentScore × holderBoost × referralBoost)
              + referralBonusPoints`}</CodeBlock>
                  <p>
                    Example: X-only pool, 10,000 views, 200 likes, 50 reposts →
                    raw score = (8,000 + 20 + 5) / 10 = 802.5 pts. With holderBoost 1.4x and referralBoost 1.2x → 802.5 × 1.4 × 1.2 ≈ 1,348 pts.
                  </p>
                </Section>

                <Section id="scoring-system" title="Scoring System">
                  <p className="mb-5">
                    Points are weighted differently per platform. When both platforms are active in a pool,
                    each contributes 50% to your final score. The table below shows how each metric
                    is weighted within its platform, and the equivalent combined weight.
                  </p>

                  <ScoringTable
                    platform="X / Twitter"
                    emoji="🐦"
                    color="blue"
                    metrics={[
                      { name: 'Views', platformPct: 80, combinedPct: 40 },
                      { name: 'Likes', platformPct: 10, combinedPct: 5 },
                      { name: 'Reposts', platformPct: 10, combinedPct: 5 },
                    ]}
                    totalCombined={50}
                  />

                  <ScoringTable
                    platform="Telegram"
                    emoji="✈️"
                    color="green"
                    metrics={[
                      { name: 'Views', platformPct: 80, combinedPct: 40 },
                      { name: 'Reactions', platformPct: 20, combinedPct: 10 },
                    ]}
                    totalCombined={50}
                  />

                  <div className="mt-2 px-4 py-3 rounded-xl bg-white/[0.03] border border-white/8 text-xs text-white/40 leading-relaxed">
                    Single platform campaigns use only that platform&apos;s weights at 100%.
                    Combined weights apply only when both are selected.
                  </div>
                </Section>

                <Section id="holder-boost" title="Holder Boost (Proportional, 1.0x – 2.0x)">
                  <p>
                    Every scrape cycle, the platform checks each participant&apos;s balance of the pool&apos;s project token via the TON RPC.
                    Your holder boost is calculated <strong className="text-white">relative to the highest holder in the pool</strong> — not against a fixed threshold.
                  </p>
                  <CodeBlock>{`holderBoost = 1.0 + (yourBalance / topBalanceInPool)

Examples (pool top holder = 100,000 tokens):
  You hold 100,000  →  1.0 + 1.0  =  2.0x  (maximum)
  You hold  50,000  →  1.0 + 0.5  =  1.5x
  You hold  10,000  →  1.0 + 0.1  =  1.1x
  You hold       0  →  1.0 + 0.0  =  1.0x  (no boost)`}</CodeBlock>
                  <p>
                    The boost range is always <strong className="text-yellow-400">1.0x (no tokens) to 2.0x (top holder)</strong>.
                    As other participants buy or sell tokens, everyone&apos;s boost adjusts proportionally each cycle.
                  </p>
                  <div className="mt-3 p-3 rounded-xl bg-yellow-500/5 border border-yellow-500/20 text-xs text-white/50">
                    <strong className="text-yellow-400">Tip:</strong> The boost is relative, not absolute. Holding more than others matters as much as the raw amount.
                  </div>
                </Section>

                <Section id="referral" title="Referral System">
                  <p>
                    Every pool participant gets a unique referral link. Share it to bring new participants to the pool.
                  </p>
                  <p>When a referred friend connects their wallet and holds the pool&apos;s project token:</p>
                  <ul className="list-disc list-inside ml-2 space-y-1">
                    <li>You earn <strong className="text-[#0088CC]">+500 bonus points</strong> (one-time, flat, per qualifying referral)</li>
                    <li>Their token holdings contribute to your ongoing <strong className="text-purple-400">referral boost</strong></li>
                  </ul>

                  <p className="mt-2 font-medium text-white/70">Referral Boost (Proportional, 1.0x – 2.0x)</p>
                  <p>
                    Just like the holder boost, your referral boost is calculated <strong className="text-white">pool-wide</strong> — relative to the participant with the highest total referred holdings.
                  </p>
                  <CodeBlock>{`referredTotal    = sum of token balances of all YOUR token-holding referrals
referralBoost    = 1.0 + (referredTotal / topReferredTotalInPool)

Examples (pool top referrer's total = 200,000 tokens):
  You referred users holding 200,000 total  →  2.0x  (maximum)
  You referred users holding 100,000 total  →  1.5x
  You referred users holding  20,000 total  →  1.1x
  No token-holding referrals               →  1.0x  (no boost)`}</CodeBlock>
                  <p>
                    The referral boost range is always <strong className="text-purple-400">1.0x to 2.0x</strong> and is recalculated on each scrape cycle as referred users buy or sell tokens.
                    Only referrals who currently hold &gt; 0 project tokens contribute to your boost.
                  </p>
                  <div className="mt-3 p-3 rounded-xl bg-purple-500/5 border border-purple-500/20 text-xs text-white/50">
                    <strong className="text-purple-400">Note:</strong> The +500 bonus points are only awarded once per referral, and only if the referred user holds the pool&apos;s project token at the time they connect their wallet.
                  </div>
                </Section>

                <Section id="points-decrease" title="How Points Can Decrease">
                  <p>
                    Points are recalculated on every scrape cycle. Your total can decrease if:
                  </p>
                  <ul className="list-disc list-inside ml-2 space-y-1">
                    <li>
                      You sell project tokens — your <strong className="text-yellow-400">holder boost</strong> drops proportionally (or to 1.0x if you sell everything)
                    </li>
                    <li>
                      Another participant buys more tokens and becomes the new top holder — everyone else&apos;s holder boost decreases relative to the new top
                    </li>
                    <li>
                      A referred friend sells tokens — their balance no longer contributes to your <strong className="text-purple-400">referral boost</strong>, which recalculates downward
                    </li>
                    <li>
                      A competing referrer gains more referred holdings than you — your referral boost decreases relative to the new pool maximum
                    </li>
                  </ul>
                  <p>
                    Base post scores (views, likes, reposts, reactions) are cumulative and can only increase as posts accumulate more engagement.
                    Only the boost multipliers fluctuate between cycles.
                  </p>
                </Section>
              </div>
            </div>

            {/* ── FOR PROJECTS ── */}
            <div>
              <h2 className="text-lg font-semibold text-[#0088CC] mb-4 uppercase tracking-wider">
                For Projects
              </h2>
              <div className="space-y-6">
                <Section id="create-pool" title="How to Create a Pool">
                  <ol className="list-decimal list-inside space-y-2 ml-2">
                    <li>Connect your TON wallet</li>
                    <li>Go to <Link href="/create-pool" className="text-[#0088CC] underline">Create a Pool</Link></li>
                    <li>Enter your project details (name, token symbol, jetton master address, X profile link, and Telegram channel link)</li>
                    <li>
                      Choose your <strong className="text-white">Campaign Type</strong>:
                      <ul className="list-disc list-inside ml-4 mt-1 space-y-1 text-white/50">
                        <li><strong className="text-white/70">X + Telegram</strong> — both platforms count, 50/50 split</li>
                        <li><strong className="text-white/70">X Only</strong> — only X posts are scored</li>
                        <li><strong className="text-white/70">Telegram Only</strong> — only Telegram posts are scored</li>
                      </ul>
                    </li>
                    <li>Optionally link a specific post to promote (e.g. an announcement tweet or Telegram channel post)</li>
                    <li>Configure pool: duration, total reward, reward slots</li>
                    <li>Pay the access fee (TON or $mGRAM) to the platform treasury</li>
                    <li>Deposit your reward tokens to the escrow contract</li>
                    <li>Your pool goes live immediately</li>
                  </ol>
                </Section>

                <Section id="pricing" title="Pricing Table">
                  <p>Access fees are dollar-pegged and paid at live market prices:</p>
                  <div className="overflow-x-auto mt-3">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-white/10">
                          <th className="py-2 text-left text-white/60 font-medium">Duration</th>
                          <th className="py-2 text-right text-white/60 font-medium">Pay with $mGRAM</th>
                          <th className="py-2 text-right text-white/60 font-medium">Pay with TON</th>
                        </tr>
                      </thead>
                      <tbody>
                        {[
                          { dur: '1 Week', mgram: '$100', ton: '$125' },
                          { dur: '2 Weeks', mgram: '$199', ton: '$249' },
                          { dur: '3 Weeks', mgram: '$299', ton: '$374' },
                          { dur: '4 Weeks', mgram: '$399', ton: '$499' },
                        ].map((row) => (
                          <tr key={row.dur} className="border-b border-white/5">
                            <td className="py-2.5 text-white/70">{row.dur}</td>
                            <td className="py-2.5 text-right text-white/70">{row.mgram}</td>
                            <td className="py-2.5 text-right text-white/70">{row.ton}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <p className="mt-3 text-xs text-white/30">
                    Prices are USD-pegged. The exact token amount is calculated
                    at time of payment using CoinGecko live prices.
                  </p>
                </Section>

                <Section id="escrow" title="How Escrow Works">
                  <p>
                    When you create a pool, a GramketingPool smart contract is
                    deployed on TON. You then transfer your reward tokens to this
                    contract.
                  </p>
                  <p>The contract:</p>
                  <ul className="list-disc list-inside ml-2 space-y-1">
                    <li>Holds tokens securely until pool ends</li>
                    <li>Can only distribute to winners via platform admin instruction</li>
                    <li>Supports pro-rata cancellation if a pool is ended early</li>
                    <li>Is publicly verifiable on TON Scan</li>
                  </ul>

                  <div className="mt-6 p-5 rounded-xl bg-white/[0.03] border border-white/10">
                    <h4 className="font-semibold text-white mb-3">Pool Cancellation Policy</h4>
                    <p className="text-sm text-white/60 mb-4">
                      If a pool is cancelled before it ends, rewards are split using a daily rate formula
                      so participants are fairly compensated for the time elapsed.
                    </p>
                    <div className="space-y-2 text-sm">
                      <div className="flex gap-2">
                        <span className="text-[#0088CC] flex-shrink-0">→</span>
                        <span className="text-white/60"><strong className="text-white">Daily rate</strong> = Total reward tokens ÷ pool duration in days</span>
                      </div>
                      <div className="flex gap-2">
                        <span className="text-[#0088CC] flex-shrink-0">→</span>
                        <span className="text-white/60"><strong className="text-white">Participants share</strong> = daily rate × days elapsed (distributed proportionally by points among top N winners at time of cancellation)</span>
                      </div>
                      <div className="flex gap-2">
                        <span className="text-[#0088CC] flex-shrink-0">→</span>
                        <span className="text-white/60"><strong className="text-white">Project refund</strong> = daily rate × days remaining (returned to project owner wallet)</span>
                      </div>
                      <div className="flex gap-2">
                        <span className="text-red-400 flex-shrink-0">→</span>
                        <span className="text-white/60"><strong className="text-white">Access fee</strong> paid to the platform treasury is fully <strong className="text-red-400">non-refundable</strong></span>
                      </div>
                    </div>
                    <div className="mt-4 p-3 rounded-lg bg-[#0088CC]/5 border border-[#0088CC]/15 text-xs text-white/50">
                      <strong className="text-white/70">Example:</strong> A 7-day pool cancelled on day 4 → participants share 4/7 of rewards, project gets back 3/7, platform keeps the full access fee.
                    </div>
                  </div>
                </Section>

                <Section id="reward-slots" title="Setting Reward Slots">
                  <p>
                    Reward slots define how many participants receive rewards.
                    Minimum is 3. All slots share the prize pool proportionally
                    by points.
                  </p>
                  <p>
                    Recommendation: set more slots (10–20) to attract more
                    participants. Even rank #15 earns something, which incentivizes
                    broader participation.
                  </p>
                </Section>

                <Section id="pool-end" title="What Happens When a Pool Ends">
                  <ol className="list-decimal list-inside space-y-2 ml-2">
                    <li>Pool status automatically changes to ENDED when duration expires</li>
                    <li>A final leaderboard snapshot is saved — results are frozen</li>
                    <li>Platform admin and the project owner both review the final leaderboard before distribution is triggered</li>
                    <li>Project owner receives a notification on their dashboard when their pool ends and can view the final frozen leaderboard</li>
                    <li>Smart contract distributes tokens proportionally to top N wallets</li>
                    <li>Remaining dust (rounding) is returned to the project owner wallet</li>
                  </ol>
                  <p>Typical distribution time: within 24–48 hours of pool ending.</p>
                </Section>
              </div>
            </div>

            {/* Social links */}
            <div className="glass-card p-6 flex flex-col sm:flex-row items-center justify-between gap-4">
              <p className="text-white/60 text-sm">
                Have questions? Join our community.
              </p>
              <div className="flex items-center gap-4">
                <a href="https://t.me/Gramketing" target="_blank" rel="noopener noreferrer"
                  className="flex items-center gap-2 btn-secondary text-sm">
                  <TelegramIcon className="w-4 h-4" />
                  Telegram
                </a>
                <a href="https://x.com/Gramketing" target="_blank" rel="noopener noreferrer"
                  className="flex items-center gap-2 btn-secondary text-sm">
                  <XIcon className="w-3.5 h-3.5" />
                  X
                </a>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
