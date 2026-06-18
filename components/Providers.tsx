'use client';
import { TonConnectUIProvider, useTonConnectUI } from '@tonconnect/ui-react';
import { useEffect, useRef } from 'react';

/**
 * Fetches a single-use nonce and registers it as the ton_proof payload.
 *
 * CRITICAL: sets state:'loading' BEFORE the fetch so TonConnect blocks the
 * Connect modal until the challenge is ready.  Without this, if the user
 * clicks "Connect Wallet" before the async fetch resolves the modal opens
 * without requesting ton_proof, the wallet connects without a proof, and
 * the auth flow silently fails (race-condition fix).
 */
async function refreshChallenge(tonConnectUI: ReturnType<typeof useTonConnectUI>[0]) {
  // Block the connect modal while we fetch the challenge nonce.
  tonConnectUI.setConnectRequestParameters({ state: 'loading' });
  try {
    const res = await fetch('/api/auth/challenge');
    if (!res.ok) throw new Error(`challenge fetch ${res.status}`);
    const { payload } = await res.json();
    tonConnectUI.setConnectRequestParameters({
      state: 'ready',
      value: { tonProof: payload },
    });
    return payload as string;
  } catch (err) {
    console.warn('[AuthListener] challenge fetch failed:', err);
    // Allow connect without proof so the user is never stuck on a spinner.
    // The status-change handler will reject proof-less connections gracefully.
    tonConnectUI.setConnectRequestParameters(null);
    return null;
  }
}

function AuthListener() {
  const [tonConnectUI] = useTonConnectUI();
  // Refs survive re-renders and don't need to be in the dependency array.
  const seenConnectedRef  = useRef(false);
  const authInFlightRef   = useRef(false); // prevents duplicate verify calls

  useEffect(() => {
    // Immediately fetch a challenge so the modal is ready as fast as possible.
    refreshChallenge(tonConnectUI);

    const unsubscribe = tonConnectUI.onStatusChange(async (wallet) => {

      // ── Wallet disconnected ────────────────────────────────────────────────
      if (!wallet) {
        if (!seenConnectedRef.current) {
          // TonConnect is still restoring from localStorage on page load —
          // this is NOT a real disconnect, ignore it.
          return;
        }
        // Genuine disconnect: clear server session and ready a fresh challenge.
        seenConnectedRef.current = false;
        authInFlightRef.current  = false;
        await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' }).catch(() => {});
        refreshChallenge(tonConnectUI);
        return;
      }

      // ── Wallet connected ──────────────────────────────────────────────────
      seenConnectedRef.current = true;

      // De-duplicate: if a verify call is already in-flight (e.g. duplicate
      // onStatusChange events from the SDK), skip this one.
      if (authInFlightRef.current) return;

      const tonProof = wallet.connectItems?.tonProof;

      // ── Case A: wallet returned an explicit ton_proof ERROR ────────────────
      // TonProofItemReplyError has `name === 'ton_proof'` but no `proof` field.
      // This happens when the wallet was asked for a proof but refused / failed
      // (e.g. the user dismissed the signing prompt, or the wallet doesn't
      // support ton_proof).  Keep the wallet connected; refresh the challenge
      // so the next manual connect attempt has a valid nonce.
      if (tonProof && tonProof.name === 'ton_proof' && !('proof' in tonProof)) {
        console.warn('[AuthListener] wallet returned ton_proof error:', tonProof);
        refreshChallenge(tonConnectUI);
        return;
      }

      // ── Case B: fresh connect with a valid ton_proof ───────────────────────
      if (tonProof && tonProof.name === 'ton_proof' && 'proof' in tonProof) {
        authInFlightRef.current = true;
        const proofData = tonProof.proof;

        // Forward the Telegram user ID so the server can link accounts
        // automatically when connecting from inside the Mini App.
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

          if (res.ok) {
            // Auth succeeded — notify Mini App pages so they can fetch
            // authenticated data without waiting for a page navigation.
            window.dispatchEvent(
              new CustomEvent('gramketing:session-ready', {
                detail: { walletAddress: wallet.account.address },
              })
            );
            // Pre-load a fresh challenge so future reconnects in this session
            // don't hit the race-condition again.
            refreshChallenge(tonConnectUI);
          } else {
            const body = await res.json().catch(() => ({}));
            console.warn('[AuthListener] proof rejected by server:', res.status, body);
            // Disconnect so the user can retry; the onStatusChange(null) handler
            // will call refreshChallenge with a fresh nonce for the retry.
            await tonConnectUI.disconnect();
            // Do NOT also call refreshChallenge here — the null handler does it,
            // and double-calling creates extra DB rows.
          }
        } catch {
          // Network error — leave wallet connected.  The session cookie might
          // still be valid (e.g. a duplicate submission after a reload).
          console.warn('[AuthListener] network error during verify, keeping wallet connected');
        } finally {
          authInFlightRef.current = false;
        }
        return;
      }

      // ── Case C: restored session — no fresh proof available ───────────────
      // Happens when the page reloads while a connection is in progress
      // (Telegram built-in wallet popup triggers a WebView reload on some
      // devices).  TonConnect restores the wallet from localStorage WITHOUT
      // the proof — the proof may still be coming via the TonConnect bridge.
      //
      // Strategy:
      //   1. Check the httpOnly cookie.  If valid → already authenticated.
      //   2. If not → call refreshChallenge NOW so a backup challenge is ready
      //      in the DB.  This does NOT cancel the original challenge — the bridge
      //      will deliver the original proof, the server will find it by payload
      //      hash, and auth will complete via a fresh onStatusChange(wallet+proof).
      //   3. Do NOT disconnect — that kills the bridge connection and the proof
      //      is never delivered, creating the infinite loop.
      try {
        const check = await fetch('/api/dashboard', { credentials: 'include' });
        if (check.ok) {
          // Cookie already valid (e.g. user is returning to an authenticated session).
          window.dispatchEvent(
            new CustomEvent('gramketing:session-ready', {
              detail: { walletAddress: wallet.account.address },
            })
          );
          return;
        }
        // Cookie missing/expired.  Pre-warm the next challenge while we wait
        // for the bridge to deliver the proof.
        console.warn('[AuthListener] no valid cookie on restored session — refreshing challenge, waiting for bridge proof...');
        refreshChallenge(tonConnectUI);
      } catch {
        // Network error — leave as-is and hope the bridge delivers the proof.
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
