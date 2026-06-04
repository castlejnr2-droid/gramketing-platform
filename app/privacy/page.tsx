import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';

export const metadata = {
  title: 'Privacy Policy — Gramketing',
  description: 'Privacy Policy for the Gramketing performance marketing platform on TON.',
};

export default function PrivacyPage() {
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
            <h1 className="text-3xl font-bold text-white mb-2">Privacy Policy</h1>
            <p className="text-sm text-white/40">Effective date: 1 June 2025 · Last updated: 1 June 2025</p>
          </div>

          <Section title="1. Who We Are">
            <p>
              Gramketing is a decentralised performance-marketing platform built on the TON blockchain. We connect
              project owners with content creators and marketers who earn token rewards for promoting projects on X
              (Twitter) and Telegram. References to &quot;Gramketing&quot;, &quot;we&quot;, &quot;us&quot;, or
              &quot;our&quot; in this policy refer to the Gramketing platform and its operators.
            </p>
          </Section>

          <Section title="2. Data We Collect">
            <p className="mb-3">We collect only the minimum data required to operate the platform:</p>
            <ul className="space-y-2">
              <Li label="TON wallet address">Your public wallet address is the primary identifier on the platform. It is publicly visible on the blockchain and on leaderboards.</Li>
              <Li label="X (Twitter) handle and account ID">Collected only if you choose to link your X account via OAuth. Used solely to attribute X post submissions to your account.</Li>
              <Li label="Telegram chat ID">Collected only if you choose to link your Telegram account via our bot. Used to send opt-in notifications (pool alerts, rank changes, reward distributions).</Li>
              <Li label="Display name">An optional username you may set in your dashboard. Shown on leaderboards in place of your wallet address.</Li>
              <Li label="Post URLs you submit">The specific X or Telegram post links you submit as evidence of marketing activity.</Li>
              <Li label="Usage data">Standard server logs (IP address, browser type, pages visited) retained for up to 30 days for security and debugging. We do not sell or share these logs.</Li>
            </ul>
          </Section>

          <Section title="3. Wallet Connection">
            <p>
              Connecting your TON wallet (via TonConnect) does not grant us access to your private keys or the ability
              to move funds on your behalf. Wallet connection creates a cryptographic proof that you control the
              address. All on-chain transactions (deposits, distributions) are signed exclusively by you through your
              own wallet application.
            </p>
          </Section>

          <Section title="4. How We Use Your Data">
            <ul className="space-y-2">
              <Li label="Platform operation">Tracking participation in reward pools, calculating points, and attributing post performance to your account.</Li>
              <Li label="Reward distribution">Passing winning wallet addresses to the smart contract for proportional token distribution.</Li>
              <Li label="Notifications">Sending Telegram messages you have explicitly opted into (outranked alerts, pool ending soon, rewards distributed).</Li>
              <Li label="Fraud prevention">Detecting and preventing fake views, spam submissions, and Sybil attacks.</Li>
              <Li label="Legal compliance">Responding to valid legal requests in the jurisdictions in which we operate.</Li>
            </ul>
          </Section>

          <Section title="5. Data Sharing">
            <p className="mb-3">We do not sell your personal data. We may share limited data with:</p>
            <ul className="space-y-2">
              <Li label="TON blockchain">Wallet addresses of winners are submitted to the escrow smart contract as part of the distribution process. This is a public, immutable action on-chain.</Li>
              <Li label="X API">Post URLs are sent to the Twitter/X API to retrieve public engagement metrics (views, likes, reposts). No account credentials are shared.</Li>
              <Li label="Telegram Bot API">Your Telegram chat ID is used to deliver messages via the Telegram Bot API when you have opted in.</Li>
              <Li label="Infrastructure providers">Our hosting and database providers process data under confidentiality agreements.</Li>
            </ul>
          </Section>

          <Section title="6. Data Retention">
            <p>
              Leaderboard rankings and participation records are retained indefinitely to maintain an accurate
              historical record of pool results. You may request deletion of your personal data (username, linked social
              handles, Telegram chat ID) at any time by contacting us. Your wallet address and on-chain transaction
              records cannot be deleted as they form part of the public blockchain.
            </p>
          </Section>

          <Section title="7. Your Rights">
            <p>
              Depending on your jurisdiction you may have the right to access, correct, or request deletion of your
              personal data. To exercise these rights, contact us via Telegram at{' '}
              <a href="https://t.me/Gramketing" target="_blank" rel="noopener noreferrer" className="text-[#0088CC] hover:underline">
                t.me/Gramketing
              </a>
              {' '}or by opening a support request. We will respond within 30 days.
            </p>
          </Section>

          <Section title="8. Security">
            <p>
              We employ industry-standard security practices including encrypted connections (TLS), hashed
              authentication tokens, and access controls. Smart contract escrow logic has been designed to prevent
              unauthorised withdrawals. However, no system is perfectly secure and you use the platform at your own
              risk.
            </p>
          </Section>

          <Section title="9. Cookies">
            <p>
              We use a single authentication cookie to maintain your login session after connecting your wallet. This
              cookie does not track you across third-party sites and is removed when you log out. We do not use
              advertising or analytics cookies.
            </p>
          </Section>

          <Section title="10. Children">
            <p>
              Gramketing is not directed at individuals under the age of 18. We do not knowingly collect data from
              minors. If you believe a minor has provided data to us, contact us for immediate removal.
            </p>
          </Section>

          <Section title="11. Changes to This Policy">
            <p>
              We may update this policy to reflect changes in our practices or applicable law. Significant changes will
              be announced on our Telegram channel. Continued use of the platform after updates constitutes acceptance
              of the revised policy.
            </p>
          </Section>

          <Section title="12. Contact">
            <p>
              For privacy-related enquiries:{' '}
              <a href="https://t.me/Gramketing" target="_blank" rel="noopener noreferrer" className="text-[#0088CC] hover:underline">
                t.me/Gramketing
              </a>
            </p>
          </Section>

          <div className="pt-4 border-t border-white/10 flex gap-4 text-sm text-white/40">
            <Link href="/terms" className="hover:text-[#0088CC] transition-colors">Terms of Service</Link>
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
