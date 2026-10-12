import React from 'react';
import { 
  Zap, 
  TrendingDown, 
  Waves, 
  Snowflake, 
  Mountain,
  CheckCircle2,
  Info
} from 'lucide-react';
import { STRATEGIES_INFO } from '../utils/debtEngine';

const STRATEGY_ICONS = {
  avalanche: TrendingDown,
  snowball: Zap,
  tsunami: Waves,
  snowflake: Snowflake,
  landslide: Mountain
};

export default function StrategySelector({ 
  activeStrategy, 
  onSelectStrategy, 
  aiRecommendedStrategy,
  compact = false,
  showDescriptions = true
}) {
  const strategies = Object.keys(STRATEGIES_INFO);

  return (
    <div className={`space-y-3 ${compact ? '' : 'p-5 bg-white border border-slate-200 shadow-sm rounded-2xl'}`}>
      {/* Header */}
      {!compact && (
        <div className="flex items-center gap-2 mb-4">
          <Info className="w-5 h-5 text-indigo-600" />
          <h3 className="font-bold text-slate-900 text-lg">เลือกวิธีแก้หนี้ของคุณ</h3>
        </div>
      )}

      {/* Strategy Grid */}
      <div className={`grid gap-3 ${
        compact 
          ? 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-5' 
          : 'grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5'
      }`}>
        {strategies.map((strategyKey) => {
          const info = STRATEGIES_INFO[strategyKey];
          const isSelected = activeStrategy === strategyKey;
          const isAiRecommended = aiRecommendedStrategy === strategyKey;
          const Icon = STRATEGY_ICONS[strategyKey];

          return (
            <button
              key={strategyKey}
              onClick={() => onSelectStrategy(strategyKey)}
              className={`relative p-4 rounded-2xl border-2 transition-all duration-300 text-left group cursor-pointer ${
                isSelected
                  ? 'border-indigo-600 bg-indigo-50/70 shadow-sm scale-[1.02]'
                  : 'border-slate-200 bg-slate-50/50 hover:border-slate-300 hover:bg-white'
              }`}
            >
              {/* AI Recommended Badge */}
              {isAiRecommended && (
                <div className="absolute -top-2.5 -right-2.5 bg-indigo-600 text-white font-extrabold text-[10px] px-2.5 py-0.5 rounded-full flex items-center gap-1 shadow-xs">
                  <CheckCircle2 className="w-3 h-3" />
                  AI แนะนำ
                </div>
              )}

              {/* Selected Checkmark */}
              {isSelected && (
                <div className="absolute -top-2 -left-2 bg-indigo-600 rounded-full p-1 shadow-xs text-white">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                </div>
              )}

              {/* Icon */}
              <div className={`mb-3 p-2.5 rounded-xl inline-flex ${info.badgeColor}`}>
                <Icon className="w-5 h-5" />
              </div>

              {/* Strategy Name */}
              <div className="font-extrabold text-slate-900 text-sm group-hover:text-indigo-600 transition-colors">
                {info.name}
              </div>

              {/* Outcome Label */}
              <div className="text-xs text-indigo-700 font-bold mt-1 mb-2">
                {info.outcomeLabel}
              </div>

              {/* Description (conditional) */}
              {showDescriptions && (
                <div className="text-xs text-slate-500 font-medium line-clamp-2 leading-relaxed">
                  {info.description}
                </div>
              )}
            </button>
          );
        })}
      </div>

      {/* Help Text */}
      {!compact && (
        <div className="mt-4 p-3.5 bg-indigo-50/70 border border-indigo-100 rounded-xl text-xs text-indigo-900 font-medium">
          💡 <strong>เคล็ดลับ:</strong> AI ของเราแนะนำกลยุทธ์ที่ดีที่สุดตามสถานการณ์หนี้ของคุณ แต่คุณสามารถเลือกกลยุทธ์อื่นได้ตามที่ต้องการ
        </div>
      )}
    </div>
  );
}
