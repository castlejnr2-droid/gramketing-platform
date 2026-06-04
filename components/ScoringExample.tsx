'use client';

const X_POSTS = [
  {
    url: 'x.com/user/status/1234567890',
    views: '2,100', likes: '220', reposts: '140',
    pts: '+2,240 pts',
    breakdown: [
      { label: 'views 80%', value: '1,680' },
      { label: 'likes 10%', value: '440' },
      { label: 'reposts 10%', value: '120' },
    ],
  },
  {
    url: 'x.com/user/status/9876543210',
    views: '1,100', likes: '160', reposts: '80',
    pts: '+1,560 pts',
    breakdown: [
      { label: 'views 80%', value: '880' },
      { label: 'likes 10%', value: '320' },
      { label: 'reposts 10%', value: '160' },
    ],
  },
];

const TG_POSTS = [
  {
    url: 't.me/channel/123456',
    views: '1,800', reactions: '180',
    pts: '+1,680 pts',
    breakdown: [
      { label: 'views 80%', value: '1,344' },
      { label: 'reactions 20%', value: '336' },
    ],
  },
  {
    url: 't.me/channel/789012',
    views: '1,400', reactions: '120',
    pts: '+1,220 pts',
    breakdown: [
      { label: 'views 80%', value: '976' },
      { label: 'reactions 20%', value: '244' },
    ],
  },
];

const REFERRALS = [
  { wallet: 'UQ...ab12', tokens: '12,400', boost: '+0.18×' },
  { wallet: 'UQ...cd34', tokens: '8,200',  boost: '+0.07×' },
  { wallet: 'UQ...ef56', tokens: '4,100',  boost: '+0.05×' },
];

function Row({ label, value, accent }: { label: string; value: string; accent: string }) {
  return (
    <div className="flex gap-1.5 items-center flex-wrap">
      <span className="text-xs text-white/40">{label}</span>
      <span className={`text-xs font-mono px-1.5 py-0.5 rounded bg-white/[0.04] ${accent}`}>{value}</span>
    </div>
  );
}

