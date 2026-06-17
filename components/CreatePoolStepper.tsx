'use client';
import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import {
  ChevronRight,
  ChevronLeft,
  CheckCircle,
  Loader2,
  AlertCircle,
  ExternalLink,
  RefreshCw,
} from 'lucide-react';
import { useTonConnectUI, useTonWallet } from '@tonconnect/ui-react';

interface Prices {
  ton: number;
  mgram: number;
}

interface PriceData {
  prices: Prices;
}

interface FeeTxData {
  to: string;
  amount: string;      // nanoTON as string
  payload?: string;    // base64 BOC - only present for jetton (mGRAM) payments
  expectedFee: {
    usdAmount: number;
    tokenAmount: number;
  };
}

type FeeCurrency = 'TON' | 'MGRAM';
type CampaignType = 'both' | 'x' | 'telegram';

const DURATIONS = [
  { days: 7, label: '1 Week' },
  { days: 14, label: '2 Weeks' },
  { days: 21, label: '3 Weeks' },
  { days: 28, label: '4 Weeks' },
];

const USD_FEE_TABLE: Record<number, { mgram: number; ton: number }> = {
  7:  { mgram: 5,     ton: 62.5  },
  14: { mgram: 99.5,  ton: 124.5 },
  21: { mgram: 149.5, ton: 187   },
  28: { mgram: 199.5, ton: 249.5 },
};

const STEPS = [
  'Project Info',
  'Pool Config',
  'Payment',
  'Deposit Tokens',
  'Done',
];

