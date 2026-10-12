import React from 'react';
import { ArrowLeft, Trophy, CheckCircle2, Award, Flame, Unlock, Lock, Sparkles, Home, ChevronRight } from 'lucide-react';
import { calculateDebtProgress, formatCurrency } from '../utils/debtEngine';

export default function MilestonesPage({ debts, paymentLogs = [], result, extraBudget, onBack }) {
  // Progress computed from REAL user data (payment logs), consistent across all pages
  const progress = calculateDebtProgress(debts, paymentLogs);
  const totalBalance = progress.totalRemaining;
  const originalBalanceTotal = progress.totalOriginal;
  const totalPaid = progress.totalPaid;
  
  const progressPercent = progress.progressPercent;

  const closedDebtsCount = debts.filter(d => Number(d.balance) <= 0).length;
  const hasClosedAny = closedDebtsCount > 0;
  const isHalfway = progressPercent >= 50;
  const hasExtraBudget = extraBudget > 0;
  const hasSavedBigInterest = (result?.totalInterestSaved || 0) >= 10000;

  const milestones = [
    {
      id: 'first_closed',
      icon: Trophy,
      title: 'ปิดก้อนแรกสำเร็จ!',
      subtitle: hasClosedAny ? `ปิดแล้ว ${closedDebtsCount} รายการ` : 'ปลดล็อคเมื่อปิดหนี้ 1 ก้อนแรก',
      detail: hasClosedAny ? 'ยินดีด้วย! คุณปิดหนี้สำเร็จแล้วอย่างน้อย 1 รายการ เพิ่มกำลังใจในการปลดหนี้ก้อนถัดไป' : 'เมื่อคุณปิดหนี้ก้อนแรกสำเร็จ เหรียญรางวัลนี้จะถูกปลดล็อคให้อัตโนมัติ',
      unlocked: hasClosedAny,
      color: 'amber'
    },
    {
      id: 'extra_streak',
      icon: Flame,
      title: 'โปะต่อเนื่องมุ่งมั่น!',
      subtitle: hasExtraBudget ? `โปะเพิ่ม ${formatCurrency(extraBudget)}/เดือน` : 'เริ่มตั้งงบโปะเพิ่ม',
      detail: hasExtraBudget ? `เยี่ยมมาก! คุณตั้งงบโปะเพิ่ม ${formatCurrency(extraBudget)}/เดือน ช่วยประหยัดเงินดอกเบี้ยได้มหาศาล` : 'ตั้งงบโปะเพิ่มแม้เพียง 500-1,000 บาท/เดือน จะช่วยให้ปลดหนี้เร็วขึ้นหลายปี',
      unlocked: hasExtraBudget,
      color: 'orange'
    },
    {
      id: 'halfway_there',
      icon: isHalfway ? Unlock : Lock,
      title: 'หนี้ลดลง 50%',
      subtitle: isHalfway ? 'ผ่านครึ่งทางแล้ว!' : `ขาดอีก ${Math.max(0, 50 - progressPercent)}% จะปลดล็อค`,
      detail: isHalfway ? 'คุณชำระหนี้มาได้เกินครึ่งทางแล้ว อิสรภาพทางการเงินอยู่ใกล้แค่เอื้อม!' : `ผ่อนชำระหนี้รวมให้ลดลงถึง 50% ของยอดเริ่มต้นเพื่อปลดล็อคเหรียญนี้ (ขาดอีกเพียง ${Math.max(0, 50 - progressPercent)}%)`,
      unlocked: isHalfway,
      color: 'emerald'
    },
    {
      id: 'interest_saver',
      icon: Award,
      title: 'เซฟดอกหมื่นแรก!',
      subtitle: hasSavedBigInterest ? `ประหยัดแล้ว ${formatCurrency(result.totalInterestSaved)}` : 'ลดดอกเบี้ยให้ครบ 10,000 บาท',
      detail: hasSavedBigInterest ? `สุดยอด! แผนการจ่ายหนี้ของคุณเซฟเงินดอกเบี้ยที่ต้องจ่ายธนาคารไปได้แล้วมากกว่า ${formatCurrency(result.totalInterestSaved)}` : 'ประหยัดดอกเบี้ยให้ถึง 10,000 บาทด้วยการโปะตามแผน AI',
      unlocked: hasSavedBigInterest,
      color: 'purple'
    }
  ];

  return (
    <div className="milestones-page space-y-6 animate-fade-in pb-12">
      
      {/* 1. Visual Breadcrumb Trail */}
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
          <Trophy className="w-3.5 h-3.5" />
          เหรียญรางวัลและความสำเร็จ
        </span>
      </div>

      {/* 2. Visual Page Hero Header */}
      <div className="bg-white p-6 rounded-2xl relative overflow-hidden border border-slate-200 shadow-sm">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 relative z-10">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="badge-gold text-xs font-bold">
                🏆 ติดตามความสำเร็จในการชำระหนี้
              </span>
            </div>
            <h1 className="text-2xl font-black text-slate-900 flex items-center gap-2 pt-1 tracking-tight">
              <Trophy className="w-7 h-7 text-indigo-600" />
              ความสำเร็จและเหรียญรางวัลทางการเงิน
            </h1>
            <p className="text-xs text-slate-500 font-medium">
              ติดตามเหรียญรางวัลและเป้าหมายย่อยในการเดินทางสู่อิสรภาพทางการเงินแบบไร้หนี้
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

      {/* 3. Milestones Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {milestones.map((m) => {
          const Icon = m.icon;
          return (
            <div 
              key={m.id}
              className={`p-6 rounded-2xl space-y-3 border transition-all ${
                m.unlocked 
                  ? 'border-indigo-200 bg-indigo-50/70 shadow-sm' 
                  : 'bg-white border-slate-200 opacity-80'
              }`}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className={`p-3 rounded-2xl ${
                    m.unlocked ? 'bg-indigo-600 text-white shadow-xs' : 'bg-slate-100 text-slate-400 border border-slate-200'
                  }`}>
                    <Icon className="w-6 h-6" />
                  </div>
                  <div>
                    <h3 className="font-extrabold text-slate-900 text-base flex items-center gap-2">
                      {m.title}
                      {m.unlocked && <CheckCircle2 className="w-4 h-4 text-emerald-600" />}
                    </h3>
                    <span className="text-xs text-indigo-600 font-bold">{m.subtitle}</span>
                  </div>
                </div>

                <span className={`text-xs px-3 py-1 rounded-full font-bold ${
                  m.unlocked ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-slate-100 text-slate-500'
                }`}>
                  {m.unlocked ? 'ปลดล็อคแล้ว 🎉' : 'ยังไม่ปลดล็อค 🔒'}
                </span>
              </div>

              <p className="text-xs text-slate-600 font-medium bg-white p-3.5 rounded-xl border border-slate-200/80 leading-relaxed">
                {m.detail}
              </p>
            </div>
          );
        })}
      </div>

    </div>
  );
}
