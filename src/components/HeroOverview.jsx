import React from 'react';
import {
  Clock,
  TrendingDown,
  ArrowUpRight,
  Sparkles,
  CreditCard,
} from 'lucide-react';
import { calculateDebtProgress, formatCurrency } from '../utils/debtEngine';

export default function HeroOverview({ debts, paymentLogs = [], result, onSelectTab }) {
  // Progress computed from REAL user data (payment logs), consistent across all pages
  const progress = calculateDebtProgress(debts, paymentLogs);
  const totalBalance = progress.totalRemaining;
  const originalBalanceTotal = progress.totalOriginal;
  const totalPaid = progress.totalPaid;
  const progressPercent = progress.progressPercent;
  const remainingPercent = Math.max(0, 100 - progressPercent);

  return (
    <div className="space-y-5 animate-fade-in mb-6">
      <div className="neenoi-hero bg-white p-6 rounded-2xl relative overflow-hidden shadow-md border border-indigo-100">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 relative z-10">
          <div className="space-y-4 flex-1">
            <span className="badge-gold">
              <Sparkles className="w-3.5 h-3.5 text-indigo-600" />
              เป้าหมายอิสรภาพทางการเงิน
            </span>

            <div className="space-y-2">
              <div className="flex justify-between items-end gap-4">
                <div>
                  <h2 className="text-xl font-black text-slate-900 tracking-tight">ความคืบหน้าการปลดหนี้รวม</h2>
                  <p className="text-xs text-slate-500 font-medium mt-1">ชำระแล้ว {formatCurrency(totalPaid)} จากยอดเริ่มต้น {formatCurrency(originalBalanceTotal)}</p>
                </div>
                <div className="text-right">
                  <span className="text-3xl font-black text-indigo-600 font-mono tracking-tight">{progressPercent}%</span>
                  <span className="block text-[11px] text-slate-500 font-bold">ชำระแล้ว</span>
                </div>
              </div>

              <div className="w-full h-5 bg-slate-100 rounded-full p-0.5 border border-slate-200/80 overflow-hidden shadow-inner" aria-label={`ชำระหนี้แล้ว ${progressPercent} เปอร์เซ็นต์`}>
                <div
                  className="h-full min-w-1 bg-gradient-to-r from-indigo-600 via-indigo-500 to-emerald-400 rounded-full transition-all duration-700 ease-out shadow-sm"
                  style={{ width: `${progressPercent}%` }}
                />
              </div>
              <div className="flex justify-between text-[11px] font-bold">
                <span className="text-emerald-600">ชำระแล้ว {progressPercent}%</span>
                <span className="text-slate-500">คงเหลือ {remainingPercent}%</span>
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-1">
              <div className="bg-emerald-50/70 p-3 rounded-xl border border-emerald-100">
                <div className="text-xs text-slate-500 font-medium">จ่ายหนี้ไปแล้ว</div>
                <div className="text-base font-extrabold text-emerald-600">{formatCurrency(totalPaid)}</div>
              </div>
              <div className="bg-indigo-50/70 p-3 rounded-xl border border-indigo-100">
                <div className="text-xs text-slate-500 font-medium">ยอดหนี้คงเหลือ</div>
                <div className="text-base font-extrabold text-indigo-600">{formatCurrency(totalBalance)}</div>
              </div>
              <div className="bg-slate-50 p-3 rounded-xl border border-slate-200">
                <div className="text-xs text-slate-500 font-medium flex items-center gap-1"><Clock className="w-3 h-3 text-indigo-600" />จะหมดในอีก</div>
                <div className="text-base font-extrabold text-slate-900">{result?.totalMonths || 0} เดือน</div>
              </div>
              <div className="bg-slate-50 p-3 rounded-xl border border-slate-200">
                <div className="text-xs text-slate-500 font-medium flex items-center gap-1"><TrendingDown className="w-3 h-3 text-indigo-600" />ประหยัดดอกเบี้ย</div>
                <div className="text-base font-extrabold text-indigo-600">{formatCurrency(result?.totalInterestSaved || 0)}</div>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:flex sm:flex-col gap-2.5 justify-center w-full lg:w-auto lg:min-w-[220px]">
            <button onClick={() => onSelectTab('payment_history')} className="btn-gold text-xs justify-center py-3 px-5 shadow-md shadow-indigo-500/20 font-extrabold cursor-pointer">
              <CreditCard className="w-4 h-4" />บันทึกชำระหนี้
            </button>
            <button onClick={() => onSelectTab('calculator')} className="btn-secondary text-xs justify-center py-2 px-4 cursor-pointer">
              ดูแผนการจ่ายเดือนนี้ <ArrowUpRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        <div className="absolute top-0 right-0 -mt-8 -mr-8 w-64 h-64 bg-indigo-500/5 rounded-full blur-3xl pointer-events-none" />
      </div>
    </div>
  );
}
