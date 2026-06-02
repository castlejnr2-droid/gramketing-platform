import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import { Providers } from '@/components/Providers';
import { Navbar } from '@/components/Navbar';
import { Footer } from '@/components/Footer';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'GRAMKETING — Web3 Performance Marketing on TON',
  description:
    'Compete to earn rewards by promoting TON projects on X and Telegram. Marketers earn based on performance, projects get real growth.',
  keywords: ['TON blockchain', 'marketing', 'crypto', 'Web3', 'GRAMKETING'],
  openGraph: {
    title: 'GRAMKETING',
    description: 'Web3 Performance Marketing on TON',
    url: 'https://gramketing.io',
    siteName: 'GRAMKETING',
    type: 'website',
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body
        className={`${inter.className} bg-[#0A0F1E] text-white min-h-screen`}
      >
        {/* Fixed gradient orbs — give backdrop-filter something to blur against */}
        <div aria-hidden="true" style={{ position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 0 }}>
          <div style={{ position: 'absolute', top: '-10%', left: '-10%', width: '55vw', height: '55vw', borderRadius: '50%', background: 'radial-gradient(circle, rgba(0,136,204,0.15) 0%, transparent 70%)', filter: 'blur(40px)' }} />
          <div style={{ position: 'absolute', bottom: '-10%', right: '-10%', width: '50vw', height: '50vw', borderRadius: '50%', background: 'radial-gradient(circle, rgba(100,50,200,0.10) 0%, transparent 70%)', filter: 'blur(40px)' }} />
          <div style={{ position: 'absolute', top: '40%', right: '15%', width: '35vw', height: '35vw', borderRadius: '50%', background: 'radial-gradient(circle, rgba(0,136,204,0.08) 0%, transparent 70%)', filter: 'blur(40px)' }} />
        </div>
        <Providers>
          <Navbar />
          <main style={{ position: 'relative', zIndex: 1 }}>{children}</main>
          <Footer />
        </Providers>
      </body>
    </html>
  );
}
