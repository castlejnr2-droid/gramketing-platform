'use client';
import { useTonWallet, useTonConnectUI } from '@tonconnect/ui-react';
import { CreatePoolStepper } from '@/components/CreatePoolStepper';
import { Shield, Coins, Trophy, Wallet } from 'lucide-react';

const INFO_CARDS = [
  {
    icon: <Shield className="w-5 h-5 text-[#0088CC]" />,
    title: 'Escrow Security',
    desc: 'Your reward tokens are held in a TON smart contract. No one can access them until distribution is triggered.',
  },
  {
    icon: <Coins className="w-5 h-5 text-[#0088CC]" />,
    title: 'Dollar-Pegged Fees',
    desc: 'Platform access fees are dollar-pegged and calculated at live CoinGecko prices at the moment of payment.',
  },
  {
    icon: <Trophy className="w-5 h-5 text-[#0088CC]" />,
    title: 'Performance-Based',
    desc: 'Rewards are distributed proportionally by points. Top marketers earn more — your budget works harder.',
  },
];

export default function CreatePoolPage() {
  const wallet = useTonWallet();
  const [tonConnectUI] = useTonConnectUI();

  if (!wallet) {
    return (
      <div className="min-h-screen pt-24 px-4 flex items-center justify-center">
        <div className="glass-card p-12 text-center max-w-md w-full">
          <Coins className="w-12 h-12 mx-auto text-[#0088CC]/50 mb-5" />
          <h1 className="text-2xl font-bold text-white mb-3">
            Connect Your Wallet
          </h1>
          <p className="text-white/50 text-sm mb-8">
            You need a TON wallet to create a reward pool. The wallet will sign
            the access fee transaction and own the pool contract.
          </p>
          <button
            onClick={() => tonConnectUI.openModal()}
            className="w-full flex items-center justify-center gap-2 px-6 py-3 rounded-xl text-sm font-semibold bg-[#0088CC] hover:bg-[#0099DD] text-white transition-all"
          >
            <Wallet className="w-4 h-4" />
            Connect Wallet
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen pt-24 pb-20 px-4">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold text-white mb-3">
            Create a Reward Pool
          </h1>
          <p className="text-white/50 max-w-xl mx-auto">
            Set up a performance-based marketing campaign. Marketers earn
            rewards by promoting your project on X and Telegram.
          </p>
        </div>

        {/* Info cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-12">
          {INFO_CARDS.map((card) => (
            <div
              key={card.title}
              className="glass-card p-5 flex items-start gap-4"
            >
              <div className="p-2.5 rounded-xl bg-[#0088CC]/10 border border-[#0088CC]/20 flex-shrink-0">
                {card.icon}
              </div>
              <div>
                <h3 className="font-medium text-white text-sm mb-1">
                  {card.title}
                </h3>
                <p className="text-xs text-white/50 leading-relaxed">
                  {card.desc}
                </p>
              </div>
            </div>
          ))}
        </div>

        {/* Stepper */}
        <CreatePoolStepper />
      </div>
    </div>
  );
}
