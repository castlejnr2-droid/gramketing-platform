'use client';
import { useEffect, useRef } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LayoutGrid, BarChart2, Trophy, Settings } from 'lucide-react';

declare global {
  interface Window {
    Telegram?: {
      WebApp?: {
        ready: () => void;
        expand: () => void;
        initData: string;
        initDataUnsafe?: {
          user?: { id: number; first_name?: string; username?: string };
        };
        themeParams?: Record<string, string>;
      };
    };
  }
}

const TABS = [
  { href: '/miniapp',             label: 'Pools',     Icon: LayoutGrid },
  { href: '/miniapp/dashboard',   label: 'Dashboard', Icon: BarChart2  },
  { href: '/miniapp/leaderboard', label: 'Leaders',   Icon: Trophy     },
  { href: '/miniapp/settings',    label: 'Settings',  Icon: Settings   },
];

export function MiniAppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const sessionAttempted = useRef(false);

  useEffect(() => {
    const tg = window.Telegram?.WebApp;
    if (!tg) return;

    tg.ready();
    tg.expand();

    // Only attempt the Telegram auto-link once per mount.
    // The session-ready event is dispatched by Providers.tsx (TonConnect auth)
    // as well, so this only handles the Telegram-linked-account fast path.
    if (!tg.initData || sessionAttempted.current) return;
    sessionAttempted.current = true;

    fetch('/api/auth/telegram-miniapp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ initData: tg.initData }),
    })
      .then((r) => r.json())
      .then((data: { linked: boolean; walletAddress?: string }) => {
        if (data.linked && data.walletAddress) {
          // JWT cookie was set by the server.  Notify pages so they can
          // fetch authenticated data without waiting for TonConnect.
          window.dispatchEvent(
            new CustomEvent('gramketing:session-ready', {
              detail: { walletAddress: data.walletAddress },
            })
          );
        }
        // If not linked: the user must connect via TonConnect.
        // Providers.tsx will dispatch gramketing:session-ready after the
        // ton_proof is verified, so pages will receive the event either way.
      })
      .catch(() => {});
  }, []);

  return (
    <div className="flex flex-col min-h-screen" style={{ position: 'relative', zIndex: 1 }}>
      <div className="flex-1 pb-16">{children}</div>

      {/* Bottom tab bar */}
      <nav className="fixed bottom-0 left-0 right-0 z-50 bg-[#0A0F1E]/95 backdrop-blur-[24px] border-t border-white/10 safe-area-inset-bottom">
        <div className="flex">
          {TABS.map(({ href, label, Icon }) => {
            const active =
              href === '/miniapp'
                ? pathname === '/miniapp'
                : pathname.startsWith(href);
            return (
              <Link
                key={href}
                href={href}
                className={`flex-1 flex flex-col items-center gap-1 py-3 text-[10px] font-medium transition-colors ${
                  active ? 'text-[#0088CC]' : 'text-white/40 hover:text-white/70'
                }`}
              >
                <Icon className="w-5 h-5" />
                {label}
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
