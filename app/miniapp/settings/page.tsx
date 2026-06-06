'use client';
import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useTonWallet, useTonConnectUI } from '@tonconnect/ui-react';
import Link from 'next/link';
import { CheckCircle, Settings, Wallet, BookOpen, Map, ChevronRight, FileText } from 'lucide-react';

interface AccountInfo {
  walletAddress: string;
  username?: string;
  xHandle?: string;
  xAccountId?: string | null;
  xProfileImageUrl?: string | null;
  xUnlinkedAt?: string | null;
  telegramChannelUrl?: string;
  telegramChatId?: string;
  telegramUnlinkedAt?: string | null;
}

export default function MiniAppSettingsPage() {
  const wallet = useTonWallet();
  const [tonConnectUI] = useTonConnectUI();
  const searchParams = useSearchParams();
  const [account, setAccount] = useState<AccountInfo | null>(null);
  const [usernameInput, setUsernameInput] = useState('');
  const [tgChannelInput, setTgChannelInput] = useState('');
  const [savingUsername, setSavingUsername] = useState(false);
  const [savingTgChannel, setSavingTgChannel] = useState(false);
  const [usernameError, setUsernameError] = useState<string | null>(null);
  const [tgChannelError, setTgChannelError] = useState<string | null>(null);
  const [linkCode, setLinkCode] = useState<string | null>(null);
  const [linkCodeExpiry, setLinkCodeExpiry] = useState<Date | null>(null);
  const [linkCodeLoading, setLinkCodeLoading] = useState(false);
  const [linkCodeError, setLinkCodeError] = useState<string | null>(null);
  const [unlinkingTg, setUnlinkingTg] = useState(false);
  const [unlinkTgError, setUnlinkTgError] = useState<string | null>(null);
  const [unlinkingX, setUnlinkingX] = useState(false);
  const [unlinkXError, setUnlinkXError] = useState<string | null>(null);
  const [xBanner, setXBanner] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  useEffect(() => {
    if (!wallet) return;
    fetch('/api/dashboard', { credentials: 'include' })
      .then((r) => r.json())
      .then((d) => {
        setAccount(d.account ?? null);
        if (d.account?.username) setUsernameInput(d.account.username);
        if (d.account?.telegramChannelUrl) setTgChannelInput(d.account.telegramChannelUrl);
      })
      .catch(() => {});
  }, [wallet]);

  // Handle OAuth return: ?x=linked or ?x=error
  useEffect(() => {
    const xParam = searchParams.get('x');
    if (!xParam) return;
    if (xParam === 'linked') {
      setXBanner({ type: 'success', message: 'X account connected successfully!' });
    } else if (xParam === 'error') {
      const reason = searchParams.get('reason') ?? 'unknown';
      const friendly =
        reason === 'access_denied' ? 'You cancelled the X authorisation.' :
        reason === 'session_expired' ? 'Session expired — please try again.' :
        reason === 'state_mismatch' ? 'Security check failed — please try again.' :
        reason === 'not_authenticated' ? 'You were signed out — please reconnect your wallet.' :
        reason === 'token_exchange_failed' ? 'Twitter rejected the request — please try again.' :
        reason.length > 60 ? reason.slice(0, 60) + '…' : reason;
      setXBanner({ type: 'error', message: friendly });
    }
    // Clean the query params without a page reload
    window.history.replaceState({}, '', '/miniapp/settings');
  }, [searchParams]);

  const saveUsername = async () => {
    setUsernameError(null);
    setSavingUsername(true);
    try {
      const res = await fetch('/api/auth/update-profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ username: usernameInput }),
      });
      if (!res.ok) { const d = await res.json(); setUsernameError(d.error ?? 'Failed'); }
      else setAccount((prev) => prev ? { ...prev, username: usernameInput.trim() || undefined } : prev);
    } catch { setUsernameError('Network error'); }
    finally { setSavingUsername(false); }
  };

  const saveTgChannel = async () => {
    setTgChannelError(null);
    setSavingTgChannel(true);
    try {
      const res = await fetch('/api/auth/link-telegram', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ channelUrl: tgChannelInput }),
      });
      if (!res.ok) { const d = await res.json(); setTgChannelError(d.error ?? 'Failed'); }
      else setAccount((prev) => prev ? { ...prev, telegramChannelUrl: tgChannelInput.trim() } : prev);
    } catch { setTgChannelError('Network error'); }
    finally { setSavingTgChannel(false); }
  };

  const generateLinkCode = async () => {
    setLinkCodeError(null);
    setLinkCodeLoading(true);
    try {
      const res = await fetch('/api/auth/link-telegram-init', { method: 'POST', credentials: 'include' });
      if (res.ok) {
        const d = await res.json();
        setLinkCode(d.code);
        setLinkCodeExpiry(new Date(d.expiresAt));
      } else {
        const d = await res.json();
        setLinkCodeError(d.error ?? 'Failed to generate code');
      }
    } catch { setLinkCodeError('Network error'); }
    finally { setLinkCodeLoading(false); }
  };

  const unlinkX = async () => {
    setUnlinkXError(null);
    setUnlinkingX(true);
    try {
      const res = await fetch('/api/auth/unlink-x', { method: 'POST', credentials: 'include' });
      const d = await res.json();
      if (!res.ok) {
        setUnlinkXError(d.error ?? 'Failed to unlink');
      } else {
        setAccount((prev) => prev ? { ...prev, xAccountId: null, xHandle: undefined, xUnlinkedAt: new Date().toISOString() } : prev);
      }
    } catch { setUnlinkXError('Network error'); }
    finally { setUnlinkingX(false); }
  };

  const unlinkTelegram = async () => {
    setUnlinkTgError(null);
    setUnlinkingTg(true);
    try {
      const res = await fetch('/api/auth/unlink-telegram', { method: 'POST', credentials: 'include' });
      const d = await res.json();
      if (!res.ok) {
        setUnlinkTgError(d.error ?? 'Failed to unlink');
      } else {
        setAccount((prev) => prev ? { ...prev, telegramChatId: undefined, telegramUnlinkedAt: new Date().toISOString() } : prev);
        setLinkCode(null);
      }
    } catch { setUnlinkTgError('Network error'); }
    finally { setUnlinkingTg(false); }
  };

  if (!wallet) {
    return (
      <div className="pt-12 px-4 flex flex-col items-center justify-center min-h-[60vh] text-center">
        <Settings className="w-12 h-12 text-white/20 mb-4" />
        <h2 className="text-xl font-bold text-white mb-2">Connect Wallet</h2>
        <p className="text-white/50 text-sm mb-6">Connect your TON wallet to manage settings.</p>
        <button onClick={() => tonConnectUI.openModal()} className="btn-primary flex items-center gap-2">
          <Wallet className="w-4 h-4" /> Connect Wallet
        </button>
      </div>
    );
  }

  return (
    <div className="pt-5 pb-4 px-4">
      <h1 className="text-2xl font-bold text-white mb-6 flex items-center gap-2">
        <Settings className="w-6 h-6 text-[#0088CC]" /> Settings
      </h1>

      <div className="space-y-5">
        {/* Display Name */}
        <div className="glass-card p-5">
          <label className="block text-sm font-medium text-white/70 mb-3">Display Name</label>
          <div className="flex gap-2">
            <input
              type="text"
              value={usernameInput}
              onChange={(e) => { setUsernameInput(e.target.value); setUsernameError(null); }}
              placeholder="e.g. CryptoMarketer"
              maxLength={30}
              className="flex-1 bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white placeholder-white/25 focus:outline-none focus:border-[#0088CC]/50"
            />
            <button onClick={saveUsername} disabled={savingUsername}
              className="btn-primary text-sm px-4 flex items-center gap-1.5 disabled:opacity-40">
              {savingUsername
                ? <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                : <CheckCircle className="w-3.5 h-3.5" />}
              Save
            </button>
          </div>
          {usernameError && <p className="mt-1.5 text-xs text-red-400">{usernameError}</p>}
          {!usernameError && account?.username && (
            <p className="mt-1.5 text-xs text-green-400">✓ {account.username}</p>
          )}
        </div>

        {/* X (Twitter) Account */}
        <div className="glass-card p-5">
          <label className="block text-sm font-medium text-white/70 mb-3">X (Twitter) Account</label>

          {/* OAuth result banner */}
          {xBanner && (
            <div className={`mb-3 flex items-start gap-2 p-3 rounded-xl text-xs ${
              xBanner.type === 'success'
                ? 'bg-green-500/10 border border-green-500/20 text-green-400'
                : 'bg-red-500/10 border border-red-500/20 text-red-400'
            }`}>
              <span>{xBanner.type === 'success' ? '✓' : '✕'}</span>
              <span>{xBanner.message}</span>
              <button onClick={() => setXBanner(null)} className="ml-auto opacity-60 hover:opacity-100">✕</button>
            </div>
          )}

          {account?.xAccountId ? (
            <div>
              <div className="flex items-center justify-between gap-3 p-3 rounded-xl bg-green-500/5 border border-green-500/20">
                <div className="flex items-center gap-3">
                  {account.xProfileImageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={account.xProfileImageUrl}
                      alt={account.xHandle ?? 'X profile'}
                      className="w-8 h-8 rounded-full object-cover flex-shrink-0 ring-1 ring-green-500/30"
                    />
                  ) : (
                    <div className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center flex-shrink-0">
                      <svg className="w-4 h-4 text-green-400" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.744l7.73-8.835L1.254 2.25H8.08l4.253 5.622 5.91-5.622zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
                      </svg>
                    </div>
                  )}
                  <div>
                    <p className="text-sm font-medium text-green-400">Connected</p>
                    {account.xHandle && <p className="text-xs text-white/50">@{account.xHandle}</p>}
                  </div>
                </div>
                <button onClick={unlinkX} disabled={unlinkingX}
                  className="text-xs text-red-400 hover:text-red-300 transition-colors disabled:opacity-40">
                  {unlinkingX ? 'Disconnecting…' : 'Disconnect'}
                </button>
              </div>
              {unlinkXError && <p className="mt-1.5 text-xs text-red-400">{unlinkXError}</p>}
            </div>
          ) : (
            <div>
              {(() => {
                const COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000;
                const unlinkedAt = account?.xUnlinkedAt ? new Date(account.xUnlinkedAt) : null;
                const nextAllowed = unlinkedAt ? new Date(unlinkedAt.getTime() + COOLDOWN_MS) : null;
                if (nextAllowed && nextAllowed > new Date()) {
                  return (
                    <div className="flex items-start gap-3 p-3 rounded-xl bg-yellow-500/5 border border-yellow-500/20">
                      <span className="text-yellow-400 mt-0.5">⏳</span>
                      <div>
                        <p className="text-sm font-medium text-yellow-400">Cooldown active</p>
                        <p className="text-xs text-white/40 mt-0.5">
                          You can re-connect on{' '}
                          <span className="text-white/70">{nextAllowed.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}</span>.
                        </p>
                      </div>
                    </div>
                  );
                }
                return (
                  <div className="space-y-3">
                    <button
                      onClick={() => { window.location.href = '/api/auth/link-x'; }}
                      className="btn-primary text-sm flex items-center gap-2"
                    >
                      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.744l7.73-8.835L1.254 2.25H8.08l4.253 5.622 5.91-5.622zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
                      </svg>
                      Connect X Account
                    </button>
                    <p className="text-xs text-white/30">Required to submit X posts to pools.</p>
                  </div>
                );
              })()}
            </div>
          )}
        </div>

        {/* Telegram Account Linking */}
        <div className="glass-card p-5">
          <label className="block text-sm font-medium text-white/70 mb-3">Telegram Account</label>
          {account?.telegramChatId ? (
            <div>
              <div className="flex items-center justify-between gap-3 p-3 rounded-xl bg-green-500/5 border border-green-500/20">
                <div className="flex items-center gap-3">
                  <span className="text-green-400">✅</span>
                  <div>
                    <p className="text-sm font-medium text-green-400">Linked</p>
                    <p className="text-xs text-white/30">
                      ID: {account.telegramChatId.slice(0, 3)}••••{account.telegramChatId.slice(-2)}
                    </p>
                  </div>
                </div>
                <button onClick={unlinkTelegram} disabled={unlinkingTg}
                  className="text-xs text-red-400 hover:text-red-300 transition-colors disabled:opacity-40">
                  {unlinkingTg ? 'Unlinking…' : 'Unlink'}
                </button>
              </div>
              {unlinkTgError && <p className="mt-1.5 text-xs text-red-400">{unlinkTgError}</p>}
            </div>
          ) : !linkCode ? (
            <div>
              {(() => {
                const COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000;
                const unlinkedAt = account?.telegramUnlinkedAt ? new Date(account.telegramUnlinkedAt) : null;
                const nextAllowed = unlinkedAt ? new Date(unlinkedAt.getTime() + COOLDOWN_MS) : null;
                if (nextAllowed && nextAllowed > new Date()) {
                  return (
                    <div className="flex items-start gap-3 p-3 rounded-xl bg-yellow-500/5 border border-yellow-500/20 mb-3">
                      <span className="text-yellow-400 mt-0.5">⏳</span>
                      <div>
                        <p className="text-sm font-medium text-yellow-400">Cooldown active</p>
                        <p className="text-xs text-white/40 mt-0.5">
                          You can re-link on{' '}
                          <span className="text-white/70">{nextAllowed.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}</span>.
                        </p>
                      </div>
                    </div>
                  );
                }
                return null;
              })()}
              <button onClick={generateLinkCode} disabled={linkCodeLoading || (() => {
                const COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000;
                const unlinkedAt = account?.telegramUnlinkedAt ? new Date(account.telegramUnlinkedAt) : null;
                const nextAllowed = unlinkedAt ? new Date(unlinkedAt.getTime() + COOLDOWN_MS) : null;
                return !!(nextAllowed && nextAllowed > new Date());
              })()}
                className="btn-primary text-sm flex items-center gap-2 disabled:opacity-40">
                {linkCodeLoading
                  ? <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  : <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor"><path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm5.894 8.221-1.97 9.28c-.145.658-.537.818-1.084.508l-3-2.21-1.447 1.394c-.16.16-.295.295-.605.295l.213-3.053 5.56-5.023c.242-.213-.054-.333-.373-.12L7.19 13.676l-2.96-.924c-.643-.204-.657-.643.136-.953l11.57-4.461c.537-.194 1.006.131.958.883z" /></svg>}
                Link Telegram Account
              </button>
              {linkCodeError && <p className="mt-1.5 text-xs text-red-400">{linkCodeError}</p>}
              <p className="mt-2 text-xs text-white/30">Get notified about rankings, pools, and rewards.</p>
            </div>
          ) : (
            <div className="p-4 rounded-xl bg-[#0088CC]/5 border border-[#0088CC]/20 space-y-3">
              <p className="text-xs font-semibold text-[#0088CC] uppercase tracking-wider">Link your account</p>
              <p className="text-xs text-white/60">
                Open <span className="text-white font-semibold">@GramketingBot</span> and send:
              </p>
              <div className="flex items-center gap-3">
                <span className="font-mono text-lg font-bold tracking-widest text-white bg-white/5 border border-white/10 rounded-lg px-4 py-2">
                  {linkCode}
                </span>
                <button onClick={() => navigator.clipboard.writeText(linkCode)}
                  className="text-xs text-[#0088CC]">Copy</button>
              </div>
              <p className="text-xs text-white/30">
                Expires {linkCodeExpiry?.toLocaleTimeString()}.{' '}
                <button onClick={generateLinkCode} className="text-[#0088CC] hover:underline">Regenerate</button>
              </p>
            </div>
          )}
        </div>

        {/* Telegram Channel */}
        <div className="glass-card p-5">
          <label className="block text-sm font-medium text-white/70 mb-1">Telegram Channel</label>
          <p className="text-xs text-white/40 mb-3">Must be public. Used to verify post submissions.</p>
          <div className="flex gap-2">
            <input
              type="url"
              value={tgChannelInput}
              onChange={(e) => { setTgChannelInput(e.target.value); setTgChannelError(null); }}
              placeholder="https://t.me/yourchannel"
              className="flex-1 bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white placeholder-white/25 focus:outline-none focus:border-[#0088CC]/50"
            />
            <button onClick={saveTgChannel} disabled={savingTgChannel}
              className="btn-primary text-sm px-4 flex items-center gap-1.5 disabled:opacity-40">
              {savingTgChannel
                ? <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                : <CheckCircle className="w-3.5 h-3.5" />}
              Save
            </button>
          </div>
          {tgChannelError && <p className="mt-1.5 text-xs text-red-400">{tgChannelError}</p>}
          {!tgChannelError && account?.telegramChannelUrl && (
            <p className="mt-1.5 text-xs text-green-400">✓ {account.telegramChannelUrl}</p>
          )}
        </div>

        {/* Wallet */}
        <div className="glass-card p-5">
          <label className="block text-sm font-medium text-white/70 mb-3">Wallet</label>
          <p className="text-xs text-white/50 font-mono break-all mb-3">{wallet.account.address}</p>
          <button onClick={() => tonConnectUI.disconnect()}
            className="text-sm text-red-400 hover:text-red-300 transition-colors">
            Disconnect wallet
          </button>
        </div>

        {/* Resources */}
        <div className="glass-card p-5">
          <label className="block text-sm font-medium text-white/70 mb-3">Resources</label>
          <div className="space-y-2">
            <Link href="/miniapp/docs"
              className="flex items-center justify-between gap-3 py-2 hover:text-white transition-colors text-white/60">
              <div className="flex items-center gap-2">
                <BookOpen className="w-4 h-4 text-[#0088CC]" />
                <span className="text-sm">Documentation</span>
              </div>
              <ChevronRight className="w-4 h-4 text-white/30" />
            </Link>
            <Link href="/miniapp/roadmap"
              className="flex items-center justify-between gap-3 py-2 hover:text-white transition-colors text-white/60">
              <div className="flex items-center gap-2">
                <Map className="w-4 h-4 text-[#0088CC]" />
                <span className="text-sm">Roadmap</span>
              </div>
              <ChevronRight className="w-4 h-4 text-white/30" />
            </Link>
            <Link href="/miniapp/whitepaper"
              className="flex items-center justify-between gap-3 py-2 hover:text-white transition-colors text-white/60">
              <div className="flex items-center gap-2">
                <FileText className="w-4 h-4 text-[#0088CC]" />
                <span className="text-sm">Whitepaper</span>
              </div>
              <ChevronRight className="w-4 h-4 text-white/30" />
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
