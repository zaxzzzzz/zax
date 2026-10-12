import React from 'react';
import { 
  ArrowLeft, 
  Sliders, 
  CheckCircle2, 
  Bot, 
  ChevronRight,
  Home,
  BarChart3
} from 'lucide-react';
import { calculateDebtPayoff, formatCurrency, STRATEGIES_INFO } from '../utils/debtEngine';

export default function CompareStrategiesPage({ debts, extraBudget, activeStrategy, onSelectStrategy, onBack }) {
  const result = calculateDebtPayoff(debts, extraBudget, null);

  return (
    <div className="space-y-6 animate-fade-in pb-12">
      
      {/* 1. Interactive Visual Breadcrumb Trail */}
      <div className="flex items-center gap-2 text-xs text-slate-500 font-medium">
        <button 
          onClick={onBack}
          className="flex items-center gap-1 hover:text-indigo-600 transition-colors cursor-pointer"
        >
          <Home className="w-3.5 h-3.5" />
          <span>หน้าหลัก</span>
        </button>
        <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
        <span className="text-indigo-600 font-bold flex items-center gap-1.5 bg-indigo-50 px-2.5 py-0.5 rounded-full border border-indigo-200">
          <Sliders className="w-3.5 h-3.5" />
          เปรียบเทียบ 5 กลยุทธ์
        </span>
      </div>

      {/* 2. Visual Page Hero Header */}
      <div className="bg-white p-4 sm:p-6 rounded-2xl relative overflow-hidden border border-slate-200 shadow-sm">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 relative z-10">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="badge-gold text-xs font-bold">
                <BarChart3 className="w-3.5 h-3.5" />
                ประมวลผลเปรียบเทียบแบบ Real-time
              </span>
            </div>
            <h1 className="text-xl sm:text-2xl font-black text-slate-900 flex items-center gap-2 pt-1 tracking-tight">
              <Sliders className="w-7 h-7 text-indigo-600" />
              เปรียบเทียบผลลัพธ์การปลดหนี้ทั้ง 5 กลยุทธ์
            </h1>
            <p className="text-xs text-slate-500 font-medium">
              วิเคราะห์ความแตกต่างของเงินดอกเบี้ย ระยะเวลาปลดหนี้ และความเร็วในการปิดหนี้ก้อนแรกอย่างละเอียด
            </p>
          </div>

          <button
            onClick={onBack}
            className="btn-gold text-xs py-2.5 px-4 flex items-center gap-2 cursor-pointer shadow-md font-bold"
          >
            <ArrowLeft className="w-4 h-4" />
            ย้อนกลับ
          </button>
        </div>
      </div>

      {/* 3. AI Selection Summary Card */}
      <div className="bg-indigo-50/80 border border-indigo-200 rounded-2xl p-5 space-y-2">
        <div className="flex items-center gap-2 text-indigo-700 font-bold text-sm">
          <Bot className="w-5 h-5 text-indigo-600" />
          <span>การประเมินจากระบบ AI:</span>
        </div>
        <p className="text-sm text-slate-800 leading-relaxed font-semibold">
          {result.aiRecommendation?.reasoning}
        </p>
      </div>

      {/* 4. 5 Strategies Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-3 sm:gap-4">
        {result.allSimulations.map((sim) => {
          const info = STRATEGIES_INFO[sim.key];
          const isCurrentActive = (activeStrategy === sim.key) || (activeStrategy === null && sim.isAiSelected);

          return (
            <div 
              key={sim.key}
              className={`p-4 sm:p-5 rounded-2xl space-y-4 border transition-all relative flex flex-col justify-between ${
                isCurrentActive 
                  ? 'border-2 border-indigo-500 bg-indigo-50/70 shadow-md scale-[1.02]' 
                  : 'bg-white border-slate-200 opacity-90 hover:opacity-100 hover:border-slate-300 shadow-2xs'
              }`}
            >
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className={`text-xs px-2.5 py-0.5 rounded-full font-bold border ${info.badgeColor}`}>
                    {sim.name}
                  </span>
                  {sim.isAiSelected && (
                    <span className="bg-indigo-600 text-white font-black text-[9px] px-2 py-0.5 rounded-full animate-pulse shadow-2xs">
                      AI RECOMMENDED
                    </span>
                  )}
                </div>

                <h4 className="font-extrabold text-sm text-slate-900 mt-1">
                  {info.outcomeLabel}
                </h4>

                <p className="text-xs text-slate-500 font-medium line-clamp-2 min-h-[32px]">
                  {info.description}
                </p>

                <div className="space-y-2 pt-2 border-t border-slate-200/80 text-xs">
                  <div>
                    <span className="text-slate-500 font-medium block">ดอกเบี้ยรวมที่ต้องจ่าย:</span>
                    <span className="font-black text-indigo-600 text-base">{formatCurrency(sim.totalInterestPaid)}</span>
                  </div>

                  <div>
                    <span className="text-slate-500 font-medium block">ประหยัดดอกเบี้ยได้:</span>
                    <span className="font-bold text-emerald-600 text-sm">{formatCurrency(sim.interestSaved)}</span>
                  </div>

                  <div>
                    <span className="text-slate-500 font-medium block">ปิดหนี้ก้อนแรกใน:</span>
                    <span className="font-bold text-slate-900 text-sm">เดือนที่ {sim.firstPayoffMonth}</span>
                  </div>

                  <div>
                    <span className="text-slate-500 font-medium block">ปลดหนี้หมดทั้งระบบ:</span>
                    <span className="font-bold text-slate-800 text-sm">{sim.totalMonths} เดือน</span>
                  </div>
                </div>
              </div>

              <button
                onClick={() => {
                  onSelectStrategy(sim.key);
                  onBack();
                }}
                className={`w-full py-2.5 rounded-xl font-bold text-xs transition-all cursor-pointer mt-4 flex items-center justify-center gap-1.5 ${
                  isCurrentActive
                    ? 'bg-indigo-600 text-white shadow-xs'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200 hover:text-slate-900'
                }`}
              >
                <CheckCircle2 className="w-4 h-4" />
                {isCurrentActive ? 'กำลังใช้งานวิธีนี้' : 'เลือกใช้วิธีนี้'}
              </button>
            </div>
          );
        })}
      </div>

    </div>
  );
}
