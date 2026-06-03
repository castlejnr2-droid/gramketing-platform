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

      try {
        await fetch('/api/auth/verify', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({
            walletAddress,
            signature: walletAddress, // stub until TonProof is implemented
            message,
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