export function CreatePoolStepper({ basePath = '' }: { basePath?: string }) {
  const router = useRouter();
  const wallet = useTonWallet();
  const [tonConnectUI] = useTonConnectUI();

  const [step, setStep] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Step 1
  const [projectName, setProjectName] = useState('');
  const [tokenSymbol, setTokenSymbol] = useState('');
  const [jettonMasterAddress, setJettonMasterAddress] = useState('');
  const [logoUrl, setLogoUrl] = useState('');
  const [description, setDescription] = useState('');
  const [xUrl, setXUrl] = useState('');
  const [telegramUrl, setTelegramUrl] = useState('');

  // Jetton metadata auto-fetch state
  const [jettonFetchStatus, setJettonFetchStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [jettonFetchError, setJettonFetchError] = useState<string | null>(null);

  // Step 2
  const [campaignType, setCampaignType] = useState<CampaignType>('both');
  const [xPostLink, setXPostLink] = useState('');
  const [telegramPostLink, setTelegramPostLink] = useState('');
  const [durationDays, setDurationDays] = useState(7);
  const [totalReward, setTotalReward] = useState('');
  const [rewardSlots, setRewardSlots] = useState(10);
  const [tier1Threshold, setTier1Threshold] = useState('');
  const [tier2Threshold, setTier2Threshold] = useState('');
  const [tier3Threshold, setTier3Threshold] = useState('');

  // Step 3 - payment
  const [feeCurrency, setFeeCurrency] = useState<FeeCurrency>('TON');
  const [priceData, setPriceData] = useState<PriceData | null>(null);
  const [feeTxData, setFeeTxData] = useState<FeeTxData | null>(null);
  const [feeTxLoading, setFeeTxLoading] = useState(false);
  const [feeTxError, setFeeTxError] = useState<string | null>(null);
  const [paymentTxHash, setPaymentTxHash] = useState('');

  // Step 4 - deposit
  const [createdPoolId, setCreatedPoolId] = useState('');
  const [contractAddress, setContractAddress] = useState('');
  const [depositDone, setDepositDone] = useState(false);
  const [depositTxData, setDepositTxData] = useState<{ to: string; amount: string; payload: string; decimals: number } | null>(null);
  const [depositTxLoading, setDepositTxLoading] = useState(false);
  const [depositTxError, setDepositTxError] = useState<string | null>(null);

  // Deposit polling state
  const [pollStatus, setPollStatus] = useState<'idle' | 'polling' | 'confirmed' | 'timeout'>('idle');
  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pollStartRef = useRef<number>(0);

  // Fetch live prices for fee table display
  useEffect(() => {
    if (step === 2) {
      fetch('/api/prices')
        .then((r) => r.json())
        .then(setPriceData)
        .catch(() => {});
    }
  }, [step]);

  // Pre-fetch authoritative fee transaction params whenever the payment step is
  // visible and the user changes duration or currency. This lets the Pay button
  // show the exact server-calculated amount immediately on click.
  useEffect(() => {
    if (step !== 2) return;
    let cancelled = false;
    setFeeTxData(null);
    setFeeTxError(null);
    setFeeTxLoading(true);

    fetch(`/api/fee-tx?durationDays=${durationDays}&currency=${feeCurrency}`, {
      credentials: 'include',
    })
      .then((r) => r.json())
      .then((d) => {
        if (cancelled) return;
        if (d.error) {
          setFeeTxError(d.error);
        } else {
          setFeeTxData(d as FeeTxData);
        }
      })
      .catch(() => {
        if (!cancelled) setFeeTxError('Could not load fee details. Please try again.');
      })
      .finally(() => {
        if (!cancelled) setFeeTxLoading(false);
      });

    return () => { cancelled = true; };
  }, [step, durationDays, feeCurrency]);

  // Pre-fetch deposit transaction params as soon as the pool is created.
  // Triggered by createdPoolId becoming non-empty so the Deposit button is
  // ready the moment it appears - no latency on click.
  useEffect(() => {
    if (!createdPoolId) return;
    let cancelled = false;
    setDepositTxData(null);
    setDepositTxError(null);
    setDepositTxLoading(true);

    fetch(`/api/deposit-tx?poolId=${createdPoolId}`, { credentials: 'include' })
      .then((r) => r.json())
      .then((d) => {
        if (cancelled) return;
        if (d.error) {
          setDepositTxError(d.error);
        } else {
          setDepositTxData(d);
        }
      })
      .catch(() => {
        if (!cancelled) setDepositTxError('Could not build deposit transaction. Please retry.');
      })
      .finally(() => {
        if (!cancelled) setDepositTxLoading(false);
      });

    return () => { cancelled = true; };
  }, [createdPoolId]);

  const validate1 = () => {
    if (!projectName.trim()) return 'Project name is required';
    if (!tokenSymbol.trim()) return 'Token symbol is required';
    if (!jettonMasterAddress.trim()) return 'Jetton master address is required';
    if (!xUrl.trim()) return 'X profile URL is required';
    if (!xUrl.startsWith('https://x.com/') && !xUrl.startsWith('https://twitter.com/'))
      return 'X profile URL must start with https://x.com/';
    if (!telegramUrl.trim()) return 'Telegram channel URL is required';
    if (!telegramUrl.startsWith('https://t.me/'))
      return 'Telegram URL must start with https://t.me/';
    return null;
  };

  const validate2 = () => {
    if (!totalReward || isNaN(parseFloat(totalReward)) || parseFloat(totalReward) <= 0)
      return 'Enter a valid reward amount';
    if (rewardSlots < 3) return 'Minimum 3 reward slots';
    if ((campaignType === 'x' || campaignType === 'both') && xPostLink && !xPostLink.startsWith('https://x.com/') && !xPostLink.startsWith('https://twitter.com/'))
      return 'X post link must be an x.com or twitter.com URL';
    if ((campaignType === 'telegram' || campaignType === 'both') && telegramPostLink && !telegramPostLink.startsWith('https://t.me/'))
      return 'Telegram post link must start with https://t.me/';
    return null;
  };

  const handlePayFee = async () => {
    if (!wallet || !feeTxData) return;
    setLoading(true);
    setError(null);
    try {
      // feeTxData was pre-fetched by the useEffect above.
      // For TON fees: { to: treasuryAddr, amount: nanoTON }
      // For mGRAM fees: { to: senderJettonWallet, amount: gasNano, payload: base64BOC }
      const message: { address: string; amount: string; payload?: string } = {
        address: feeTxData.to,
        amount: feeTxData.amount,
      };
      if (feeTxData.payload) message.payload = feeTxData.payload;

      const result = await tonConnectUI.sendTransaction({
        validUntil: Math.floor(Date.now() / 1000) + 600,
        messages: [message],
      });

      setPaymentTxHash(result.boc);
      setStep(3);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Transaction cancelled or failed');
    } finally {
      setLoading(false);
    }
  };

  const handleCreatePool = async () => {
    if (!wallet) return;
    setLoading(true);
    setError(null);
    try {
      // First create project if needed, then pool
      const res = await fetch('/api/pools', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          projectName,
          tokenSymbol,
          jettonMasterAddress,
          logoUrl,
          description,
          xUrl,
          telegramUrl,
          contractAddress: contractAddress || undefined,
          totalReward,
          durationDays,
          rewardSlots,
          tier1Threshold: parseInt(tier1Threshold) || 0,
          tier2Threshold: parseInt(tier2Threshold) || 0,
          tier3Threshold: parseInt(tier3Threshold) || 0,
          accessFeePaidIn: feeCurrency,
          accessFeeTxHash: paymentTxHash,
          campaignType,
          xPostLink: xPostLink || undefined,
          telegramPostLink: telegramPostLink || undefined,
        }),
      });

      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.error ?? 'Failed to create pool');
      }

      const data = await res.json();
      setCreatedPoolId(data.pool.id);
      setContractAddress(data.pool.contractAddress ?? '');
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  };

  const stopPolling = () => {
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }
  };

  const startDepositPolling = (poolId: string) => {
    setPollStatus('polling');
    pollStartRef.current = Date.now();

    const check = async () => {
      // Timeout after 5 minutes
      if (Date.now() - pollStartRef.current > 5 * 60 * 1000) {
        stopPolling();
        setPollStatus('timeout');
        return;
      }

      try {
        const res = await fetch(`/api/pools/${poolId}/deposit-status`);
        const data = await res.json();
        if (data.deposited) {
          stopPolling();
          setPollStatus('confirmed');
          setDepositDone(true);
          setStep(4);
        }
      } catch {
        // ignore transient fetch errors, keep polling
      }
    };

    // First check after 5s, then every 10s
    const id = setInterval(check, 10_000);
    pollIntervalRef.current = id;
    setTimeout(check, 5_000);
  };

  const handleDepositTokens = async () => {
    if (!wallet || !createdPoolId || !depositTxData) return;
    setLoading(true);
    setError(null);
    setPollStatus('idle');
    try {
      // depositTxData was pre-fetched when createdPoolId was set.
      // { to: creatorJettonWallet, amount: gasNanoTON, payload: base64BOC }
      await tonConnectUI.sendTransaction({
        validUntil: Math.floor(Date.now() / 1000) + 600,
        messages: [{
          address: depositTxData.to,
          amount: depositTxData.amount,
          payload: depositTxData.payload,
        }],
      });

      // Transaction sent - start polling for on-chain confirmation
      startDepositPolling(createdPoolId);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Deposit cancelled or failed');
      setPollStatus('idle');
    } finally {
      setLoading(false);
    }
  };

  const retryDepositTx = () => {
    if (!createdPoolId) return;
    setDepositTxData(null);
    setDepositTxError(null);
    setDepositTxLoading(true);
    fetch(`/api/deposit-tx?poolId=${createdPoolId}`, { credentials: 'include' })
      .then((r) => r.json())
      .then((d) => d.error ? setDepositTxError(d.error) : setDepositTxData(d))
      .catch(() => setDepositTxError('Could not build deposit transaction. Please retry.'))
      .finally(() => setDepositTxLoading(false));
  };

  // Cleanup polling on unmount
  useEffect(() => {
    return () => stopPolling();
  }, []);

  // Auto-fetch jetton metadata when address field has a plausible TON address.
  // Debounced 600 ms so we don't hammer the RPC on every keystroke.
  useEffect(() => {
    const trimmed = jettonMasterAddress.trim();
    // Wait until the input is long enough to plausibly be a TON address.
    // User-friendly form (EQ/UQ) = 48 chars; raw form (0:hex) = 66 chars.
    // Use 32 as a loose gate so we don't fire on partial keystrokes.
    if (trimmed.length < 32) {
      setJettonFetchStatus('idle');
      setJettonFetchError(null);
      return;
    }
    setJettonFetchStatus('loading');
    setJettonFetchError(null);

    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/jetton-meta?address=${encodeURIComponent(trimmed)}`);
        const data = await res.json() as { name?: string; symbol?: string; image?: string; error?: string };
        if (!res.ok || data.error) {
          setJettonFetchStatus('error');
          setJettonFetchError(data.error ?? 'Failed to fetch token metadata');
          return;
        }
        if (data.name)   setProjectName(data.name);
        if (data.symbol) setTokenSymbol(data.symbol.toUpperCase());
        if (data.image)  setLogoUrl(data.image);
        setJettonFetchStatus('success');
      } catch {
        setJettonFetchStatus('error');
        setJettonFetchError('Could not reach metadata endpoint');
      }
    }, 600);

    return () => clearTimeout(timer);
  }, [jettonMasterAddress]);

  const usdFees = USD_FEE_TABLE[durationDays];

  return (
    <div className="max-w-2xl mx-auto">
      {/* Step progress */}
      <div className="flex items-center mb-10">
        {STEPS.map((label, i) => (
          <div key={i} className="flex items-center flex-1 last:flex-none">
            <div className="flex flex-col items-center gap-1">
              <div
                className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-all ${
                  i < step
                    ? 'bg-[#0088CC] text-white'
                    : i === step
                    ? 'bg-[#0088CC]/30 text-[#0088CC] border border-[#0088CC]'
                    : 'bg-white/5 text-white/30 border border-white/10'
                }`}
              >
                {i < step ? <CheckCircle className="w-4 h-4" /> : i + 1}
              </div>
              <span
                className={`text-[10px] hidden sm:block ${
                  i === step ? 'text-[#0088CC]' : 'text-white/30'
                }`}
              >
                {label}
              </span>
            </div>
            {i < STEPS.length - 1 && (
              <div
                className={`flex-1 h-px mx-2 transition-all ${
                  i < step ? 'bg-[#0088CC]' : 'bg-white/10'
                }`}
              />
            )}
          </div>
        ))}
      </div>

      <div className="glass-card p-8">
        {error && (
          <div className="mb-6 p-4 rounded-xl bg-red-500/10 border border-red-500/20 flex items-start gap-2 text-red-400 text-sm">
            <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
            {error}
          </div>
        )}

        {/* ── Step 0: Project Info ── */}
        {step === 0 && (
          <div className="space-y-5">
            <h2 className="text-xl font-semibold text-white mb-6">
              Project Information
            </h2>

            {/* Jetton Master Address - first field; triggers metadata auto-fill */}
            <div>
              <label className="block text-sm text-white/60 mb-1.5">
                Jetton Master Address *
              </label>
              <div className="relative">
                <input
                  value={jettonMasterAddress}
                  onChange={(e) => setJettonMasterAddress(e.target.value)}
                  placeholder="EQ..."
                  className={`w-full bg-white/5 border rounded-xl px-4 py-3 pr-10 text-sm text-white placeholder-white/25 focus:outline-none font-mono text-xs transition-colors ${
                    jettonFetchStatus === 'success'
                      ? 'border-green-500/50 focus:border-green-500/70'
                      : jettonFetchStatus === 'error'
                      ? 'border-red-500/50 focus:border-red-500/70'
                      : 'border-white/10 focus:border-[#0088CC]/50'
                  }`}
                />
                {jettonFetchStatus === 'loading' && (
                  <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/40 animate-spin" />
                )}
                {jettonFetchStatus === 'success' && (
                  <CheckCircle className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-green-400" />
                )}
                {jettonFetchStatus === 'error' && (
                  <AlertCircle className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-red-400" />
                )}
              </div>
              {jettonFetchStatus === 'success' && (
                <p className="mt-1.5 text-xs text-green-400/80">Token metadata loaded - fields below have been auto-filled.</p>
              )}
              {jettonFetchStatus === 'error' && jettonFetchError && (
                <p className="mt-1.5 text-xs text-red-400">{jettonFetchError}</p>
              )}
            </div>

            <div>
              <label className="block text-sm text-white/60 mb-1.5">
                Project Name *
              </label>
              <input
                value={projectName}
                onChange={(e) => setProjectName(e.target.value)}
                placeholder="e.g. MyTON Project"
                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder-white/25 focus:outline-none focus:border-[#0088CC]/50"
              />
            </div>
            <div>
              <label className="block text-sm text-white/60 mb-1.5">
                Token Symbol *
              </label>
              <input
                value={tokenSymbol}
                onChange={(e) => setTokenSymbol(e.target.value.toUpperCase())}
                placeholder="e.g. MTON"
                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder-white/25 focus:outline-none focus:border-[#0088CC]/50"
              />
            </div>
            <div>
              <label className="block text-sm text-white/60 mb-1.5">
                Logo URL (optional)
              </label>
              <input
                value={logoUrl}
                onChange={(e) => setLogoUrl(e.target.value)}
                placeholder="https://..."
                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder-white/25 focus:outline-none focus:border-[#0088CC]/50"
              />
            </div>
            <div>
              <label className="block text-sm text-white/60 mb-1.5">
                Description (optional)
              </label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
                placeholder="Tell marketers about your project..."
                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder-white/25 focus:outline-none focus:border-[#0088CC]/50 resize-none"
              />
            </div>
            <div>
              <label className="block text-sm text-white/60 mb-1.5">
                X Profile URL *
              </label>
              <input
                value={xUrl}
                onChange={(e) => setXUrl(e.target.value)}
                placeholder="https://x.com/yourproject"
                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder-white/25 focus:outline-none focus:border-[#0088CC]/50"
              />
            </div>
            <div>
              <label className="block text-sm text-white/60 mb-1.5">
                Telegram Channel URL *
              </label>
              <input
                value={telegramUrl}
                onChange={(e) => setTelegramUrl(e.target.value)}
                placeholder="https://t.me/yourproject"
                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder-white/25 focus:outline-none focus:border-[#0088CC]/50"
              />
              <p className="mt-1.5 text-xs text-white/30">Must be a public Telegram channel (not a group or DM).</p>
            </div>
          </div>
        )}

        {/* ── Step 1: Pool Config ── */}
        {step === 1 && (
          <div className="space-y-5">
            <h2 className="text-xl font-semibold text-white mb-6">
              Pool Configuration
            </h2>
            <div>
              <label className="block text-sm text-white/60 mb-2">
                Duration *
              </label>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {DURATIONS.map((d) => (
                  <button
                    key={d.days}
                    onClick={() => setDurationDays(d.days)}
                    className={`py-3 rounded-xl text-sm font-medium border transition-all ${
                      durationDays === d.days
                        ? 'bg-[#0088CC] border-[#0088CC] text-white'
                        : 'bg-white/[0.03] border-white/10 text-white/60 hover:border-[#0088CC]/40'
                    }`}
                  >
                    {d.label}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="block text-sm text-white/60 mb-1.5">
                Total Reward Amount * ({tokenSymbol || 'tokens'})
              </label>
              <input
                type="number"
                value={totalReward}
                onChange={(e) => setTotalReward(e.target.value)}
                placeholder="e.g. 1000000"
                min="1"
                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder-white/25 focus:outline-none focus:border-[#0088CC]/50"
              />
            </div>
            <div>
              <label className="block text-sm text-white/60 mb-1.5">
                Reward Slots * (min 3)
              </label>
              <input
                type="number"
                value={rewardSlots}
                onChange={(e) =>
                  setRewardSlots(Math.max(3, parseInt(e.target.value) || 3))
                }
                min="3"
                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder-white/25 focus:outline-none focus:border-[#0088CC]/50"
              />
              <p className="mt-1.5 text-xs text-white/30">
                Top {rewardSlots} marketers by points will share the reward
                pool proportionally.
              </p>
            </div>

            {/* Campaign Type */}
            <div>
              <label className="block text-sm text-white/60 mb-2">Campaign Type *</label>
              <div className="grid grid-cols-3 gap-3">
                {([
                  { value: 'both', label: 'X + Telegram', desc: '50/50 split' },
                  { value: 'x', label: 'X Only', desc: '100% X score' },
                  { value: 'telegram', label: 'Telegram Only', desc: '100% Telegram' },
                ] as { value: CampaignType; label: string; desc: string }[]).map((opt) => (
                  <button
                    key={opt.value}
                    onClick={() => setCampaignType(opt.value)}
                    className={`py-3 px-2 rounded-xl text-sm font-medium border transition-all text-center ${
                      campaignType === opt.value
                        ? 'bg-[#0088CC] border-[#0088CC] text-white'
                        : 'bg-white/[0.03] border-white/10 text-white/60 hover:border-[#0088CC]/40'
                    }`}
                  >
                    <p>{opt.label}</p>
                    <p className="text-[10px] mt-0.5 opacity-70">{opt.desc}</p>
                  </button>
                ))}
              </div>
            </div>

            {/* Post Links */}
            {(campaignType === 'x' || campaignType === 'both') && (
              <div>
                <label className="block text-sm text-white/60 mb-1.5">
                  X Post to Promote (optional)
                </label>
                <input
                  value={xPostLink}
                  onChange={(e) => setXPostLink(e.target.value)}
                  placeholder="https://x.com/yourproject/status/..."
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder-white/25 focus:outline-none focus:border-[#0088CC]/50"
                />
                <p className="mt-1 text-xs text-white/30">Marketers will be directed to share this post.</p>
              </div>
            )}
            {(campaignType === 'telegram' || campaignType === 'both') && (
              <div>
                <label className="block text-sm text-white/60 mb-1.5">
                  Telegram Post to Promote (optional)
                </label>
                <input
                  value={telegramPostLink}
                  onChange={(e) => setTelegramPostLink(e.target.value)}
                  placeholder="https://t.me/yourproject/123"
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder-white/25 focus:outline-none focus:border-[#0088CC]/50"
                />
                <p className="mt-1 text-xs text-white/30">Marketers will be directed to share this post.</p>
              </div>
            )}

            {/* Referral Boost Tiers */}
            <div className="pt-2">
              <p className="text-sm font-semibold text-white mb-1">Referral Boost Tiers</p>
              <p className="text-xs text-white/40 mb-4">
                Set the minimum token holdings required for each referral multiplier tier.
                Leave at 0 to disable that tier.
              </p>
              <div className="space-y-3">
                {[
                  { label: 'Tier 1', mult: '1.2×', value: tier1Threshold, set: setTier1Threshold, color: 'text-blue-300' },
                  { label: 'Tier 2', mult: '1.5×', value: tier2Threshold, set: setTier2Threshold, color: 'text-purple-300' },
                  { label: 'Tier 3', mult: '2.0×', value: tier3Threshold, set: setTier3Threshold, color: 'text-yellow-300' },
                ].map((tier) => (
                  <div key={tier.label} className="flex items-center gap-3">
                    <div className="w-24 shrink-0">
                      <span className={`text-sm font-semibold ${tier.color}`}>{tier.label}</span>
                      <span className="text-xs text-white/30 ml-1">→ {tier.mult}</span>
                    </div>
                    <input
                      type="number"
                      value={tier.value}
                      onChange={(e) => tier.set(e.target.value)}
                      placeholder={`e.g. 1000`}
                      min="0"
                      className="flex-1 bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white placeholder-white/25 focus:outline-none focus:border-[#0088CC]/50"
                    />
                    <span className="text-xs text-white/30 shrink-0">
                      min {tokenSymbol || 'tokens'}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ── Step 2: Payment ── */}
        {step === 2 && (
          <div className="space-y-6">
            <div>
              <h2 className="text-xl font-semibold text-white mb-1">
                Pay Access Fee
              </h2>
              <p className="text-sm text-white/40">
                Dollar-pegged fee, calculated at current market price and sent
                directly to the platform treasury.
              </p>
            </div>

            {/* Fee table */}
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-white/10">
                    <th className="py-2 text-left text-white/40 font-medium">Duration</th>
                    <th className="py-2 text-right text-white/40 font-medium">$mGRAM</th>
                    <th className="py-2 text-right text-white/40 font-medium">TON</th>
                  </tr>
                </thead>
                <tbody>
                  {DURATIONS.map((d) => (
                    <tr
                      key={d.days}
                      className={`border-b border-white/5 transition-colors ${
                        durationDays === d.days ? 'bg-[#0088CC]/5' : ''
                      }`}
                    >
                      <td className="py-2.5 text-white/70">{d.label}</td>
                      <td className="py-2.5 text-right text-white/70">${USD_FEE_TABLE[d.days].mgram}</td>
                      <td className="py-2.5 text-right text-white/70">${USD_FEE_TABLE[d.days].ton}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Currency picker */}
            <div className="p-4 rounded-xl bg-[#0088CC]/10 border border-[#0088CC]/20">
              <p className="text-sm text-white/60 mb-3">
                Selected:{' '}
                <span className="text-white font-medium">
                  {DURATIONS.find((d) => d.days === durationDays)?.label}
                </span>
              </p>
              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={() => setFeeCurrency('MGRAM')}
                  className={`p-3 rounded-xl border text-sm font-medium transition-all ${
                    feeCurrency === 'MGRAM'
                      ? 'bg-purple-500/20 border-purple-500/40 text-purple-300'
                      : 'bg-white/[0.03] border-white/10 text-white/50 hover:border-white/20'
                  }`}
                >
                  <p className="font-semibold">$mGRAM</p>
                  <p className="text-xs mt-0.5 opacity-70">
                    ${usdFees.mgram}
                    {priceData && priceData.prices.mgram > 0 ? (
                      <span> · {(usdFees.mgram / priceData.prices.mgram).toFixed(2)} mGRAM</span>
                    ) : (
                      <span> · rate loading…</span>
                    )}
                  </p>
                </button>
                <button
                  onClick={() => setFeeCurrency('TON')}
                  className={`p-3 rounded-xl border text-sm font-medium transition-all ${
                    feeCurrency === 'TON'
                      ? 'bg-[#0088CC]/20 border-[#0088CC]/40 text-[#0088CC]'
                      : 'bg-white/[0.03] border-white/10 text-white/50 hover:border-white/20'
                  }`}
                >
                  <p className="font-semibold">TON</p>
                  <p className="text-xs mt-0.5 opacity-70">
                    ${usdFees.ton}
                    {priceData && priceData.prices.ton > 0 && (
                      <span> · {(usdFees.ton / priceData.prices.ton).toFixed(4)} TON</span>
                    )}
                  </p>
                </button>
              </div>
            </div>

            {/* Exact amount from server */}
            {feeTxData && !feeTxLoading && (
              <div className="px-4 py-3 rounded-xl bg-white/[0.03] border border-white/8 text-xs text-white/50 flex items-center justify-between">
                <span>You will send</span>
                <span className="font-semibold text-white/80">
                  {feeCurrency === 'TON'
                    ? `${feeTxData.expectedFee.tokenAmount.toFixed(6)} TON`
                    : `${feeTxData.expectedFee.tokenAmount.toFixed(4)} mGRAM`}
                  <span className="text-white/30 ml-1">(≈ ${feeTxData.expectedFee.usdAmount.toFixed(2)})</span>
                </span>
              </div>
            )}

            {feeTxError && (
              <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-xs flex items-center gap-2">
                <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
                {feeTxError}
              </div>
            )}

            {priceData && (
              <p className="text-xs text-white/30">
                Live price: 1 TON = ${priceData.prices.ton.toFixed(2)} USD.
                Final amount is calculated server-side at time of payment.
              </p>
            )}

            <button
              onClick={handlePayFee}
              disabled={loading || feeTxLoading || !feeTxData || !!feeTxError}
              className="btn-primary w-full flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {(loading || feeTxLoading) && <Loader2 className="w-4 h-4 animate-spin" />}
              {feeTxLoading
                ? 'Loading fee…'
                : feeTxError
                ? 'Fee unavailable - retry'
                : feeTxData
                ? feeCurrency === 'TON'
                  ? `Pay ${feeTxData.expectedFee.tokenAmount.toFixed(6)} TON`
                  : `Pay ${feeTxData.expectedFee.tokenAmount.toFixed(4)} mGRAM`
                : 'Loading…'}
            </button>
          </div>
        )}

        {/* ── Step 3: Token Deposit ── */}
        {step === 3 && (
          <div className="space-y-6">
            <div>
              <h2 className="text-xl font-semibold text-white mb-1">
                Deposit Reward Tokens
              </h2>
              <p className="text-sm text-white/40">
                Send exactly {totalReward} {tokenSymbol} to the escrow contract.
              </p>
            </div>

            {contractAddress && (
              <div className="glass-inner p-4">
                <p className="text-xs text-white/40 uppercase tracking-wider mb-2">
                  Escrow Contract Address
                </p>
                <p className="font-mono text-sm text-white/80 break-all">
                  {contractAddress}
                </p>
              </div>
            )}

            <div className="p-4 rounded-xl bg-[#0088CC]/5 border border-[#0088CC]/15 text-sm text-white/60 space-y-2">
              <p className="font-medium text-white/80">What happens next:</p>
              <ul className="list-disc list-inside space-y-1 text-white/50">
                <li>
                  Transfer {totalReward} {tokenSymbol} to the contract above
                </li>
                <li>The contract holds tokens in escrow until pool ends</li>
                <li>Platform admin triggers proportional distribution</li>
                <li>Winners receive tokens directly to their wallets</li>
              </ul>
            </div>

            {!createdPoolId && (
              <p className="text-sm text-white/40 text-center">
                Click <span className="text-white/70 font-medium">Create Pool</span> below first to deploy the escrow contract.
              </p>
            )}

            {/* Polling status banner */}
            {pollStatus === 'polling' && (
              <div className="p-4 rounded-xl bg-[#0088CC]/10 border border-[#0088CC]/20 flex items-center gap-3">
                <Loader2 className="w-4 h-4 text-[#0088CC] animate-spin flex-shrink-0" />
                <div>
                  <p className="text-sm font-medium text-[#0088CC]">Waiting for on-chain confirmation…</p>
                  <p className="text-xs text-white/40 mt-0.5">Checking every 10 seconds. This may take 1–2 minutes.</p>
                </div>
              </div>
            )}

            {pollStatus === 'timeout' && (
              <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/20 space-y-3">
                <div className="flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 text-red-400 mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="text-sm font-medium text-red-400">Confirmation timed out</p>
                    <p className="text-xs text-white/40 mt-0.5">
                      The deposit was not detected after 5 minutes. Your transaction may still confirm - check TONScan,
                      or retry below.
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => startDepositPolling(createdPoolId)}
                  className="flex items-center gap-2 text-sm text-white/60 hover:text-white border border-white/10 px-4 py-2 rounded-xl transition-all"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  Retry confirmation check
                </button>
              </div>
            )}

            {createdPoolId && pollStatus === 'idle' && (
              <>
                {depositTxError && (
                  <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-xs flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
                      {depositTxError}
                    </div>
                    <button
                      onClick={retryDepositTx}
                      className="shrink-0 flex items-center gap-1 text-white/50 hover:text-white transition-colors"
                    >
                      <RefreshCw className="w-3 h-3" />
                      Retry
                    </button>
                  </div>
                )}
                <button
                  onClick={handleDepositTokens}
                  disabled={loading || depositTxLoading || !depositTxData || !!depositTxError}
                  className="btn-primary w-full flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {(loading || depositTxLoading) && <Loader2 className="w-4 h-4 animate-spin" />}
                  {depositTxLoading
                    ? 'Preparing transaction…'
                    : depositTxError
                    ? 'Transaction unavailable'
                    : `Deposit ${parseFloat(totalReward).toLocaleString()} ${tokenSymbol}`}
                </button>
                <p className="text-xs text-white/30 text-center">
                  You&apos;ll need to approve a jetton transfer in your TON wallet.
                </p>
              </>
            )}
          </div>
        )}

        {/* ── Step 4: Success ── */}
        {step === 4 && (
          <div className="flex flex-col items-center text-center py-6 space-y-5">
            <CheckCircle className="w-16 h-16 text-green-400" />
            <h2 className="text-2xl font-bold text-white">Pool Created!</h2>
            <p className="text-white/50 text-sm max-w-sm">
              Your reward pool is live. Marketers can now join and start
              submitting posts. The leaderboard updates every 30 minutes.
            </p>

            <div className="flex flex-col sm:flex-row gap-3 w-full mt-4">
              <button
                className="btn-primary flex-1 flex items-center justify-center gap-2"
                onClick={() => router.push(`${basePath}/pools/${createdPoolId}`)}
              >
                View Pool Page
                <ExternalLink className="w-4 h-4" />
              </button>
              <button
                className="btn-secondary flex-1"
                onClick={() => {
                  navigator.clipboard.writeText(
                    `https://gramketing.io/pools/${createdPoolId}`
                  );
                }}
              >
                Copy Share Link
              </button>
            </div>
          </div>
        )}

        {/* Navigation */}
        {step < 4 && (
          <div className="flex items-center justify-between mt-8 pt-6 border-t border-white/10">
            <button
              onClick={() => {
                setError(null);
                if (step > 0) setStep(step - 1);
              }}
              disabled={step === 0}
              className="btn-secondary flex items-center gap-2 disabled:opacity-30 disabled:cursor-not-allowed"
            >
              <ChevronLeft className="w-4 h-4" />
              Back
            </button>

            {step < 2 && (
              <button
                onClick={() => {
                  const err = step === 0 ? validate1() : validate2();
                  if (err) {
                    setError(err);
                    return;
                  }
                  setError(null);
                  setStep(step + 1);
                }}
                className="btn-primary flex items-center gap-2"
              >
                Next
                <ChevronRight className="w-4 h-4" />
              </button>
            )}

            {step === 3 && !createdPoolId && (
              <button
                onClick={handleCreatePool}
                disabled={loading}
                className="btn-primary flex items-center gap-2 disabled:opacity-40"
              >
                {loading ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : null}
                Create Pool
                <ChevronRight className="w-4 h-4" />
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
