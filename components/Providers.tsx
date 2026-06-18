'use client';
import { TonConnectUIProvider, useTonConnectUI } from '@tonconnect/ui-react';
import { useEffect } from 'react';

/**
 * Fetches a single-use nonce from the server and registers it as the
 * ton_proof payload for the next TonConnect modal open.
 * Must be called before the user clicks "Connect Wallet".
 */
async function refreshChallenge(tonConnectUI: ReturnType<typeof useTonConnectUI>[0]) {
  try {
    const res = await fetch('/api/auth/challenge');
    if (!res.ok) throw new Error('challenge fetch failed');
    const { payload } = await res.json();
    tonConnectUI.setConnectRequestParameters({
      state: 'ready',
      value: { tonProof: payload },
    });
  } catch {
    // If challenge fetch fails, clear parameters so the modal still opens
    // but without a proof (the status-change handler will reject this).
    tonConnectUI.setConnectRequestParameters(null);
  }
}

function AuthListener() {
  const [tonConnectUI] = useTonConnectUI();

  useEffect(() => {
    // Fetch initial challenge so the modal is ready immediately on page load.
    refreshChallenge(tonConnectUI);

    // Guard against treating a mid-restore null as a genuine disconnect.
    let seenConnected = false;

    const unsubscribe = tonConnectUI.onStatusChange(async (wallet) => {
      if (!wallet) {
        if (!seenConnected) {
          // TonConnect is still restoring from localStorage — not a real disconnect.
          return;
        }
        // Genuine disconnect: clear server session and prepare a fresh challenge.
        await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' }).catch(() => {});
        refreshChallenge(tonConnectUI);
        return;
      }

      seenConnected = true;

      // ── Fresh connect: wallet must supply a ton_proof ────────────────────
      const tonProof = wallet.connectItems?.tonProof;
      // Narrow to TonProofItemReplySuccess (has 'proof' property, not 'error')
      if (tonProof && tonProof.name === 'ton_proof' && 'proof' in tonProof) {
        // Send the full proof to the server for cryptographic verification.
        const proofData = tonProof.proof;
        const telegramUserId =
          typeof window !== 'undefined'
            ? window.Telegram?.WebApp?.initDataUnsafe?.user?.id
            : undefined;

        try {
          const res = await fetch('/api/auth/verify', {
            method:      'POST',
            headers:     { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({
              account: {
                address:         wallet.account.address,
                chain:           wallet.account.chain,
                walletStateInit: wallet.account.walletStateInit,
                publicKey:       wallet.account.publicKey,
              },
              proof: {
                timestamp: proofData.timestamp,
                domain:    proofData.domain,
                payload:   proofData.payload,
                signature: proofData.signature,
              },
              ...(telegramUserId ? { telegramUserId: String(telegramUserId) } : {}),
            }),
          });

          if (!res.ok) {
            // Proof rejected by server — force disconnect so the user must reconnect.
            console.warn('[AuthListener] proof rejected by server, disconnecting');
            await tonConnectUI.disconnect();
            refreshChallenge(tonConnectUI);
          }
        } catch {
          // Network error — leave wallet connected; session cookie may still be valid.
        }
        return;
      }

      // ── Restored session (no fresh proof available) ──────────────────────
      // On mobile, the wallet deep-links back to the browser which may reload
      // the page. After reload, TonConnect restores the wallet from localStorage
      // and fires this callback WITHOUT a proof — the proof is still in transit
      // via the TonConnect bridge. If we disconnect here we kill the bridge
      // connection and the proof is never delivered, creating a login loop.
      //
      // Strategy: check the cookie. If valid → already logged in, nothing to do.
      // If invalid (no cookie or expired) → refresh the challenge so the NEXT
      // connect attempt has a valid nonce, but DO NOT disconnect. The proof will
      // arrive via bridge and trigger a fresh onStatusChange with the proof,
      // which will submit it and set the cookie. If the session is genuinely
      // expired (7-day JWT) the user can manually disconnect and reconnect.
      try {
        const check = await fetch('/api/dashboard', { credentials: 'include' });
        if (!check.ok) {
          console.warn('[AuthListener] no valid cookie on restored session — refreshing challenge, keeping wallet connected');
          refreshChallenge(tonConnectUI);
        }
        // else: cookie valid, already authenticated — nothing to do
      } catch {
        // Network error — leave as-is
      }
    });

    return () => unsubscribe();
  }, [tonConnectUI]);

  return null;
}

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <TonConnectUIProvider
      manifestUrl="https://www.gramketing.com/tonconnect-manifest.json"
      actionsConfiguration={{
        // 'back' tells mobile wallets to return via the OS back gesture rather
        // than redirecting to a URL, preventing a full page reload on return.
        returnStrategy: 'back',
      }}
    >
      <AuthListener />
      {children}
    </TonConnectUIProvider>
  );
}
