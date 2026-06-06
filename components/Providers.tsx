'use client';
import { TonConnectUIProvider, useTonConnectUI } from '@tonconnect/ui-react';
import { useEffect } from 'react';

function AuthListener() {
  const [tonConnectUI] = useTonConnectUI();

  useEffect(() => {
    // TonConnect fires onStatusChange once immediately on subscribe with the
    // current state. On a fresh page load the bridge reconnection is async, so
    // the first callback is often null even when a session exists in localStorage.
    // Guard: only call logout if we have already seen the wallet connected in
    // this session (i.e. this is a real disconnect, not a mid-restore null).
    let seenConnected = false;

    const unsubscribe = tonConnectUI.onStatusChange(async (wallet) => {
      if (!wallet) {
        if (!seenConnected) {
          // TonConnect is still restoring - don't logout yet.
          return;
        }
        // Genuine disconnect (user disconnected or bridge dropped after connection)
        await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' }).catch(() => {});
        return;
      }

      seenConnected = true;

      // Wallet connected - authenticate with the server
      const walletAddress = wallet.account.address;
      const message = `gramketing-auth:${walletAddress}:${Date.now()}`;

      // In the Telegram Mini App, read the Telegram user ID so we can link
      // the TON wallet address to their Telegram account in the DB.
      const telegramUserId =
        typeof window !== 'undefined'
          ? window.Telegram?.WebApp?.initDataUnsafe?.user?.id
          : undefined;

      try {
        await fetch('/api/auth/verify', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({
            walletAddress,
            signature: walletAddress, // stub until TonProof is implemented
            message,
            ...(telegramUserId ? { telegramUserId: String(telegramUserId) } : {}),
          }),
        });
      } catch {
        // ignore - user can retry by reconnecting
      }
    });

    return () => unsubscribe();
  }, [tonConnectUI]);

  return null;
}

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <TonConnectUIProvider manifestUrl="https://gramketing-platform.vercel.app/tonconnect-manifest.json">
      <AuthListener />
      {children}
    </TonConnectUIProvider>
  );
}
