import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import { Providers } from '@/components/Providers';
import { Navbar } from '@/components/Navbar';
import { Footer } from '@/components/Footer';
import { HeroBackground } from '@/components/HeroBackground';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'GRAMKETING - Web3 Performance Marketing on TON',
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
        className={`${inter.className} bg-[#050810] text-white`}
      >
        <HeroBackground />
        <Providers>
          <Navbar />
          <main style={{ position: 'relative', zIndex: 1 }}>{children}</main>
          <Footer />
        </Providers>
      </body>
    </html>
  );
}
