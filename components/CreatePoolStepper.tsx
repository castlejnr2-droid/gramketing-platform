'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  ChevronRight,
  ChevronLeft,
  CheckCircle,
  Loader2,
  AlertCircle,
  ExternalLink,
} from 'lucide-react';
import { useTonConnectUI, useTonWallet } from '@tonconnect/ui-react';

interface FeeEntry {
  usdAmount: number;
  tokenAmount: number;
}

interface FeeRow {
  mgram: FeeEntry;
  ton: FeeEntry;
}

interface Prices {
  ton: number;
  mgram: number;
}

interface PriceData {
  prices: Prices;
  fees: Record<string, FeeRow>;
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
  7:  { mgram: 100, ton: 125 },
  14: { mgram: 199, ton: 249 },
  21: { mgram: 299, ton: 374 },
  28: { mgram: 399, ton: 499 },
};

const STEPS = [
  'Project Info',
  'Pool Config',
  'Payment',
  'Deposit Tokens',
  'Done',
];

export function CreatePoolStepper() {
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

  // Step 3
  const [feeCurrency, setFeeCurrency] = useState<FeeCurrency>('TON');
  const [priceData, setPriceData] = useState<PriceData | null>(null);
  const [paymentTxHash, setPaymentTxHash] = useState('');

  // Step 4
  const [createdPoolId, setCreatedPoolId] = useState('');
  const [contractAddress, setContractAddress] = useState('');
  const [depositDone, setDepositDone] = useState(false);

  useEffect(() => {
    if (step === 2) {
      fetch('/api/prices')
        .then((r) => r.json())
        .then(setPriceData)
        .catch(() => {});
    }
  }, [step]);

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

  const handlePayWithTON = async () => {
    if (!wallet) return;
    const fees = priceData?.fees[durationDays];
    if (!fees) return;

    setLoading(true);
    setError(null);
    try {
      const tonAmount = fees.ton.tokenAmount;
      // Convert TON to nanoton
      const nanoton = BigInt(Math.round(tonAmount * 1e9)).toString();
      const treasuryWallet = process.env.NEXT_PUBLIC_TREASURY_ADDRESS ?? '';

      // Build transaction
      const tx = {
        validUntil: Math.floor(Date.now() / 1000) + 600,
        messages: [
          {
            address: treasuryWallet,
            amount: nanoton,
          },
        ],
      };

      const result = await tonConnectUI.sendTransaction(tx);
      setPaymentTxHash(result.boc);
      setStep(3);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Transaction failed');
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

  const handleDepositTokens = async () => {
    if (!wallet) return;
    setLoading(true);
    setError(null);
    try {
      // Build jetton transfer transaction to contract address
      // The project owner transfers totalReward tokens to the escrow contract
      // In practice this uses TonConnect to send a jetton transfer message
      // For now we show a stub success
      // TODO: Implement full jetton transfer via TonConnect
      await new Promise((resolve) => setTimeout(resolve, 1000));
      setDepositDone(true);
      setStep(4);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Deposit failed');
    } finally {
      setLoading(false);
    }
  };

  const currentFees = priceData?.fees[durationDays];
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
                Jetton Master Address *
              </label>
              <input
                value={jettonMasterAddress}
                onChange={(e) => setJettonMasterAddress(e.target.value)}
                placeholder="EQ..."
                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder-white/25 focus:outline-none focus:border-[#0088CC]/50 font-mono text-xs"
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
                Dollar-pegged fee, calculated at current market price.
              </p>
            </div>

            {/* Fee table */}
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-white/10">
                    <th className="py-2 text-left text-white/40 font-medium">
                      Duration
                    </th>
                    <th className="py-2 text-right text-white/40 font-medium">
                      Pay with $mGRAM
                    </th>
                    <th className="py-2 text-right text-white/40 font-medium">
                      Pay with TON
                    </th>
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
                      <td className="py-2.5 text-right text-white/70">
                        ${USD_FEE_TABLE[d.days].mgram}
                      </td>
                      <td className="py-2.5 text-right text-white/70">
                        ${USD_FEE_TABLE[d.days].ton}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Selected fee */}
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
                  <p className="text-xs mt-0.5">
                    ${usdFees.mgram}
                    {currentFees && priceData && priceData.prices.mgram > 0 ? (
                      <span className="text-white/40">
                        {' '}
                        ≈ {currentFees.mgram.tokenAmount.toFixed(2)} mGRAM
                      </span>
                    ) : (
                      <span className="text-white/30"> (not yet launched)</span>
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
                  <p className="text-xs mt-0.5">
                    ${usdFees.ton}
                    {currentFees && priceData && priceData.prices.ton > 0 && (
                      <span className="text-white/40">
                        {' '}
                        ≈ {currentFees.ton.tokenAmount.toFixed(4)} TON
                      </span>
                    )}
                  </p>
                </button>
              </div>
            </div>

            {priceData && (
              <p className="text-xs text-white/30">
                Live price: 1 TON = ${priceData.prices.ton.toFixed(2)} USD.
                Amount auto-adjusts to current market price.
              </p>
            )}

            <button
              onClick={handlePayWithTON}
              disabled={loading || feeCurrency === 'MGRAM'}
              className="btn-primary w-full flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {loading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : null}
              {feeCurrency === 'TON'
                ? `Pay ${currentFees?.ton.tokenAmount.toFixed(4) ?? '...'} TON`
                : '$mGRAM payment coming soon'}
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

            <button
              onClick={handleDepositTokens}
              disabled={loading}
              className="btn-primary w-full flex items-center justify-center gap-2 disabled:opacity-40"
            >
              {loading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : null}
              Deposit {totalReward} {tokenSymbol}
            </button>
            <p className="text-xs text-white/30 text-center">
              You&apos;ll need to approve a jetton transfer in your TON wallet.
            </p>
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
                onClick={() => router.push(`/pools/${createdPoolId}`)}
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
