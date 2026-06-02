import Link from 'next/link';

function TelegramIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="currentColor"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm5.894 8.221-1.97 9.28c-.145.658-.537.818-1.084.508l-3-2.21-1.447 1.394c-.16.16-.295.295-.605.295l.213-3.053 5.56-5.023c.242-.213-.054-.333-.373-.12L7.19 13.676l-2.96-.924c-.643-.204-.657-.643.136-.953l11.57-4.461c.537-.194 1.006.131.958.883z" />
    </svg>
  );
}

function XIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="currentColor"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.744l7.73-8.835L1.254 2.25H8.08l4.253 5.622 5.91-5.622zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
  );
}

export function Footer() {
  return (
    <footer className="border-t border-white/10 bg-[#0A0F1E] mt-20">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-10">
          {/* Brand */}
          <div className="md:col-span-1">
            <Link
              href="/"
              className="text-xl font-bold text-[#0088CC] tracking-wide"
            >
              GRAMKETING
            </Link>
            <p className="mt-3 text-sm text-white/50 leading-relaxed">
              Web3 Performance Marketing on TON. Marketers earn rewards,
              projects get real growth.
            </p>
            <div className="mt-5 flex items-center gap-3">
              <a
                href="https://t.me/Gramketing"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 text-white/40 hover:text-[#0088CC] transition-colors text-sm"
              >
                <TelegramIcon className="w-5 h-5" />
                <span>Telegram</span>
              </a>
              <a
                href="https://x.com/Gramketing"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 text-white/40 hover:text-white transition-colors text-sm"
              >
                <XIcon className="w-4 h-4" />
                <span>X</span>
              </a>
            </div>
          </div>

          {/* Platform */}
          <div>
            <h3 className="text-sm font-semibold text-white/80 uppercase tracking-wider mb-4">
              Platform
            </h3>
            <ul className="space-y-3">
              <li>
                <Link
                  href="/pools"
                  className="text-sm text-white/50 hover:text-white transition-colors"
                >
                  Browse Pools
                </Link>
              </li>
              <li>
                <Link
                  href="/create-pool"
                  className="text-sm text-white/50 hover:text-white transition-colors"
                >
                  Create a Pool
                </Link>
              </li>
              <li>
                <Link
                  href="/dashboard"
                  className="text-sm text-white/50 hover:text-white transition-colors"
                >
                  Dashboard
                </Link>
              </li>
            </ul>
          </div>

          {/* Resources */}
          <div>
            <h3 className="text-sm font-semibold text-white/80 uppercase tracking-wider mb-4">
              Resources
            </h3>
            <ul className="space-y-3">
              <li>
                <Link
                  href="/docs"
                  className="text-sm text-white/50 hover:text-white transition-colors"
                >
                  Documentation
                </Link>
              </li>
              <li>
                <Link
                  href="/roadmap"
                  className="text-sm text-white/50 hover:text-white transition-colors"
                >
                  Roadmap
                </Link>
              </li>
            </ul>
          </div>

          {/* Community */}
          <div>
            <h3 className="text-sm font-semibold text-white/80 uppercase tracking-wider mb-4">
              Community
            </h3>
            <ul className="space-y-3">
              <li>
                <a
                  href="https://t.me/Gramketing"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 text-sm text-white/50 hover:text-[#0088CC] transition-colors"
                >
                  <TelegramIcon className="w-4 h-4" />
                  Join Telegram
                </a>
              </li>
              <li>
                <a
                  href="https://x.com/Gramketing"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 text-sm text-white/50 hover:text-white transition-colors"
                >
                  <XIcon className="w-3.5 h-3.5" />
                  Follow on X
                </a>
              </li>
            </ul>
          </div>
        </div>

        {/* Bottom bar */}
        <div className="mt-12 pt-8 border-t border-white/5 flex flex-col md:flex-row items-center justify-between gap-4">
          <p className="text-sm text-white/30">
            &copy; 2024 GRAMKETING. Built on TON.
          </p>
          <p className="text-xs text-white/20 text-center md:text-right max-w-lg">
            GRAMKETING is not a financial product. Rewards are earned through
            marketing performance. Participation does not constitute an
            investment.
          </p>
        </div>
      </div>
    </footer>
  );
}
