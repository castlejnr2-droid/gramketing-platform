'use client';
import Link from 'next/link';

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

const phases = [
  {
    number: 'Phase 1',
    title: 'Web Platform Launch',
    period: 'Q2 2026 (Now)',
    status: 'completed' as const,
    items: [
      { done: true, text: 'Pool creation with escrow smart contract' },
      { done: true, text: 'X and Telegram post submission & verification' },
      { done: true, text: 'Live leaderboard (30 min updates)' },
      { done: true, text: 'Referral system with holder boost tiers' },
      { done: true, text: 'Proportional reward distribution' },
      { done: true, text: 'Project and marketer dashboards' },
      { done: true, text: 'TON wallet auth (TON Connect 2.0)' },
      { done: true, text: 'Dollar-pegged access fees via CoinGecko' },
      { done: true, text: '$mGRAM token launch on TON' },
      { done: true, text: 'Telegram Bot: outranked alerts' },
      { done: true, text: 'Telegram Bot: pool ending soon notifications' },
      { done: true, text: 'Telegram Bot: rewards distributed notifications' },
      { done: true, text: 'Telegram Bot: new pools announcements' },
    ],
  },
  {
    number: 'Phase 2',
    title: 'Telegram Bot, Mini App & Staking',
    period: 'Q3 2026',
    status: 'upcoming' as const,
    items: [
      { done: false, text: 'Telegram Mini App: join pools in-app' },
      { done: false, text: '$mGRAM staking and governance' },
    ],
  },
  {
    number: 'Phase 3',
    title: 'Mobile App',
    period: 'Q4 2026',
    status: 'future' as const,
    items: [
      { done: false, text: 'Mobile App: iOS' },
      { done: false, text: 'Mobile App: Android' },
    ],
  },
  {
    number: 'Phase 4',
    title: 'Social Expansion',
    period: 'Q4 2026',
    status: 'future' as const,
    items: [
      { done: false, text: 'TikTok post submissions and view tracking' },
      { done: false, text: 'Instagram post submissions and view tracking' },
      { done: false, text: 'WhatsApp Channel post submissions and view tracking' },
      { done: false, text: 'Expanded scoring engine supporting all major social platforms' },
      { done: false, text: 'Contributors earn rewards across 5 platforms simultaneously' },
    ],
  },
  {
    number: 'Phase 5',
    title: 'Real World Products and Projects',
    period: 'Q1 2027',
    status: 'future' as const,
    items: [
      { done: false, text: 'Pools open to real world brands, e-commerce stores, startups and content creators' },
      { done: false, text: 'Pool rewards payable in any token, stablecoin or dollar pegged currency of the project\'s choice' },
      { done: false, text: 'Gramketing becomes a universal performance marketing platform beyond Web3' },
    ],
  },
  {
    number: 'Phase 6',
    title: 'IRL Presence',
    period: 'Q2 2027',
    status: 'future' as const,
    items: [
      { done: false, text: 'First Gramketing physical headquarters launched, city TBA' },
      { done: false, text: 'Official company registration and legal structure established' },
      { done: false, text: 'In person community events, meetups and partner onboarding' },
    ],
  },
  {
    number: 'Phase 7',
    title: 'Global Expansion',
    period: 'Q3 2027 onwards',
    status: 'future' as const,
    items: [
      { done: false, text: 'Regional offices opened in top cities based on platform usage data' },
      { done: false, text: 'Local teams serving high volume markets' },
      { done: false, text: 'Gramketing establishes a global footprint in performance marketing' },
    ],
  },
];

const statusConfig = {
  completed: {
    badge: 'bg-green-500/20 text-green-400 border-green-500/30',
    border: 'border-[#0088CC]/40',
    dot: 'bg-green-400',
  },
  upcoming: {
    badge: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
    border: 'border-white/15',
    dot: 'bg-[#0088CC] animate-pulse',
  },
  future: {
    badge: 'bg-white/10 text-white/40 border-white/10',
    border: 'border-white/10',
    dot: 'bg-white/20',
  },
};

export default function MiniAppRoadmapPage() {
  return (
    <div className="pt-5 pb-6 px-4">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white mb-1">Roadmap</h1>
        <p className="text-white/50 text-sm">
          GRAMKETING is built in public. Here&apos;s what we&apos;ve shipped and what&apos;s coming.
        </p>
      </div>

      <div className="space-y-4">
        {phases.map((phase) => {
          const config = statusConfig[phase.status];
          return (
            <div
              key={phase.number}
              className={`glass-card p-5 border ${config.border}${phase.status === 'future' ? ' opacity-60' : ''}`}
            >
              <div className="flex items-start justify-between gap-3 mb-4">
                <div>
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <div className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${config.dot}`} />
                    <span className={`text-xs font-bold px-2.5 py-0.5 rounded-full border ${config.badge}`}>
                      {phase.period}
                    </span>
                    <span className="text-[10px] text-white/30 font-semibold uppercase tracking-wider">
                      {phase.number}
                    </span>
                  </div>
                  <h2 className="text-base font-bold text-white mt-1">{phase.title}</h2>
                </div>
                {phase.status === 'completed' && (
                  <span className="text-xl flex-shrink-0" title="Completed">🎉</span>
                )}
              </div>

              <ul className="space-y-2">
                {phase.items.map((item) => (
                  <li key={item.text} className="flex items-start gap-2.5 text-sm">
                    <span className="mt-0.5 flex-shrink-0 text-xs">
                      {item.done
                        ? '✅'
                        : phase.number === 'Phase 2'
                        ? '🔜'
                        : <span className="text-white/25 text-sm leading-none">○</span>}
                    </span>
                    <span className={item.done ? 'text-white/70' : 'text-white/40'}>
                      {item.text}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>

      {/* Community CTA */}
      <div className="mt-6 glass-card p-5 text-center">
        <h2 className="text-base font-bold text-white mb-2">Follow Our Journey</h2>
        <p className="text-white/50 text-xs mb-4">
          Stay updated on releases, new pools, and platform news.
        </p>
        <div className="flex items-center justify-center gap-3 flex-wrap">
          <a
            href="https://t.me/Gramketing"
            target="_blank"
            rel="noopener noreferrer"
            className="btn-secondary text-sm flex items-center gap-2"
          >
            <TelegramIcon className="w-4 h-4" />
            Telegram
          </a>
          <a
            href="https://x.com/Gramketing"
            target="_blank"
            rel="noopener noreferrer"
            className="btn-secondary text-sm flex items-center gap-2"
          >
            <XIcon className="w-3.5 h-3.5" />
            X
          </a>
          <Link href="/miniapp" className="btn-primary text-sm">
            Browse Pools
          </Link>
        </div>
      </div>
    </div>
  );
}
