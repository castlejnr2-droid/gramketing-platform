'use client';
import { useState } from 'react';
import { ChevronDown } from 'lucide-react';

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

function CodeBlock({ children }: { children: React.ReactNode }) {
  return (
    <pre className="bg-white/[0.04] border border-white/10 rounded-xl p-3 text-xs text-[#00AAFF] overflow-x-auto font-mono whitespace-pre-wrap break-words">
      {children}
    </pre>
  );
}

interface AccordionItemProps {
  title: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
}

function AccordionItem({ title, children, defaultOpen = false }: AccordionItemProps) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="glass-card overflow-hidden">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between gap-3 p-4 text-left"
      >
        <span className="text-sm font-medium text-white">{title}</span>
        <ChevronDown
          className={`w-4 h-4 text-white/40 flex-shrink-0 transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
        />
      </button>
      {open && (
        <div className="px-4 pb-4 text-white/60 text-sm leading-relaxed space-y-3 border-t border-white/5 pt-4">
          {children}
        </div>
      )}
    </div>
  );
}

const groups = [
  { label: 'Overview', color: 'text-[#0088CC]' },
  { label: 'For Contributors & Promoters', color: 'text-[#0088CC]' },
  { label: 'For Projects', color: 'text-[#0088CC]' },
];

export default function MiniAppDocsPage() {
  return (
    <div className="pt-5 pb-6 px-4">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white mb-1">Documentation</h1>
        <p className="text-white/50 text-sm">Everything you need to know about GRAMKETING.</p>
      </div>

      {/* OVERVIEW */}
      <div className="mb-6">
        <p className="text-xs font-semibold text-[#0088CC] uppercase tracking-wider mb-3">Overview</p>
        <div className="space-y-2">
          <AccordionItem title="What is GRAMKETING?" defaultOpen>
            <p>
              GRAMKETING is a Web3 performance marketing platform built on the TON blockchain. It connects
              projects that want to grow their community with contributors, promoters, and marketers who
              want to earn rewards for their content.
            </p>
            <p>
              Projects create reward pools funded with their own tokens. Participants compete by posting
              about the project on X (Twitter) and Telegram. At the end of a pool&apos;s duration, rewards
              are distributed proportionally based on each participant&apos;s accumulated points.
            </p>
            <p>
              Everything runs on TON — wallets connect via TON Connect 2.0, payments are made in TON or
              $mGRAM, and reward distribution is handled by a Tact smart contract.
            </p>
          </AccordionItem>

          <AccordionItem title="How Pools Work">
            <p>A pool has a lifecycle:</p>
            <ol className="list-decimal list-inside space-y-2 ml-2">
              <li>Project creates a pool and pays an access fee to the platform treasury.</li>
              <li>Project deposits reward tokens into an escrow smart contract.</li>
              <li>Pool goes ACTIVE — contributors, promoters, and marketers can join and submit posts.</li>
              <li>The scraper runs every 30 minutes, updating view counts and points.</li>
              <li>When the duration expires, the pool is marked ENDED.</li>
              <li>Platform admin triggers distribution — rewards flow to winners&apos; wallets.</li>
            </ol>
          </AccordionItem>

          <AccordionItem title="How the Leaderboard Works">
            <p>
              The leaderboard ranks all participants by total points. Points are updated every 30 minutes
              when the scraper runs. Each update is saved as a snapshot in the database.
            </p>
            <p>
              The leaderboard is public — anyone can view it. Tap any participant&apos;s row to see their
              full stats breakdown.
            </p>
          </AccordionItem>

          <AccordionItem title="Reward Distribution">
            <p>
              Rewards are distributed proportionally based on each participant&apos;s share of total points.
              If the pool has 10 reward slots, the top 10 point-earners share the pool.
            </p>
            <CodeBlock>{`Example: 3-slot pool, 1,000,000 tokens total

Alice: 5,000 pts  → 50% share → 500,000 tokens
Bob:   3,000 pts  → 30% share → 300,000 tokens
Carol: 2,000 pts  → 20% share → 200,000 tokens`}</CodeBlock>
            <p>
              Distribution is triggered by the platform admin after pool end. The smart contract sends
              tokens directly from escrow to each winner&apos;s wallet.
            </p>
          </AccordionItem>
        </div>
      </div>

      {/* FOR CONTRIBUTORS */}
      <div className="mb-6">
        <p className="text-xs font-semibold text-[#0088CC] uppercase tracking-wider mb-3">
          For Contributors, Promoters &amp; Marketers
        </p>
        <div className="space-y-2">
          <AccordionItem title="Participant Tiers">
            <p>
              Every wallet is assigned a tier based on their total points earned across all pools. Tiers
              update in real time as you earn points.
            </p>
            <div className="space-y-2 mt-2">
              {[
                { tier: 'Contributor', pts: '0 pts (default)', color: 'text-white/50', badge: 'border-white/10 text-white/50 bg-white/5' },
                { tier: 'Promoter', pts: '500+ pts', color: 'text-[#0088CC]', badge: 'border-[#0088CC]/30 text-[#0088CC] bg-[#0088CC]/10' },
                { tier: 'Marketer', pts: '5,000+ pts', color: 'text-yellow-400', badge: 'border-yellow-400/30 text-yellow-400 bg-yellow-400/10' },
              ].map((t) => (
                <div key={t.tier} className="flex items-center justify-between gap-2 py-2 border-b border-white/5">
                  <span className={`text-sm font-semibold ${t.color}`}>{t.tier}</span>
                  <span className="text-xs text-white/40">{t.pts}</span>
                  <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full border ${t.badge}`}>{t.tier}</span>
                </div>
              ))}
            </div>
            <p className="mt-2 text-xs">
              Tiers reflect your <strong className="text-white">total lifetime points</strong> across all pools.
            </p>
          </AccordionItem>

          <AccordionItem title="Connect Your X Account">
            <p>
              Go to Settings → enter your X username (without the @). This links your X handle to your
              wallet so submissions can be attributed to you.
            </p>
            <p>Full Twitter OAuth is coming in a future update for automatic post detection.</p>
          </AccordionItem>

          <AccordionItem title="Connect Telegram">
            <p>
              Go to Settings → tap &quot;Link Telegram Account&quot; to generate a code, then send it to
              @GramketingBot. This enables Telegram notifications for rankings, pool alerts, and rewards.
            </p>
          </AccordionItem>

          <AccordionItem title="Submitting Posts">
            <p>Open a pool → Submit tab → paste your X or Telegram post URL. Supported formats:</p>
            <CodeBlock>{`X:        https://x.com/username/status/1234567890
Telegram: https://t.me/yourchannel/456`}</CodeBlock>
            <p>Posts are queued for the next scrape cycle. Views update within 30 minutes.</p>
            <div className="p-3 rounded-xl bg-[#0088CC]/5 border border-[#0088CC]/20 mt-1">
              <p className="text-xs font-semibold text-[#0088CC] mb-1">Telegram: Channel Posts Only</p>
              <p className="text-xs text-white/60">
                Only posts from <strong className="text-white">public Telegram channels</strong> are supported —
                not group messages or DMs. Channel posts have a URL like{' '}
                <code className="text-[#0088CC] bg-[#0088CC]/10 px-1 rounded">t.me/yourchannel/123</code>.
              </p>
            </div>
          </AccordionItem>

          <AccordionItem title="Daily Submission Limits">
            <p>
              You can submit a maximum of{' '}
              <strong className="text-white">2 posts per day</strong> per pool. This applies across
              both platforms — 2 X posts, 2 Telegram posts, or one of each.
            </p>
            <p>The daily limit resets at midnight UTC.</p>
          </AccordionItem>

          <AccordionItem title="How Points Are Calculated">
            <CodeBlock>{`── Per-post scoring ──────────────────────
X score     = (views×0.8 + likes×0.1 + reposts×0.1) / 10
              (min 100 views to qualify)

Telegram    = (views×0.8 + reactions×0.2) × 2

── Campaign weighting ────────────────────
X-only pool      : contentScore = xPoints
Telegram-only    : contentScore = telegramPoints
Both (50/50)     : contentScore = xPoints×0.5
                               + telegramPoints×0.5

── Boosts (recalculated each scrape) ─────
holderBoost   = 1.0 + (yourBalance / topBalance)
referralBoost = 1.0 + (yourReferredTotal / topInPool)

── Final score ───────────────────────────
totalPoints = (contentScore × holderBoost × referralBoost)
            + referralBonusPoints`}</CodeBlock>
          </AccordionItem>

          <AccordionItem title="Scoring System">
            <p className="mb-3">
              When both platforms are active in a pool, each contributes 50% to your final score.
            </p>
            <div className="space-y-3">
              <div>
                <p className="text-xs font-bold text-[#0088CC] mb-2">X / Twitter</p>
                {[
                  { name: 'Views', pct: 80, combined: 40 },
                  { name: 'Likes', pct: 10, combined: 5 },
                  { name: 'Reposts', pct: 10, combined: 5 },
                ].map((m) => (
                  <div key={m.name} className="flex items-center gap-2 mb-1.5">
                    <span className="w-16 text-xs text-white/60 flex-shrink-0">{m.name}</span>
                    <div className="flex-1 h-1.5 rounded-full bg-[#0088CC]/15">
                      <div className="h-full rounded-full bg-[#0088CC]" style={{ width: `${m.pct}%` }} />
                    </div>
                    <span className="text-xs text-[#0088CC] w-10 text-right">{m.combined}%</span>
                  </div>
                ))}
              </div>
              <div>
                <p className="text-xs font-bold text-green-400 mb-2">Telegram</p>
                {[
                  { name: 'Views', pct: 80, combined: 40 },
                  { name: 'Reactions', pct: 20, combined: 10 },
                ].map((m) => (
                  <div key={m.name} className="flex items-center gap-2 mb-1.5">
                    <span className="w-16 text-xs text-white/60 flex-shrink-0">{m.name}</span>
                    <div className="flex-1 h-1.5 rounded-full bg-green-500/15">
                      <div className="h-full rounded-full bg-green-500" style={{ width: `${m.pct}%` }} />
                    </div>
                    <span className="text-xs text-green-400 w-10 text-right">{m.combined}%</span>
                  </div>
                ))}
              </div>
            </div>
          </AccordionItem>

          <AccordionItem title="Holder Boost (1.0x – 2.0x)">
            <p>
              Your holder boost is calculated relative to the highest holder in the pool — not against a
              fixed threshold.
            </p>
            <CodeBlock>{`holderBoost = 1.0 + (yourBalance / topBalanceInPool)

Examples (top holder = 100,000 tokens):
  You hold 100,000  →  2.0x (maximum)
  You hold  50,000  →  1.5x
  You hold  10,000  →  1.1x
  You hold       0  →  1.0x (no boost)`}</CodeBlock>
            <div className="p-3 rounded-xl bg-yellow-500/5 border border-yellow-500/20 text-xs text-white/50">
              <strong className="text-yellow-400">Tip:</strong> Holding more than others matters as much
              as the raw amount.
            </div>
          </AccordionItem>

          <AccordionItem title="Referral System">
            <p>Every pool participant gets a unique referral link. Share it to bring new participants.</p>
            <p>When a referred friend holds the pool&apos;s project token:</p>
            <ul className="list-disc list-inside ml-2 space-y-1">
              <li>You earn <strong className="text-[#0088CC]">+500 bonus points</strong> (one-time per qualifying referral)</li>
              <li>Their token holdings contribute to your ongoing <strong className="text-purple-400">referral boost</strong></li>
            </ul>
            <CodeBlock>{`referralBoost = 1.0 + (referredTotal / topReferredTotalInPool)
Range: 1.0x (no referrals) to 2.0x (top referrer)`}</CodeBlock>
          </AccordionItem>

          <AccordionItem title="How Points Can Decrease">
            <p>Points are recalculated on every scrape cycle. Your total can decrease if:</p>
            <ul className="list-disc list-inside ml-2 space-y-1">
              <li>You sell project tokens — holder boost drops</li>
              <li>Another participant becomes the new top holder — everyone else&apos;s boost drops</li>
              <li>A referred friend sells tokens — their balance stops contributing to your referral boost</li>
              <li>A competing referrer gains more holdings — your referral boost drops</li>
            </ul>
            <p>Base post scores (views, likes, reposts) are cumulative and only increase.</p>
          </AccordionItem>
        </div>
      </div>

      {/* FOR PROJECTS */}
      <div className="mb-6">
        <p className="text-xs font-semibold text-[#0088CC] uppercase tracking-wider mb-3">For Projects</p>
        <div className="space-y-2">
          <AccordionItem title="Creating a Pool">
            <ol className="list-decimal list-inside space-y-2 ml-2">
              <li>Connect your TON wallet</li>
              <li>Go to Create Pool</li>
              <li>Enter project details (name, token symbol, jetton master address, X profile, Telegram channel)</li>
              <li>Choose Campaign Type: X + Telegram, X Only, or Telegram Only</li>
              <li>Optionally link a specific post to promote</li>
              <li>Configure pool: duration, total reward, reward slots</li>
              <li>Pay the access fee (TON or $mGRAM)</li>
              <li>Deposit reward tokens to the escrow contract</li>
              <li>Your pool goes live immediately</li>
            </ol>
          </AccordionItem>

          <AccordionItem title="Pricing Table">
            <p>Access fees are dollar-pegged and paid at live market prices:</p>
            <div className="mt-3 space-y-2">
              {[
                { dur: '1 Week', mgram: '$100', ton: '$125' },
                { dur: '2 Weeks', mgram: '$199', ton: '$249' },
                { dur: '3 Weeks', mgram: '$299', ton: '$374' },
                { dur: '4 Weeks', mgram: '$399', ton: '$499' },
              ].map((row) => (
                <div key={row.dur} className="flex items-center justify-between py-2 border-b border-white/5 text-sm">
                  <span className="text-white/70">{row.dur}</span>
                  <span className="text-white/50">$mGRAM: {row.mgram}</span>
                  <span className="text-white/50">TON: {row.ton}</span>
                </div>
              ))}
            </div>
            <p className="mt-2 text-xs text-white/30">
              Prices are USD-pegged. Exact token amount calculated at payment time via CoinGecko.
            </p>
          </AccordionItem>

          <AccordionItem title="How Escrow Works">
            <p>
              When you create a pool, a GramketingPool smart contract is deployed on TON. You then
              transfer your reward tokens to this contract.
            </p>
            <ul className="list-disc list-inside ml-2 space-y-1">
              <li>Holds tokens securely until pool ends</li>
              <li>Can only distribute to winners via platform admin instruction</li>
              <li>Supports pro-rata cancellation if a pool is ended early</li>
              <li>Is publicly verifiable on TON Scan</li>
            </ul>
            <div className="mt-3 p-4 rounded-xl bg-white/[0.03] border border-white/10 text-xs space-y-2">
              <p className="font-semibold text-white text-sm">Pool Cancellation Policy</p>
              <div className="flex gap-2"><span className="text-[#0088CC]">→</span><span><strong className="text-white">Daily rate</strong> = Total reward ÷ duration in days</span></div>
              <div className="flex gap-2"><span className="text-[#0088CC]">→</span><span><strong className="text-white">Participants share</strong> = daily rate × days elapsed (proportional by points)</span></div>
              <div className="flex gap-2"><span className="text-[#0088CC]">→</span><span><strong className="text-white">Project refund</strong> = daily rate × days remaining</span></div>
              <div className="flex gap-2"><span className="text-red-400">→</span><span><strong className="text-white">Access fee</strong> is fully <strong className="text-red-400">non-refundable</strong></span></div>
            </div>
          </AccordionItem>

          <AccordionItem title="Setting Reward Slots">
            <p>
              Reward slots define how many participants receive rewards. Minimum is 3. All slots share the
              prize pool proportionally by points.
            </p>
            <p>
              Recommendation: set more slots (10–20) to attract more participants. Even rank #15 earns
              something, which incentivizes broader participation.
            </p>
          </AccordionItem>

          <AccordionItem title="What Happens When a Pool Ends">
            <ol className="list-decimal list-inside space-y-2 ml-2">
              <li>Pool status automatically changes to ENDED when duration expires</li>
              <li>A final leaderboard snapshot is saved — results are frozen</li>
              <li>Platform admin and project owner review the final leaderboard</li>
              <li>Project owner receives a notification on their dashboard</li>
              <li>Smart contract distributes tokens proportionally to top N wallets</li>
              <li>Remaining dust (rounding) is returned to the project owner wallet</li>
            </ol>
            <p>Typical distribution time: within 24–48 hours of pool ending.</p>
          </AccordionItem>
        </div>
      </div>

      {/* Community links */}
      <div className="glass-card p-5 flex flex-col items-center gap-3 text-center">
        <p className="text-white/60 text-sm">Have questions? Join our community.</p>
        <div className="flex items-center gap-3">
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
  );
}
