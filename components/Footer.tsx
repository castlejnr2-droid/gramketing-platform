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

export function Footer() {
  return (
    <footer
      style={{
        position: 'relative',
        zIndex: 1,
        borderTop: '1px solid rgba(255,255,255,0.08)',
        background: 'rgba(0,0,0,0.40)',
        backdropFilter: 'blur(16px)',
        WebkitBackdropFilter: 'blur(16px)',
      }}
    >
      <div className="max-w-7xl mx-auto px-6 py-14">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-10">

          {/* Brand */}
          <div className="space-y-3">
            <Link href="/" className="text-xl font-bold" style={{ color: '#00d4ff' }}>
              GRAMKETING
            </Link>
            <p className="text-sm text-white/40 leading-relaxed max-w-[200px]">
              Performance marketing on TON
            </p>
            <div className="flex items-center gap-3 pt-1">
              <a href="https://t.me/Gramketing" target="_blank" rel="noopener noreferrer"
                aria-label="Telegram"
                className="text-white/40 transition-colors hover:text-[#00d4ff]">
                <TelegramIcon className="w-5 h-5" />
              </a>
              <a href="https://x.com/Gramketing" target="_blank" rel="noopener noreferrer"
                aria-label="X (Twitter)"
                className="text-white/40 transition-colors hover:text-[#00d4ff]">
                <XIcon className="w-4 h-4" />
              </a>
            </div>
          </div>

          {/* Platform */}
          <div className="space-y-3">
            <p className="text-xs font-semibold uppercase tracking-widest text-white/30">Platform</p>
            {[
              { label: 'Pools',       href: '/pools' },
              { label: 'Create Pool', href: '/create-pool' },
              { label: 'Dashboard',   href: '/dashboard' },
              { label: 'Leaderboard', href: '/pools' },
            ].map(l => (
              <Link key={l.label} href={l.href}
                className="block text-sm text-white/50 transition-colors hover:text-[#00d4ff]">
                {l.label}
              </Link>
            ))}
          </div>

          {/* Resources */}
          <div className="space-y-3">
            <p className="text-xs font-semibold uppercase tracking-widest text-white/30">Resources</p>
            {[
              { label: 'Docs',       href: '/docs' },
              { label: 'Roadmap',    href: '/roadmap' },
              { label: 'Whitepaper', href: '/whitepaper' },
              { label: 'API',        href: '/docs#api' },
              { label: 'Support',    href: 'https://t.me/Gramketing' },
            ].map(l => (
              <Link key={l.label} href={l.href}
                className="block text-sm text-white/50 transition-colors hover:text-[#00d4ff]">
                {l.label}
              </Link>
            ))}
          </div>

          {/* Legal */}
          <div className="space-y-3">
            <p className="text-xs font-semibold uppercase tracking-widest text-white/30">Legal</p>
            {[
              { label: 'Privacy Policy',   href: '/privacy' },
              { label: 'Terms of Service', href: '/terms' },
            ].map(l => (
              <Link key={l.label} href={l.href}
                className="block text-sm text-white/50 transition-colors hover:text-[#00d4ff]">
                {l.label}
              </Link>
            ))}
            <div className="mt-4 inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs text-white/40"
              style={{ border: '1px solid rgba(255,255,255,0.10)', background: 'rgba(255,255,255,0.04)' }}>
              Built on TON Blockchain
            </div>
          </div>

        </div>
      </div>

      {/* Bottom bar */}
      <div style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
        <div className="max-w-7xl mx-auto px-6 py-4 text-center">
          <p className="text-xs text-white/25">© 2025 Gramketing. All rights reserved.</p>
        </div>
      </div>
    </footer>
  );
}
