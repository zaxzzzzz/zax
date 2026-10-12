import React from 'react';
import { ArrowLeft } from 'lucide-react';

/**
 * StepBackButton — floating back button at top-right for multi-step wizards.
 *
 * Props:
 *   onClick      — callback when clicked
 *   currentStep  — current step number (1-based)
 *   totalSteps   — total number of steps
 *   label        — optional label text (default: "ย้อนกลับ")
 *   visible      — whether to show the button (default: true)
 */
export default function StepBackButton({
  onClick,
  currentStep = 1,
  totalSteps = 3,
  label = 'ย้อนกลับ',
  visible = true
}) {
  if (!visible || currentStep <= 1) return null;

  return (
    <button
      onClick={onClick}
      className="fixed top-4 right-4 z-50 flex items-center gap-2 px-4 py-2.5 rounded-2xl bg-white/95 backdrop-blur-md border-2 border-slate-200 shadow-lg hover:shadow-xl hover:border-indigo-400 hover:bg-indigo-50/80 active:scale-95 transition-all duration-200 cursor-pointer group"
      title={`${label} (ขั้นตอนที่ ${currentStep}/${totalSteps})`}
    >
      <span className="flex items-center justify-center w-7 h-7 rounded-full bg-slate-100 group-hover:bg-indigo-100 transition-colors">
        <ArrowLeft className="w-4 h-4 text-slate-600 group-hover:text-indigo-600" />
      </span>
      <span className="text-xs font-bold text-slate-700 group-hover:text-indigo-700 hidden sm:inline">
        {label}
      </span>
      <span className="text-[10px] font-bold text-slate-400 group-hover:text-indigo-400 bg-slate-100 group-hover:bg-indigo-100 px-1.5 py-0.5 rounded-md transition-colors">
        {currentStep}/{totalSteps}
      </span>
    </button>
  );
}
