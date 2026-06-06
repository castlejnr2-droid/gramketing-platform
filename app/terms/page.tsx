import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';

export const metadata = {
  title: 'Terms of Service - Gramketing',
  description: 'Terms of Service for the Gramketing performance marketing platform on TON.',
};

export default function TermsPage() {
  return (
    <div className="min-h-screen pt-24 pb-20 px-4">
      <div className="max-w-3xl mx-auto">
        <Link
          href="/"
          className="inline-flex items-center gap-2 text-white/40 hover:text-white transition-colors text-sm mb-8"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Home
        </Link>

        <div className="glass-card p-8 md:p-12 space-y-8">
          <div>
            <h1 className="text-3xl font-bold text-white mb-2">Terms of Service</h1>
            <p className="text-sm text-white/40">Effective date: 1 June 2025 · Last updated: 1 June 2025</p>
          </div>

          <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-300 text-sm leading-relaxed">
            <strong>No Financial Advice.</strong> Nothing on Gramketing constitutes financial, investment, or legal
            advice. Token rewards are paid in project-native tokens whose value may be zero. Participate only with
            what you can afford to lose.
          </div>

          <Section title="1. Acceptance of Terms">
            <p>
              By connecting a wallet to Gramketing or using any part of the platform, you agree to be bound by these
              Terms of Service and our Privacy Policy. If you do not agree, do not use the platform. We may update
              these terms at any time; continued use constitutes acceptance.
            </p>
          </Section>

          <Section title="2. Eligibility">
            <p>
              You must be at least 18 years old and legally permitted to participate in token-based activities in your
              jurisdiction. By using Gramketing you represent that you meet these requirements. We reserve the right to
              restrict access to certain jurisdictions without notice.
            </p>
          </Section>

          <Section title="3. Platform Description">
            <p className="mb-2">
              Gramketing is a performance-marketing platform that enables:
            </p>
            <ul className="list-disc list-inside space-y-1">
              <li><strong>Project owners</strong> to create reward pools, depositing tokens into a smart-contract escrow in exchange for organic marketing activity.</li>
              <li><strong>Marketers</strong> to earn a proportional share of the token pool by submitting X (Twitter) and Telegram posts that generate measurable engagement.</li>
            </ul>
            <p className="mt-2">
              Gramketing does not itself hold, manage, or guarantee any tokens. Funds are held in autonomous smart
              contracts on the TON blockchain.
            </p>
          </Section>

          <Section title="4. Wallet Connection and Authentication">
            <p>
              You authenticate by connecting a TON wallet via TonConnect. You are solely responsible for the security
              of your wallet, seed phrase, and private keys. We cannot recover lost wallets or reverse on-chain
              transactions. Connecting your wallet does not transfer custody of your assets to Gramketing.
            </p>
          </Section>

          <Section title="5. Reward Pools and Token Deposits">
            <p>
              Project owners who create pools must deposit the stated reward amount into the smart-contract escrow.
              Gramketing charges an access fee (denominated in TON or $mGRAM, pegged to USD) to list a pool. This fee
              is non-refundable. Pool creators agree that they have the authority to use the tokens being deposited and
              that depositing those tokens does not violate any applicable law.
            </p>
          </Section>

          <Section title="6. Marketer Obligations">
            <p className="mb-2">By submitting posts to a pool you agree that:</p>
            <ul className="space-y-1">
              <Li label="Authentic content">Posts must be genuine. Artificially inflated views, bot-generated engagement, or purchased interactions are prohibited and will result in immediate disqualification and a platform ban.</Li>
              <Li label="Accurate submission">You may only submit posts that you personally created or control.</Li>
              <Li label="Token holding">Referral bonuses are only awarded when a referred user demonstrably holds the pool project's token on-chain. We verify this through the TON blockchain.</Li>
              <Li label="One account">You may not operate multiple wallet addresses to gain unfair advantage in a single pool.</Li>
            </ul>
          </Section>

          <Section title="7. Points, Scoring, and Distribution">
            <p>
              Points are calculated algorithmically from publicly verifiable engagement metrics (views, likes, reposts,
              reactions) scraped every 30 minutes. Holder boost and referral boost are applied proportionally
              pool-wide. Final distribution is triggered by the platform admin once a pool ends. Token amounts are
              determined by each winner&apos;s proportional share of total points among the top-N reward slots.
            </p>
            <p className="mt-2">
              Gramketing reserves the right to disqualify any participant found to have violated these terms,
              retroactively removing their points and reallocating their share.
            </p>
          </Section>

          <Section title="8. Smart Contract Risk">
            <p>
              The escrow smart contracts have been developed with security in mind, but smart contracts may contain
              bugs or be subject to exploits beyond our control. By participating you accept the risk of smart contract
              failure. We will make reasonable efforts to remediate any identified vulnerabilities but cannot guarantee
              the safety of funds held in deployed contracts.
            </p>
          </Section>

          <Section title="9. No Financial Advice; No Guarantees">
            <p>
              Gramketing does not provide financial, investment, tax, or legal advice. Token rewards have no guaranteed
              monetary value. We make no representation that any project whose pool is listed on Gramketing is
              legitimate, solvent, or that its tokens will retain any value. Do your own research before participating.
            </p>
          </Section>

          <Section title="10. Intellectual Property">
            <p>
              All platform code, design, branding, and content (excluding user-submitted posts) is owned by Gramketing
              and protected by applicable intellectual property law. You may not copy, reproduce, or redistribute
              platform assets without prior written permission.
            </p>
          </Section>

          <Section title="11. Prohibited Conduct">
            <p className="mb-2">You agree not to:</p>
            <ul className="list-disc list-inside space-y-1 text-white/60">
              <li>Attempt to hack, exploit, or reverse-engineer any part of the platform or smart contracts.</li>
              <li>Use automated tools to manipulate post metrics or scraping results.</li>
              <li>Impersonate another user or project.</li>
              <li>Submit false or misleading information.</li>
              <li>Violate any applicable law or regulation.</li>
            </ul>
            <p className="mt-2">
              Violations may result in immediate account termination, on-chain ban of your wallet address, and
              forfeiture of any pending rewards.
            </p>
          </Section>

          <Section title="12. Limitation of Liability">
            <p>
              To the maximum extent permitted by law, Gramketing and its operators are not liable for any indirect,
              incidental, special, or consequential damages arising from your use of the platform, including but not
              limited to loss of tokens, missed rewards, smart contract failures, or third-party actions. Our total
              aggregate liability to you shall not exceed the access fees you paid in the 12 months preceding the
              claim.
            </p>
          </Section>

          <Section title="13. Governing Law">
            <p>
              These terms are governed by applicable international commercial law to the extent permitted. Disputes
              shall be resolved through good-faith negotiation first, followed by binding arbitration if unresolved
              within 60 days.
            </p>
          </Section>

          <Section title="14. Contact">
            <p>
              For questions about these terms:{' '}
              <a href="https://t.me/Gramketing" target="_blank" rel="noopener noreferrer" className="text-[#0088CC] hover:underline">
                t.me/Gramketing
              </a>
            </p>
          </Section>

          <div className="pt-4 border-t border-white/10 flex gap-4 text-sm text-white/40">
            <Link href="/privacy" className="hover:text-[#0088CC] transition-colors">Privacy Policy</Link>
            <Link href="/" className="hover:text-[#0088CC] transition-colors">Home</Link>
          </div>
        </div>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h2 className="text-lg font-semibold text-white mb-3">{title}</h2>
      <div className="text-white/60 text-sm leading-relaxed space-y-2">{children}</div>
    </div>
  );
}

function Li({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <li className="flex gap-2">
      <span className="text-[#0088CC] font-medium shrink-0">{label}:</span>
      <span>{children}</span>
    </li>
  );
}
