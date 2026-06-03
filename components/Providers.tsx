'use client';
import { TonConnectUIProvider } from '@tonconnect/ui-react';

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <TonConnectUIProvider manifestUrl="https://gramketing-platform.vercel.app/tonconnect-manifest.json">
      {children}
    </TonConnectUIProvider>
  );
}
