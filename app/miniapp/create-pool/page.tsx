'use client';
import { useTonWallet, useTonConnectUI } from '@tonconnect/ui-react';
import { CreatePoolStepper } from '@/components/CreatePoolStepper';
import { Shield, Coins, Trophy, Wallet } from 'lucide-react';

const INFO_CARDS = [
  {
    icon: <Shield className="w-4 h-4 text-[#0088CC]" />,
    title: 'Escrow Security',
    desc: 'Reward tokens are held in a TON smart contract until distribution.',
  },
  {
    icon: <Coins className="w-4 h-4 text-[#0088CC]" />,
    title: 'Dollar-Pegged Fees',
    desc: 'Access fees are calculated at live CoinGecko prices at payment time.',
  },
  {
    icon: <Trophy className="w-4 h-4 text-[#0088CC]" />,
    title: 'Performance-Based',
    desc: 'Rewards distributed proportionally by points - top marketers earn more.',
  },
];

export default function MiniAppCreatePoolPage() {
  const wallet = useTonWallet();
  const [tonConnectUI] = useTonConnectUI();

  if (!wallet) {
    return (
      <div className="pt-12 px-4 flex flex-col items-center justify-center min-h-[60vh] text-center">
        <Coins className="w-12 h-12 text-[#0088CC]/50 mb-4" />
        <h1 className="text-xl font-bold text-white mb-2">Connect Your Wallet</h1>
        <p className="text-white/50 text-sm mb-6">
          You need a TON wallet to create a reward pool. The wallet will sign the
          access fee transaction and own the pool contract.
        </p>
        <button
          onClick={() => tonConnectUI.openModal()}
          className="btn-primary flex items-center gap-2"
        >
          <Wallet className="w-4 h-4" />
          Connect Wallet
        </button>
      </div>
    );
  }

  return (
    <div className="pt-5 pb-6 px-4">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white mb-1">Create a Reward Pool</h1>
        <p className="text-white/50 text-sm">
          Set up a performance-based marketing campaign on X and Telegram.
        </p>
      </div>

      {/* Info cards */}
      <div className="space-y-2 mb-6">
        {INFO_CARDS.map((card) => (
          <div key={card.title} className="glass-card p-4 flex items-start gap-3">
            <div className="p-2 rounded-lg bg-[#0088CC]/10 border border-[#0088CC]/20 flex-shrink-0">
              {card.icon}
            </div>
            <div>
              <p className="text-sm font-medium text-white">{card.title}</p>
              <p className="text-xs text-white/50 mt-0.5 leading-relaxed">{card.desc}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Stepper - redirects to /miniapp/pools/:id on success */}
      <CreatePoolStepper basePath="/miniapp" />
    </div>
  );
}
