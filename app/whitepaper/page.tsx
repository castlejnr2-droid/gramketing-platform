import Link from 'next/link';
import { Download, FileText, ChevronRight } from 'lucide-react';

const SECTIONS = [
  { num: '01', title: 'Abstract', desc: 'A concise summary of GRAMKETING\'s mission, the problem it solves, and the solution it delivers.' },
  { num: '02', title: 'Introduction', desc: 'Background on the Web3 marketing landscape and why existing solutions fall short for TON-native projects.' },
  { num: '03', title: 'Platform Overview', desc: 'End-to-end walkthrough of how the platform connects projects with marketers through transparent, on-chain incentives.' },
  { num: '04', title: 'User Roles', desc: 'Definitions and responsibilities of the three participant tiers: Contributors, Promoters, and Marketers.' },
  { num: '05', title: 'Pool Lifecycle', desc: 'The complete state machine of a reward pool - creation, funding, active period, end, and distribution.' },
  { num: '06', title: 'Scoring System', desc: 'How X and Telegram post metrics (views, likes, reposts, reactions) are weighted and aggregated into points.' },
  { num: '07', title: 'Boost Mechanics', desc: 'Proportional holder boost (1.0×–2.0×) and referral boost (1.0×–2.0×) - formulas, ranges, and recalculation cadence.' },
  { num: '08', title: 'Reward Distribution', desc: 'Pro-rata distribution math, the role of the escrow smart contract, and the cancellation policy.' },
  { num: '09', title: 'Smart Contract Architecture', desc: 'Technical deep-dive into GramketingPool.tact - state machine, message handlers, TEP-74 jetton integration.' },
  { num: '10', title: 'Access Fee Model', desc: 'Dollar-pegged fee structure, TON and $mGRAM payment options, and treasury wallet flow.' },
  { num: '11', title: 'Token Mechanics - $mGRAM', desc: 'Utility, supply, distribution, and the planned governance role of the native $mGRAM token.' },
  { num: '12', title: 'Security & Anti-Abuse', desc: 'Bot detection, rate limiting, wallet linking rules, unique-post enforcement, and cooldown mechanics.' },
  { num: '13', title: 'Technical Stack', desc: 'Next.js 14, Prisma + PostgreSQL, TON Connect 2.0, Tact smart contracts, and the scraper infrastructure.' },
  { num: '14', title: 'Roadmap', desc: 'Phase-by-phase development plan from MVP through DAO governance, covering milestones and timelines.' },
];

function DownloadButton({ className = '' }: { className?: string }) {
  return (
    <a
      href="/Gramketing_Whitepaper_v1.0.docx"
      download
      className={`inline-flex items-center gap-2.5 px-6 py-3 rounded-xl bg-[#0088CC] hover:bg-[#0099DD] active:bg-[#0077BB] text-white font-semibold text-sm transition-all shadow-lg shadow-[#0088CC]/20 ${className}`}
    >
      <Download className="w-4 h-4" />
      Download Whitepaper
    </a>
  );
}

export default function WhitepaperPage() {
  return (
    <div className="min-h-screen pt-24 pb-20 px-4">
      <div className="max-w-4xl mx-auto">

        {/* ── Hero ── */}
        <div className="text-center mb-16">
          {/* Version badge */}
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-[#0088CC]/10 border border-[#0088CC]/25 text-[#0088CC] text-xs font-semibold mb-6">
            <span className="w-1.5 h-1.5 rounded-full bg-[#0088CC]" />
            Version 1.0 - June 2026
          </div>

          <h1 className="text-4xl sm:text-5xl font-bold text-white mb-4 leading-tight">
            GRAMKETING<br />
            <span className="text-[#0088CC]">Whitepaper</span>
          </h1>

          <p className="text-white/50 text-lg max-w-2xl mx-auto mb-10 leading-relaxed">
            A technical deep-dive into the platform&apos;s architecture, economics, and token mechanics
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <DownloadButton />
            <Link
              href="/docs"
              className="inline-flex items-center gap-2 px-6 py-3 rounded-xl btn-secondary text-sm font-semibold"
            >
              <FileText className="w-4 h-4" />
              Read Documentation
            </Link>
          </div>
        </div>

        {/* ── Preview card ── */}
        <div className="glass-card p-8 mb-8">
          <div className="flex items-start gap-5 mb-8">
            {/* Doc icon */}
            <div className="w-16 h-20 rounded-xl bg-[#0088CC]/10 border border-[#0088CC]/25 flex flex-col items-center justify-center gap-1 flex-shrink-0">
              <FileText className="w-7 h-7 text-[#0088CC]" />
              <span className="text-[10px] text-[#0088CC]/70 font-mono">.docx</span>
            </div>
            <div>
              <h2 className="text-xl font-bold text-white mb-1">Gramketing Whitepaper v1.0</h2>
              <p className="text-sm text-white/40 mb-2">June 2026 · 14 sections · Full technical specification</p>
              <p className="text-sm text-white/60 leading-relaxed">
                This document covers everything from the high-level product vision to low-level smart contract
                message handlers. Suitable for technical reviewers, investors, and contributors looking to
                understand how GRAMKETING works under the hood.
              </p>
            </div>
          </div>

          {/* Section list */}
          <div className="border-t border-white/8 pt-6">
            <h3 className="text-xs font-semibold text-white/40 uppercase tracking-wider mb-4">
              Contents - {SECTIONS.length} Sections
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-px bg-white/5 rounded-xl overflow-hidden border border-white/8">
              {SECTIONS.map((s) => (
                <div
                  key={s.num}
                  className="flex items-start gap-3 px-4 py-3.5 bg-[#080C18] hover:bg-white/[0.02] transition-colors group"
                >
                  <span className="text-[11px] font-mono text-[#0088CC]/60 pt-0.5 flex-shrink-0 w-6">
                    {s.num}
                  </span>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-white/80 group-hover:text-white transition-colors leading-tight mb-0.5">
                      {s.title}
                    </p>
                    <p className="text-xs text-white/35 leading-relaxed">
                      {s.desc}
                    </p>
                  </div>
                  <ChevronRight className="w-3.5 h-3.5 text-white/15 flex-shrink-0 mt-0.5 group-hover:text-[#0088CC]/50 transition-colors" />
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* ── Bottom download CTA ── */}
        <div className="glass-card p-8 flex flex-col sm:flex-row items-center justify-between gap-6">
          <div>
            <h3 className="text-lg font-bold text-white mb-1">Ready to dive in?</h3>
            <p className="text-sm text-white/50">
              Download the full whitepaper for the complete technical specification.
            </p>
          </div>
          <DownloadButton className="flex-shrink-0" />
        </div>

      </div>
    </div>
  );
}
