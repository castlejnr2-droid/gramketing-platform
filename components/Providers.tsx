'use client';
import { TonConnectUIProvider, useTonConnectUI } from '@tonconnect/ui-react';
import { useEffect } from 'react';

function AuthListener() {
  const [tonConnectUI] = useTonConnectUI();

  useEffect(() => {
    const unsubscribe = tonConnectUI.onStatusChange(async (wallet) => {
      if (!wallet) {
        // Wallet disconnected — clear the auth cookie
        await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' }).catch(() => {});
        return;
      }

      // Wallet connected — authenticate with the server
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
        // ignore — user can retry by reconnecting
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
