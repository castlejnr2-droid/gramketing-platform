'use client';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { PoolCard } from '@/components/PoolCard';
import { ArrowRight, Zap, Users, Trophy, TrendingUp } from 'lucide-react';

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

const STEPS = [
  {
    num: '01',
    title: 'Projects Create Pools',
    description:
      'A TON project deposits their token into an escrow smart contract and sets a reward pool with a duration of 1–4 weeks.',
    icon: <Trophy className="w-6 h-6 text-[#0088CC]" />,
  },
  {
    num: '02',
    title: 'Contributors Promote',
    description:
      'Connect your wallet, join a pool, and submit your X posts and Telegram channel posts promoting the project.',
    icon: <TrendingUp className="w-6 h-6 text-[#0088CC]" />,
  },
  {
    num: '03',
    title: 'Earn Based on Performance',
    description:
      "Your view counts are scraped every 30 minutes. The more eyeballs your content gets, the higher your rank and reward share.",
    icon: <Zap className="w-6 h-6 text-[#0088CC]" />,
  },
];

export default function HomePage() {
  const [pools, setPools] = useState<Pool[]>([]);
  const [loadingPools, setLoadingPools] = useState(true);
  const heroRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    fetch('/api/pools?status=ACTIVE&limit=3')
      .then((r) => r.json())
      .then((d) => setPools(d.pools ?? []))
      .catch(() => {})
      .finally(() => setLoadingPools(false));
  }, []);

  return (
    <div className="min-h-screen" style={{ position: 'relative', zIndex: 1 }}>
      {/* ── Hero ── */}
      <section
        ref={heroRef}
        className="relative overflow-hidden"
        style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', zIndex: 1 }}
      >
        {/* Vignette - reduced to 50% so orbs show through while text stays readable */}
        <div
          aria-hidden="true"
          style={{
            position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 1,
            background: 'radial-gradient(ellipse 65% 55% at 50% 48%, transparent 0%, rgba(8,12,22,0.50) 100%)',
          }}
        />

        <div className="relative w-full px-4 py-32 text-center" style={{ zIndex: 2 }}>
          <div className="max-w-[800px] mx-auto flex flex-col items-center gap-8">

            {/* Badge */}
            <div
              className="hero-fadein inline-flex items-center gap-2 px-5 py-2 rounded-full text-xs font-semibold tracking-wide text-white/80"
              style={{
                animationDelay: '0s',
                background: 'rgba(255,255,255,0.06)',
                border: '1px solid rgba(255,255,255,0.15)',
                backdropFilter: 'blur(12px)',
                WebkitBackdropFilter: 'blur(12px)',
              }}
            >
              <span className="w-1.5 h-1.5 rounded-full bg-[#00d4ff] animate-pulse" />
              Built on TON Blockchain
            </div>

            {/* Headline */}
            <h1
              className="hero-fadein text-white"
              style={{
                animationDelay: '0.1s',
                fontSize: 'clamp(1.8rem, 4vw, 3rem)',
                fontWeight: 800,
                lineHeight: 1.08,
                letterSpacing: '-0.03em',
              }}
            >
              Contribute, Promote and Market TON Projects
              <br />
              <span style={{ color: '#00d4ff' }}>on X &amp; Telegram</span>
              <br />
              and Earn Real Rewards.
            </h1>

            {/* Subheadline */}
            <p
              className="hero-fadein leading-relaxed"
              style={{
                animationDelay: '0.2s',
                color: '#94a3b8',
                fontSize: '1.125rem',
                maxWidth: '540px',
              }}
            >
              GRAMKETING is a performance-based Web3 marketing platform on TON.
              Promote TON projects, get rewarded for real views, not promises.
            </p>

            {/* Buttons */}
            <div
              className="hero-fadein flex flex-col sm:flex-row items-center justify-center gap-4 w-full"
              style={{ animationDelay: '0.3s' }}
            >
              <Link
                href="/pools"
                className="inline-flex items-center gap-2 font-semibold text-base"
                style={{
                  background: '#00d4ff',
                  color: '#060c16',
                  borderRadius: '9999px',
                  padding: '0.9rem 2rem',
                  boxShadow: '0 0 28px rgba(0,212,255,0.35)',
                  transition: 'transform 0.2s ease, box-shadow 0.2s ease',
                }}
                onMouseEnter={e => {
                  const el = e.currentTarget as HTMLAnchorElement;
                  el.style.transform  = 'scale(1.03)';
                  el.style.boxShadow  = '0 0 44px rgba(0,212,255,0.55)';
                }}
                onMouseLeave={e => {
                  const el = e.currentTarget as HTMLAnchorElement;
                  el.style.transform  = '';
                  el.style.boxShadow  = '0 0 28px rgba(0,212,255,0.35)';
                }}
              >
                Browse Pools <ArrowRight className="w-4 h-4" />
              </Link>

              <Link
                href="/create-pool"
                className="inline-flex items-center font-semibold text-base text-white"
                style={{
                  background: 'rgba(255,255,255,0.06)',
                  border: '1px solid rgba(255,255,255,0.25)',
                  borderRadius: '9999px',
                  padding: '0.9rem 2rem',
                  backdropFilter: 'blur(12px)',
                  WebkitBackdropFilter: 'blur(12px)',
                  transition: 'transform 0.2s ease, background 0.2s ease',
                }}
                onMouseEnter={e => {
                  const el = e.currentTarget as HTMLAnchorElement;
                  el.style.transform  = 'scale(1.03)';
                  el.style.background = 'rgba(255,255,255,0.12)';
                }}
                onMouseLeave={e => {
                  const el = e.currentTarget as HTMLAnchorElement;
                  el.style.transform  = '';
                  el.style.background = 'rgba(255,255,255,0.06)';
                }}
              >
                Create a Pool
              </Link>
            </div>

            {/* Stats */}
            <div
              className="hero-fadein mt-4 grid grid-cols-3 gap-4 w-full max-w-md"
              style={{ animationDelay: '0.4s' }}
            >
              {[
                { label: 'Active Pools',        value: '12+' },
                { label: 'Rewards Distributed', value: '$50K+' },
                { label: 'Contributors',         value: '1,200+' },
              ].map((stat) => (
                <div key={stat.label} className="glass-card p-4 text-center">
                  <p className="text-xl font-bold" style={{ color: '#00d4ff' }}>{stat.value}</p>
                  <p className="text-xs text-white/40 mt-1">{stat.label}</p>
                </div>
              ))}
            </div>

          </div>
        </div>
      </section>

      {/* ── How it works ── */}
      <section className="py-20 px-4" style={{ position: 'relative', zIndex: 1 }}>
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-14">
            <h2 className="text-3xl sm:text-4xl font-bold text-white mb-4">
              How It Works
            </h2>
            <p className="text-white/50 max-w-xl mx-auto">
              Three simple steps to start earning or growing your project.
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {STEPS.map((step) => (
              <div key={step.num} className="glass-card p-7 hover:border-[#0088CC]/30 transition-all duration-300">
                <div className="flex items-center gap-3 mb-4">
                  <span className="text-4xl font-bold text-[#0088CC]/20">
                    {step.num}
                  </span>
                  <div className="p-2.5 rounded-xl bg-[#0088CC]/10 border border-[#0088CC]/20">
                    {step.icon}
                  </div>
                </div>
                <h3 className="text-lg font-semibold text-white mb-3">
                  {step.title}
                </h3>
                <p className="text-sm text-white/50 leading-relaxed">
                  {step.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Live Pools preview ── */}
      <section className="py-20 px-4" style={{ position: 'relative', zIndex: 1 }}>
        <div className="max-w-6xl mx-auto">
          <div className="flex items-center justify-between mb-10">
            <div>
              <h2 className="text-3xl font-bold text-white">Live Pools</h2>
              <p className="text-white/40 text-sm mt-1">
                Join now and start earning
              </p>
            </div>
            <Link href="/pools" className="btn-secondary text-sm flex items-center gap-2">
              View All
              <ArrowRight className="w-4 h-4" />
            </Link>
          </div>

          {loadingPools ? (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {[1, 2, 3].map((i) => (
                <div
                  key={i}
                  className="glass-card p-6 animate-pulse h-56"
                />
              ))}
            </div>
          ) : pools.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {pools.map((pool) => (
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
          ) : (
            <div className="glass-card p-12 text-center text-white/40">
              <Trophy className="w-10 h-10 mx-auto mb-3 opacity-30" />
              <p>No active pools right now. Check back soon!</p>
            </div>
          )}
        </div>
      </section>

      {/* ── Referral highlight ── */}
      <section className="py-20 px-4" style={{ position: 'relative', zIndex: 1 }}>
        <div className="max-w-6xl mx-auto">
          <div className="glass-card p-10 relative overflow-hidden">
            <div className="absolute top-0 right-0 w-72 h-72 rounded-full pointer-events-none"
              style={{ background: 'radial-gradient(circle, rgba(0,136,204,0.08), transparent 70%)' }}
            />
            <div className="relative grid grid-cols-1 md:grid-cols-2 gap-10 items-center">
              <div>
                <h2 className="text-3xl font-bold text-white mb-4">
                  Boost Your Earnings with Referrals
                </h2>
                <p className="text-white/50 leading-relaxed mb-6">
                  Refer other contributors and earn bonus points. The more tokens
                  they hold, the bigger your multiplier boost, stacking
                  additively for every referral. Token thresholds are set by
                  each pool creator and vary per pool.
                </p>
                <ul className="space-y-3 text-sm text-white/60">
                  <li className="flex items-start gap-2">
                    <span className="text-[#0088CC] mt-0.5">✓</span>
                    +500 bonus points for each referred friend who holds the pool token
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-[#0088CC] mt-0.5">✓</span>
                    Tier 1/2/3 multipliers: 1.2x / 1.5x / 2.0x based on their holdings
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-[#0088CC] mt-0.5">✓</span>
                    Multiple referrals stack, the more you refer, the higher your multiplier
                  </li>
                </ul>
                <p className="mt-4 text-xs text-white/30 leading-relaxed">
                  Tier thresholds are set by each pool creator, amounts vary per pool and token supply.
                </p>
              </div>
              <div className="space-y-3">
                {[
                  { tier: 'Tier 1', mult: '1.2x', color: 'text-blue-300 bg-blue-500/10 border-blue-500/20' },
                  { tier: 'Tier 2', mult: '1.5x', color: 'text-purple-300 bg-purple-500/10 border-purple-500/20' },
                  { tier: 'Tier 3', mult: '2.0x', color: 'text-yellow-300 bg-yellow-500/10 border-yellow-500/20' },
                ].map((t) => (
                  <div key={t.tier} className={`flex items-center justify-between px-5 py-3 rounded-xl border ${t.color}`}>
                    <div>
                      <span className="font-semibold">{t.tier}</span>
                      <span className="text-xs opacity-50 ml-2">threshold set by pool creator</span>
                    </div>
                    <span className="text-xl font-bold">{t.mult}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Roadmap teaser ── */}
      <section className="py-20 px-4" style={{ position: 'relative', zIndex: 1 }}>
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold text-white mb-3">Roadmap</h2>
            <p className="text-white/40">What&apos;s built and what&apos;s coming</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
            <div className="glass-card p-6 border-[#0088CC]/30">
              <div className="flex items-center gap-2 mb-4">
                <span className="text-xs font-bold px-3 py-1 rounded-full bg-green-500/20 text-green-400 border border-green-500/30">
                  Phase 1: Now
                </span>
              </div>
              <ul className="space-y-2 text-sm text-white/60">
                {['Pool creation & escrow', 'X & Telegram verification', 'Live leaderboard', 'Referral system', 'Reward distribution', '$mGRAM token launch'].map((item) => (
                  <li key={item} className="flex items-center gap-2">
                    <span className="text-green-400">✅</span> {item}
                  </li>
                ))}
              </ul>
            </div>
            <div className="glass-card p-6">
              <div className="flex items-center gap-2 mb-4">
                <span className="text-xs font-bold px-3 py-1 rounded-full bg-blue-500/20 text-blue-400 border border-blue-500/30">
                  Phase 2: Q3
                </span>
              </div>
              <ul className="space-y-2 text-sm text-white/60">
                {['Telegram Bot alerts', 'Telegram Mini App', 'Advanced analytics'].map((item) => (
                  <li key={item} className="flex items-center gap-2">
                    <span className="text-[#0088CC]">🔜</span> {item}
                  </li>
                ))}
              </ul>
            </div>
            <div className="glass-card p-6">
              <div className="flex items-center gap-2 mb-4">
                <span className="text-xs font-bold px-3 py-1 rounded-full bg-white/10 text-white/40 border border-white/10">
                  Phase 3: Q4 2026
                </span>
              </div>
              <ul className="space-y-2 text-sm text-white/60">
                {['Mobile App (iOS + Android)'].map((item) => (
                  <li key={item} className="flex items-center gap-2">
                    <span className="text-white/30">🔜</span> {item}
                  </li>
                ))}
              </ul>
            </div>
            <div className="glass-card p-6 opacity-60">
              <div className="flex items-center gap-2 mb-4">
                <span className="text-xs font-bold px-3 py-1 rounded-full bg-white/5 text-white/25 border border-white/10">
                  Phase 4: 2027
                </span>
              </div>
              <p className="text-sm font-semibold text-white/40 mb-2">Coming Soon</p>
              <p className="text-sm text-white/30 leading-relaxed">
                More features on the way, stay tuned.
              </p>
            </div>
          </div>
          <div className="text-center mt-8">
            <Link href="/roadmap" className="btn-secondary text-sm">
              View Full Roadmap
            </Link>
          </div>
        </div>
      </section>

      {/* ── CTA ── */}
      <section className="py-24 px-4" style={{ position: 'relative', zIndex: 1 }}>
        <div className="max-w-3xl mx-auto text-center">
          <div className="glass-card p-12 relative overflow-hidden">
            <div className="absolute inset-0 radial-glow pointer-events-none" />
            <h2 className="relative text-4xl font-bold text-white mb-4">
              Ready to Earn?
            </h2>
            <p className="relative text-white/50 mb-8 max-w-md mx-auto">
              Browse live pools, connect your TON wallet, and start earning
              rewards for your marketing efforts today.
            </p>
            <div className="relative flex flex-col sm:flex-row items-center justify-center gap-4">
              <Link href="/pools" className="btn-primary text-base px-10 py-3">
                Get Started
              </Link>
              <div className="flex items-center gap-3">
                <a href="https://t.me/Gramketing" target="_blank" rel="noopener noreferrer"
                  aria-label="Join Telegram"
                  className="text-white/50 hover:text-[#0088CC] transition-colors">
                  <TelegramIcon className="w-6 h-6" />
                </a>
                <a href="https://x.com/Gramketing" target="_blank" rel="noopener noreferrer"
                  aria-label="Follow on X"
                  className="text-white/50 hover:text-white transition-colors">
                  <XIcon className="w-5 h-5" />
                </a>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
