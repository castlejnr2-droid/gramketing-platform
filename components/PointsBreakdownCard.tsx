'use client';
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Tooltip,
  Legend,
} from 'recharts';

interface PointsBreakdownCardProps {
  xPoints: number;
  telegramPoints: number;
  referralBonusPoints: number;
  holderBoost: number;        // 1.0–2.0 proportional
  referralMultiplier: number; // 1.0–2.0 proportional
  totalPoints: number;
}

const COLORS = {
  x: '#0088CC',
  telegram: '#00BBFF',
  referral: '#9966FF',
};

interface CustomTooltipProps {
  active?: boolean;
  payload?: Array<{ name: string; value: number }>;
}

function CustomTooltip({ active, payload }: CustomTooltipProps) {
  if (active && payload && payload.length) {
    return (
      <div className="glass-card px-3 py-2 text-xs text-white/80 border border-white/15">
        <span className="font-semibold">{payload[0].name}:</span>{' '}
        {payload[0].value.toLocaleString(undefined, {
          maximumFractionDigits: 0,
        })}{' '}
        pts
      </div>
    );
  }
  return null;
}

export function PointsBreakdownCard({
  xPoints,
  telegramPoints,
  referralBonusPoints,
  holderBoost,
  referralMultiplier,
  totalPoints,
}: PointsBreakdownCardProps) {
  const pieData = [
    { name: 'X Views', value: xPoints > 0 ? xPoints : 0, color: COLORS.x },
    {
      name: 'Telegram',
      value: telegramPoints > 0 ? telegramPoints : 0,
      color: COLORS.telegram,
    },
    {
      name: 'Referral Bonus',
      value: referralBonusPoints > 0 ? referralBonusPoints : 0,
      color: COLORS.referral,
    },
  ].filter((d) => d.value > 0);

  const hasData = pieData.length > 0;

  return (
    <div className="glass-card p-6">
      <h3 className="font-semibold text-white mb-5">Points Breakdown</h3>

      {/* Pie chart */}
      {hasData ? (
        <div className="h-48 mb-6">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={pieData}
                cx="50%"
                cy="50%"
                innerRadius={55}
                outerRadius={80}
                paddingAngle={3}
                dataKey="value"
              >
                {pieData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip content={<CustomTooltip />} />
              <Legend
                formatter={(value) => (
                  <span className="text-xs text-white/60">{value}</span>
                )}
              />
            </PieChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <div className="h-32 flex items-center justify-center text-white/30 text-sm mb-6">
          No points yet - submit posts to earn!
        </div>
      )}

      {/* Itemized breakdown */}
      <div className="space-y-3">
        {/* X Posts */}
        <div className="glass-inner flex items-center justify-between py-2.5 px-3">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-[#0088CC]" />
            <span className="text-sm text-white/70">X Posts</span>
          </div>
          <span className="text-sm font-semibold text-white">
            {xPoints.toLocaleString(undefined, { maximumFractionDigits: 0 })} pts
          </span>
        </div>

        {/* Telegram */}
        <div className="glass-inner flex items-center justify-between py-2.5 px-3">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-[#00BBFF]" />
            <span className="text-sm text-white/70">Telegram Posts</span>
          </div>
          <span className="text-sm font-semibold text-white">
            {telegramPoints.toLocaleString(undefined, { maximumFractionDigits: 0 })} pts
          </span>
        </div>

        {/* Holder Boost */}
        <div className="glass-inner flex items-center justify-between py-2.5 px-3">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-yellow-400" />
            <span className="text-sm text-white/70">Holder Boost</span>
          </div>
          <span className="text-sm font-semibold text-yellow-400">
            {holderBoost.toFixed(2)}x
          </span>
        </div>

        {/* Referral Boost */}
        <div className="glass-inner flex items-center justify-between py-2.5 px-3">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-purple-400" />
            <span className="text-sm text-white/70">Referral Boost</span>
          </div>
          <span className="text-sm font-semibold text-purple-400">
            {referralMultiplier.toFixed(2)}x
          </span>
        </div>

        {/* Referral Bonus */}
        {referralBonusPoints > 0 && (
          <div className="glass-inner flex items-center justify-between py-2.5 px-3">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-[#9966FF]" />
              <span className="text-sm text-white/70">Referral Bonus</span>
            </div>
            <span className="text-sm font-semibold text-white">
              +{referralBonusPoints.toLocaleString(undefined, { maximumFractionDigits: 0 })} pts
            </span>
          </div>
        )}

        {/* Divider + Total */}
        <div className="border-t border-white/10 pt-3 flex items-center justify-between">
          <span className="text-sm font-semibold text-white/70">Total Points</span>
          <span className="text-lg font-bold text-[#0088CC]">
            {totalPoints.toLocaleString(undefined, { maximumFractionDigits: 0 })}
          </span>
        </div>
      </div>
    </div>
  );
}