export function ScoringExample() {
  return (
    <div className="mt-5 rounded-xl border border-white/10 overflow-hidden text-sm">

      {/* ── Header ── */}
      <div className="bg-white/[0.04] border-b border-white/8 px-4 py-3 flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2.5">
          <span className="text-xs text-white/30 font-mono">#2</span>
          <span className="font-mono text-xs text-white/70 bg-white/5 border border-white/10 rounded px-2 py-0.5">
            UQ...c3d4
          </span>
        </div>
        <span className="font-bold text-white">11,390 pts</span>
      </div>

      {/* ── Formula ── */}
      <div className="px-4 py-3 border-b border-white/8 bg-[#0088CC]/[0.06]">
        <p className="text-[10px] text-white/35 uppercase tracking-wider mb-1">Final Score Formula</p>
        <p className="font-mono text-sm text-white/90">
          (3,800 + 2,900) <span className="text-white/40">×</span> 1.4 <span className="text-white/40">×</span> 1.3{' '}
          <span className="text-white/40">=</span>{' '}
          <span className="text-[#0088CC] font-bold">11,390 pts</span>
        </p>
      </div>

      {/* ── Content Performance ── */}
      <div className="px-4 py-3 border-b border-white/8">
        <p className="text-[10px] font-semibold text-white/35 uppercase tracking-wider mb-2.5">
          Content Performance
        </p>
        <div className="grid grid-cols-2 gap-2">
          <div className="p-2.5 rounded-lg bg-[#0088CC]/8 border border-[#0088CC]/20">
            <p className="text-[10px] text-[#0088CC] mb-1">X Points</p>
            <p className="text-white font-bold text-base">3,800</p>
          </div>
          <div className="p-2.5 rounded-lg bg-green-500/8 border border-green-500/20">
            <p className="text-[10px] text-green-400 mb-1">Telegram Points</p>
            <p className="text-white font-bold text-base">2,900</p>
          </div>
        </div>
      </div>

      {/* ── X / Twitter Posts ── */}
      <div className="px-4 py-3 border-b border-white/8">
        <p className="text-[10px] font-semibold text-[#0088CC] uppercase tracking-wider mb-3">
          X / Twitter Posts
        </p>
        <div className="space-y-2.5">
          {X_POSTS.map((post) => (
            <div key={post.url} className="p-3 rounded-lg bg-white/[0.025] border border-white/8">
              <div className="flex items-start justify-between gap-2 mb-2">
                <span className="font-mono text-[11px] text-[#0088CC] break-all leading-tight">
                  {post.url}
                </span>
                <span className="text-[11px] font-bold text-[#0088CC] flex-shrink-0">{post.pts}</span>
              </div>
              <div className="flex gap-3 text-[11px] text-white/45 mb-2.5">
                <span>views {post.views}</span>
                <span className="text-white/20">/</span>
                <span>likes {post.likes}</span>
                <span className="text-white/20">/</span>
                <span>reposts {post.reposts}</span>
              </div>
              <div className="flex items-center gap-1.5 flex-wrap">
                {post.breakdown.map((b, i) => (
                  <>
                    <span
                      key={b.label}
                      className="text-[11px] text-white/50 bg-white/[0.04] border border-white/8 rounded px-1.5 py-0.5"
                    >
                      {b.label} = <span className="text-white/70">{b.value}</span>
                    </span>
                    {i < post.breakdown.length - 1 && (
                      <span key={`plus-${i}`} className="text-white/20 text-xs">+</span>
                    )}
                  </>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Telegram Posts ── */}
      <div className="px-4 py-3 border-b border-white/8">
        <p className="text-[10px] font-semibold text-green-400 uppercase tracking-wider mb-3">
          Telegram Posts
        </p>
        <div className="space-y-2.5">
          {TG_POSTS.map((post) => (
            <div key={post.url} className="p-3 rounded-lg bg-white/[0.025] border border-white/8">
              <div className="flex items-start justify-between gap-2 mb-2">
                <span className="font-mono text-[11px] text-green-400 break-all leading-tight">
                  {post.url}
                </span>
                <span className="text-[11px] font-bold text-green-400 flex-shrink-0">{post.pts}</span>
              </div>
              <div className="flex gap-3 text-[11px] text-white/45 mb-2.5">
                <span>views {post.views}</span>
                <span className="text-white/20">/</span>
                <span>reactions {post.reactions}</span>
              </div>
              <div className="flex items-center gap-1.5 flex-wrap">
                {post.breakdown.map((b, i) => (
                  <>
                    <span
                      key={b.label}
                      className="text-[11px] text-white/50 bg-white/[0.04] border border-white/8 rounded px-1.5 py-0.5"
                    >
                      {b.label} = <span className="text-white/70">{b.value}</span>
                    </span>
                    {i < post.breakdown.length - 1 && (
                      <span key={`plus-${i}`} className="text-white/20 text-xs">+</span>
                    )}
                  </>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Boosts ── */}
      <div className="px-4 py-3 border-b border-white/8">
        <p className="text-[10px] font-semibold text-white/35 uppercase tracking-wider mb-3">Boosts</p>

        {/* Holder boost */}
        <div className="flex items-center justify-between px-3 py-2.5 rounded-lg bg-yellow-500/[0.06] border border-yellow-500/15 mb-2">
          <div>
            <p className="text-xs font-semibold text-yellow-400">Holder Boost</p>
            <p className="text-[11px] text-white/40 mt-0.5">70% of top holder</p>
          </div>
          <span className="text-yellow-400 font-bold text-base">1.4×</span>
        </div>

        {/* Referral boost */}
        <div className="px-3 py-2.5 rounded-lg bg-purple-500/[0.06] border border-purple-500/15">
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs font-semibold text-purple-400">Referral Boost</p>
            <span className="text-purple-400 font-bold text-base">1.3×</span>
          </div>
          {/* Referred wallets table */}
          <div>
            <div className="grid grid-cols-[1fr_auto_auto] gap-x-3 text-[10px] text-white/30 uppercase tracking-wider pb-1.5 mb-1 border-b border-white/8">
              <span>Referred Wallet</span>
              <span className="text-right">Tokens</span>
              <span className="text-right">Boost</span>
            </div>
            {REFERRALS.map((r) => (
              <div key={r.wallet} className="grid grid-cols-[1fr_auto_auto] gap-x-3 py-1.5 text-[11px] border-b border-white/[0.04] last:border-0">
                <span className="font-mono text-white/60">{r.wallet}</span>
                <span className="text-right text-white/45">{r.tokens}</span>
                <span className="text-right text-purple-400 font-medium">{r.boost}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Final Score ── */}
      <div className="px-4 py-3 bg-[#0088CC]/[0.08] flex items-center justify-between">
        <span className="text-sm font-semibold text-white/60">Final Score</span>
        <span className="text-[#0088CC] font-bold text-lg">11,390 pts</span>
      </div>

    </div>
  );
}
