import type { Metadata } from 'next';
import Script from 'next/script';
import { MiniAppShell } from '@/components/MiniAppShell';

export const metadata: Metadata = {
  title: 'GRAMKETING',
  description: 'Web3 Performance Marketing on TON',
};

export default function MiniAppLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      {/* Suppress the main site's navbar and footer - keep background canvas */}
      <style>{`
        .glass-nav { display: none !important; }
        footer     { display: none !important; }
      `}</style>

      {/* Telegram Mini App SDK - load before any page script */}
      <Script
        src="https://telegram.org/js/telegram-web-app.js"
        strategy="beforeInteractive"
      />

      <MiniAppShell>{children}</MiniAppShell>
    </>
  );
}
