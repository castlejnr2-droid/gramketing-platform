'use client';
import { useEffect, useState } from 'react';
import { useTonWallet, useTonConnectUI } from '@tonconnect/ui-react';
import { CheckCircle, Settings, Wallet } from 'lucide-react';

interface AccountInfo {
  walletAddress: string;
  username?: string;
  xHandle?: string;
  telegramChannelUrl?: string;
  telegramChatId?: string;
}

export default function MiniAppSettingsPage() {
  const wallet = useTonWallet();
  const [tonConnectUI] = useTonConnectUI();
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
    setLinkCodeLoading(true);
    try {
      const res = await fetch('/api/auth/link-telegram-init', { method: 'POST', credentials: 'include' });
      if (res.ok) {
        const d = await res.json();
        setLinkCode(d.code);
        setLinkCodeExpiry(new Date(d.expiresAt));
      }
    } finally { setLinkCodeLoading(false); }
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

        {/* Telegram Account Linking */}
        <div className="glass-card p-5">
          <label className="block text-sm font-medium text-white/70 mb-3">Telegram Account</label>
          {account?.telegramChatId ? (
            <div className="flex items-center gap-3 p-3 rounded-xl bg-green-500/5 border border-green-500/20">
              <span className="text-green-400">✅</span>
              <div>
                <p className="text-sm font-medium text-green-400">Linked</p>
                <p className="text-xs text-white/30">
                  ID: {account.telegramChatId.slice(0, 3)}••••{account.telegramChatId.slice(-2)}
                </p>
              </div>
            </div>
          ) : !linkCode ? (
            <div>
              <button onClick={generateLinkCode} disabled={linkCodeLoading}
                className="btn-primary text-sm flex items-center gap-2 disabled:opacity-40">
                {linkCodeLoading
                  ? <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  : '✈️'}
                Link Telegram Account
              </button>
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
      </div>
    </div>
  );
}
