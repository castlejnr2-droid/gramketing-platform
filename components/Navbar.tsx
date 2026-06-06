'use client';
import Link from 'next/link';
import { useState, useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';
import { TonConnectButton, useTonConnectUI, useTonWallet } from '@tonconnect/ui-react';
import { Menu, X, Wallet, Copy, LogOut, ChevronDown } from 'lucide-react';

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

const navLinks = [
  { href: '/pools', label: 'Pools' },
  { href: '/create-pool', label: 'Create Pool' },
  { href: '/dashboard', label: 'Dashboard' },
  { href: '/docs', label: 'Docs' },
  { href: '/roadmap', label: 'Roadmap' },
  { href: '/whitepaper', label: 'Whitepaper' },
];

export function Navbar() {
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [walletDropdown, setWalletDropdown] = useState(false);
  const [copied, setCopied] = useState(false);
  const pathname = usePathname();
  const [tonConnectUI] = useTonConnectUI();
  const wallet = useTonWallet();
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 10);
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setWalletDropdown(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleCopyAddress = () => {
    if (!wallet) return;
    navigator.clipboard.writeText(wallet.account.address);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <nav
      className={`glass-nav fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
        scrolled ? 'shadow-lg shadow-black/30' : ''
      }`}
    >
      <div style={{ padding: '1.2rem 2rem 1.2rem 1.5rem' }}>
        <div className="flex items-center justify-between">
          {/* Brand */}
          <Link href="/" className="flex items-center">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/gramketing-logo.png"
              alt="Gramketing"
              style={{ height: '48px', width: 'auto', display: 'block' }}
            />
          </Link>

          {/* Desktop Nav Links */}
          <div className="hidden md:flex items-center gap-1">
            {navLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 ${
                  pathname === link.href
                    ? 'text-[#0088CC] bg-[#0088CC]/10'
                    : 'text-white/70 hover:text-white hover:bg-white/5'
                }`}
              >
                {link.label}
              </Link>
            ))}
          </div>

          {/* Desktop Right */}
          <div className="hidden md:flex items-center gap-3">
            <a
              href="https://t.me/Gramketing"
              target="_blank"
              rel="noopener noreferrer"
              className="text-white/50 hover:text-[#0088CC] transition-colors"
              aria-label="Telegram"
            >
              <TelegramIcon className="w-5 h-5" />
            </a>
            <a
              href="https://x.com/Gramketing"
              target="_blank"
              rel="noopener noreferrer"
              className="text-white/50 hover:text-white transition-colors"
              aria-label="X (Twitter)"
            >
              <XIcon className="w-4 h-4" />
            </a>
            <div className="ml-2 relative" ref={dropdownRef}>
              {wallet ? (
                <>
                  <button
                    onClick={() => setWalletDropdown((v) => !v)}
                    className="flex items-center gap-2 px-3.5 py-2 rounded-xl text-sm font-medium bg-[#0088CC]/10 border border-[#0088CC]/30 text-[#0088CC] hover:bg-[#0088CC]/20 transition-all"
                  >
                    <Wallet className="w-3.5 h-3.5" />
                    {wallet.account.address.slice(0, 6)}...{wallet.account.address.slice(-4)}
                    <ChevronDown className={`w-3 h-3 transition-transform ${walletDropdown ? 'rotate-180' : ''}`} />
                  </button>
                  {walletDropdown && (
                    <div className="absolute right-0 top-full mt-2 w-44 rounded-xl border border-white/10 bg-[#0A0F1E]/95 backdrop-blur-[24px] shadow-xl overflow-hidden z-50">
                      <button
                        onClick={handleCopyAddress}
                        className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-white/70 hover:text-white hover:bg-white/5 transition-colors"
                      >
                        <Copy className="w-3.5 h-3.5" />
                        {copied ? 'Copied!' : 'Copy Address'}
                      </button>
                      <button
                        onClick={() => { tonConnectUI.disconnect(); setWalletDropdown(false); }}
                        className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-red-400 hover:text-red-300 hover:bg-red-500/5 transition-colors border-t border-white/5"
                      >
                        <LogOut className="w-3.5 h-3.5" />
                        Disconnect
                      </button>
                    </div>
                  )}
                </>
              ) : (
                <button
                  onClick={() => tonConnectUI.openModal()}
                  className="flex items-center gap-2 px-3.5 py-2 rounded-xl text-sm font-semibold bg-[#0088CC] hover:bg-[#0099DD] text-white transition-all"
                >
                  <Wallet className="w-3.5 h-3.5" />
                  Connect Wallet
                </button>
              )}
            </div>
          </div>

          {/* Mobile hamburger */}
          <button
            className="md:hidden p-2 text-white/70 hover:text-white"
            onClick={() => setMenuOpen(!menuOpen)}
            aria-label="Toggle menu"
          >
            {menuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>
      </div>

      {/* Mobile menu */}
      {menuOpen && (
        <div className="md:hidden border-t border-white/10 bg-[#0A0F1E]/95 backdrop-blur-[24px]">
          <div className="px-4 py-4 space-y-1">
            {navLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                onClick={() => setMenuOpen(false)}
                className={`block px-4 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 ${
                  pathname === link.href
                    ? 'text-[#0088CC] bg-[#0088CC]/10'
                    : 'text-white/70 hover:text-white hover:bg-white/5'
                }`}
              >
                {link.label}
              </Link>
            ))}
            <div className="pt-3 pb-1 flex items-center gap-4 px-4">
              <a
                href="https://t.me/Gramketing"
                target="_blank"
                rel="noopener noreferrer"
                className="text-white/50 hover:text-[#0088CC] transition-colors"
              >
                <TelegramIcon className="w-5 h-5" />
              </a>
              <a
                href="https://x.com/Gramketing"
                target="_blank"
                rel="noopener noreferrer"
                className="text-white/50 hover:text-white transition-colors"
              >
                <XIcon className="w-4 h-4" />
              </a>
            </div>
            <div className="px-4 pt-2 pb-2 space-y-2">
              {wallet ? (
                <>
                  <div className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium bg-[#0088CC]/10 border border-[#0088CC]/30 text-[#0088CC]">
                    <Wallet className="w-4 h-4 flex-shrink-0" />
                    <span className="truncate">{wallet.account.address.slice(0, 6)}...{wallet.account.address.slice(-4)}</span>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={handleCopyAddress}
                      className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium border border-white/10 text-white/60 hover:text-white hover:border-white/20 transition-all"
                    >
                      <Copy className="w-3.5 h-3.5" />
                      {copied ? 'Copied!' : 'Copy'}
                    </button>
                    <button
                      onClick={() => { tonConnectUI.disconnect(); setMenuOpen(false); }}
                      className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium border border-red-500/30 text-red-400 hover:bg-red-500/10 transition-all"
                    >
                      <LogOut className="w-3.5 h-3.5" />
                      Disconnect
                    </button>
                  </div>
                </>
              ) : (
                <button
                  onClick={() => tonConnectUI.openModal()}
                  className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold bg-[#0088CC] hover:bg-[#0099DD] text-white transition-all"
                >
                  <Wallet className="w-4 h-4" />
                  Connect Wallet
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </nav>
  );
}
