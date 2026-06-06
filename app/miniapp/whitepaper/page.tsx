import Link from 'next/link';
import { Download, FileText, ChevronRight } from 'lucide-react';

const SECTIONS = [
  { num: '01', title: 'Abstract', desc: 'Mission, problem, and solution overview.' },
  { num: '02', title: 'Introduction', desc: 'Background on Web3 marketing and the TON ecosystem.' },
  { num: '03', title: 'Platform Overview', desc: 'How projects and marketers are connected through on-chain incentives.' },
  { num: '04', title: 'User Roles', desc: 'Contributors, Promoters, and Marketers - responsibilities and tiers.' },
  { num: '05', title: 'Pool Lifecycle', desc: 'Creation → funding → active → end → distribution state machine.' },
  { num: '06', title: 'Scoring System', desc: 'How views, likes, reposts, and reactions are weighted into points.' },
  { num: '07', title: 'Boost Mechanics', desc: 'Holder boost (1.0×–2.0×) and referral boost - formulas and cadence.' },
  { num: '08', title: 'Reward Distribution', desc: 'Pro-rata math, escrow contract, and cancellation policy.' },
  { num: '09', title: 'Smart Contract Architecture', desc: 'GramketingPool.tact - state machine and TEP-74 jetton integration.' },
  { num: '10', title: 'Access Fee Model', desc: 'Dollar-pegged fees, TON and $mGRAM payment options, treasury flow.' },
  { num: '11', title: 'Token Mechanics - $mGRAM', desc: 'Utility, supply, distribution, and governance of $mGRAM.' },
  { num: '12', title: 'Security & Anti-Abuse', desc: 'Bot detection, rate limiting, and wallet linking rules.' },
  { num: '13', title: 'Technical Stack', desc: 'Next.js, Prisma, TON Connect 2.0, Tact, and the scraper.' },
  { num: '14', title: 'Roadmap', desc: 'Phase-by-phase plan from MVP through DAO governance.' },
];

export default function MiniAppWhitepaperPage() {
  return (
    <div className="pt-5 pb-6 px-4">

      {/* ── Hero ── */}
      <div className="text-center mb-6">
        <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[#0088CC]/10 border border-[#0088CC]/25 text-[#0088CC] text-[11px] font-semibold mb-4">
          <span className="w-1.5 h-1.5 rounded-full bg-[#0088CC]" />
          Version 1.0 - June 2026
        </div>

        <h1 className="text-2xl font-bold text-white mb-2 leading-tight">
          GRAMKETING <span className="text-[#0088CC]">Whitepaper</span>
        </h1>
        <p className="text-white/50 text-sm leading-relaxed mb-6 max-w-xs mx-auto">
          A technical deep-dive into the platform&apos;s architecture, economics, and token mechanics
        </p>

        <a
          href="/Gramketing_Whitepaper_v1.0.docx"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 px-5 py-3 rounded-xl bg-[#0088CC] hover:bg-[#0099DD] text-white font-semibold text-sm transition-all shadow-lg shadow-[#0088CC]/20"
        >
          <Download className="w-4 h-4" />
          Download Whitepaper
        </a>
      </div>

      {/* ── Document card ── */}
      <div className="glass-card p-4 mb-4">
        <div className="flex items-center gap-3 mb-4 pb-4 border-b border-white/8">
          <div className="w-12 h-14 rounded-lg bg-[#0088CC]/10 border border-[#0088CC]/25 flex flex-col items-center justify-center gap-0.5 flex-shrink-0">
            <FileText className="w-5 h-5 text-[#0088CC]" />
            <span className="text-[9px] text-[#0088CC]/70 font-mono">.docx</span>
          </div>
          <div>
            <p className="text-sm font-bold text-white leading-tight">Gramketing Whitepaper v1.0</p>
            <p className="text-xs text-white/40 mt-0.5">June 2026 · 14 sections</p>
            <p className="text-xs text-white/50 mt-1 leading-relaxed">
              Full technical specification - architecture, economics, and contract design.
            </p>
          </div>
        </div>

        {/* Contents list */}
        <p className="text-[10px] font-semibold text-white/35 uppercase tracking-wider mb-3">
          Contents
        </p>
        <div className="space-y-0 rounded-xl overflow-hidden border border-white/8">
          {SECTIONS.map((s, i) => (
            <div
              key={s.num}
              className={`flex items-start gap-3 px-3 py-2.5 bg-white/[0.02] ${
                i < SECTIONS.length - 1 ? 'border-b border-white/5' : ''
              }`}
            >
              <span className="text-[10px] font-mono text-[#0088CC]/50 pt-0.5 flex-shrink-0 w-5">
                {s.num}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-semibold text-white/80 leading-tight">{s.title}</p>
                <p className="text-[11px] text-white/35 leading-relaxed mt-0.5">{s.desc}</p>
              </div>
              <ChevronRight className="w-3 h-3 text-white/15 flex-shrink-0 mt-0.5" />
            </div>
          ))}
        </div>
      </div>

      {/* ── Bottom download ── */}
      <div className="glass-card p-5 flex flex-col items-center gap-3 text-center">
        <p className="text-sm font-semibold text-white">Ready to dive in?</p>
        <p className="text-xs text-white/40">Download the full PDF for the complete technical specification.</p>
        <a
          href="/Gramketing_Whitepaper_v1.0.docx"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#0088CC] hover:bg-[#0099DD] text-white font-semibold text-sm transition-all w-full justify-center"
        >
          <Download className="w-4 h-4" />
          Download Whitepaper
        </a>
        <Link href="/miniapp/docs" className="text-xs text-[#0088CC] hover:underline">
          Read Documentation instead →
        </Link>
      </div>

    </div>
  );
}
