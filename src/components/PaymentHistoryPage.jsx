import React, { useState, useEffect } from 'react';
import { 
  CreditCard, 
  PlusCircle, 
  History, 
  CheckCircle2, 
  Clock, 
  TrendingDown, 
  Sparkles, 
  Calendar,
  Home,
  ChevronRight,
  Target,
  Zap,
  Check,
  Download
} from 'lucide-react';
import { calculateDebtPayoff, calculateDebtProgress, getFocusDebtId, formatCurrency, STRATEGIES_INFO } from '../utils/debtEngine';
import { exportPaymentHistoryToExcel } from '../utils/excelExport';

export default function PaymentHistoryPage({ 
  debts, 
  setDebts, 
  paymentLogs, 
  setPaymentLogs, 
  extraBudget,
  initialPaymentAmount = '',
  showToast,
  onBack,
  userName = 'User',
  manualStrategy = null
}) {
  // Calculate Payoff Result to identify the focus debt recommended by AI/Strategy
  // Uses the user's chosen pay method (manualStrategy) so the focus target matches it
  const result = calculateDebtPayoff(debts, extraBudget, manualStrategy);
  
  // Find the debt to focus on (first active debt in payoff order for the active strategy)
  const focusDebtId = getFocusDebtId(result, debts);

  const focusDebtObj = debts.find(d => d.id === focusDebtId);

  // Form State
  const [selectedDebtId, setSelectedDebtId] = useState(focusDebtId);
  const [paymentAmount, setPaymentAmount] = useState(initialPaymentAmount ? String(initialPaymentAmount) : '');
  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().split('T')[0]);
  const [paymentNote, setPaymentNote] = useState(initialPaymentAmount ? 'โปะหนี้ตามแผน AI' : 'ชำระค่างวดประจำเดือน');

  // Update selectedDebtId if focusDebtId changes
  useEffect(() => {
    if (focusDebtId) {
      setSelectedDebtId(focusDebtId);
    }
  }, [focusDebtId]);

  // Overall Payoff Calculations (REAL data from payment logs, consistent everywhere)
  const progress = calculateDebtProgress(debts, paymentLogs);
  const totalBalance = progress.totalRemaining;
  const originalBalanceTotal = progress.totalOriginal;
  const totalPaid = progress.totalPaid;
  
  const progressPercent = progress.progressPercent;

  // Handle Submit Payment Log
  const handleRecordPayment = (e) => {
    e.preventDefault();
    const amount = Number(paymentAmount);
    if (!selectedDebtId || !amount || amount <= 0) return;

    const targetDebt = debts.find(d => d.id === selectedDebtId);
    if (!targetDebt) return;

    const newBalance = Math.max(0, Number(targetDebt.balance) - amount);

    // Update debts list
    setDebts(debts.map(d => d.id === selectedDebtId ? {
      ...d,
      balance: newBalance
    } : d));

    // Add Log Entry
    const newLog = {
      id: `pay-${Date.now()}`,
      debtId: selectedDebtId,
      debtName: targetDebt.name,
      lender: targetDebt.lender,
      amountPaid: amount,
      previousBalance: targetDebt.balance,
      remainingBalance: newBalance,
      paymentDate: paymentDate || new Date().toISOString().split('T')[0],
      note: paymentNote || 'ชำระค่างวด'
    };

    setPaymentLogs([newLog, ...paymentLogs]);

    showToast(
      newBalance === 0 
        ? `🎉 ปิดหนี้สำเร็จ! บันทึกชำระ ${targetDebt.name} จำนวน ${formatCurrency(amount)} ปิดยอดหมดแล้ว!`
        : `✅ บันทึกชำระหนี้ ${targetDebt.name} จำนวน ${formatCurrency(amount)} เรียบร้อย (คงเหลือ ${formatCurrency(newBalance)})`
    );

    setPaymentAmount('');
    setPaymentNote('ชำระค่างวดประจำเดือน');
  };

  return (
    <div className="payment-page space-y-6 animate-fade-in pb-16">
      
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
          <CreditCard className="w-3.5 h-3.5" />
          บันทึกชำระหนี้ & ภาพรวมความสำเร็จ
        </span>
      </div>

      {/* SECTION 1: HERO PROGRESS BAR */}
      <div className="bg-white p-6 rounded-2xl relative overflow-hidden shadow-md border border-indigo-100 space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-100 pb-4">
          <div>
            <span className="badge-gold text-xs">
              <Sparkles className="w-3.5 h-3.5" />
              ภาพรวมความสำเร็จการปลดหนี้ (Financial Progress Summary)
            </span>
            <h1 className="text-2xl font-black text-slate-900 pt-1 flex items-center gap-2 tracking-tight">
              เป้าหมายอิสรภาพทางการเงิน
            </h1>
          </div>

          <div className="text-right">
            <span className="text-3xl font-black text-indigo-600 font-mono tracking-tight">{progressPercent}%</span>
            <span className="text-xs text-slate-500 font-semibold block">ชำระแล้วเสร็จ</span>
          </div>
        </div>

        {/* Visual Bar */}
        <div className="space-y-2">
          <div className="w-full h-5 bg-slate-100 rounded-full p-0.5 border border-slate-200 overflow-hidden relative shadow-inner">
            <div 
              className="h-full bg-gradient-to-r from-indigo-600 via-indigo-500 to-emerald-400 rounded-full transition-all duration-700 ease-out shadow-sm relative"
              style={{ width: `${Math.max(4, progressPercent)}%` }}
            >
              <div className="absolute inset-0 bg-white/20 animate-pulse-glow" />
            </div>
          </div>
        </div>

        {/* Hero Summary Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2">
          <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200/80">
            <span className="text-xs text-slate-500 font-medium block">• จ่ายหนี้ไปแล้ว</span>
            <span className="text-lg font-black text-emerald-600">{formatCurrency(totalPaid)}</span>
          </div>

          <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200/80">
            <span className="text-xs text-slate-500 font-medium block">• ยอดหนี้คงเหลือ</span>
            <span className="text-lg font-black text-indigo-600">{formatCurrency(totalBalance)}</span>
          </div>

          <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200/80">
            <span className="text-xs text-slate-500 font-medium flex items-center gap-1">
              <Calendar className="w-3.5 h-3.5 text-indigo-600" />
              วันปลดหนี้คงเหลือ
            </span>
            <span className="text-sm font-bold text-slate-900 block truncate" title={result.payoffDateStr}>
              {result.payoffDateStr}
            </span>
          </div>

          <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200/80">
            <span className="text-xs text-slate-500 font-medium flex items-center gap-1">
              <TrendingDown className="w-3.5 h-3.5 text-indigo-600" />
              ประหยัดดอกเบี้ยไปแล้ว
            </span>
            <span className="text-lg font-black text-indigo-600">
              {formatCurrency(result.totalInterestSaved)}
            </span>
          </div>
        </div>
      </div>

      {/* 🔥 HIGHLIGHT FOCUS DEBT BANNER */}
      {focusDebtObj && (
        <div className="bg-gradient-to-r from-indigo-50 via-white to-indigo-50/50 p-5 rounded-2xl border-2 border-indigo-500 shadow-md space-y-2 relative overflow-hidden">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 relative z-10">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-indigo-600 text-white flex items-center justify-center shadow-md animate-bounce">
                <Target className="w-6 h-6" />
              </div>
              <div>
                <span className="bg-indigo-600 text-white font-black text-[10px] px-2.5 py-0.5 rounded-full uppercase tracking-wider">
                  🎯 หนี้ที่ AI แนะนำให้โปะก่อน
                </span>
                <h2 className="text-lg font-extrabold text-slate-900 flex items-center gap-2 pt-0.5">
                  {focusDebtObj.name}
                  <span className="text-xs text-indigo-600 font-bold">({focusDebtObj.lender})</span>
                </h2>
              </div>
            </div>

            <div className="flex items-center gap-4 text-xs">
              <div className="bg-white px-3 py-2 rounded-xl border border-indigo-200 shadow-2xs">
                <span className="text-slate-500 block text-[10px] font-medium">ยอดคงเหลือที่ต้องเน้นโปะ:</span>
                <span className="text-indigo-600 font-black text-sm">{formatCurrency(focusDebtObj.balance)}</span>
              </div>
              <div className="bg-white px-3 py-2 rounded-xl border border-rose-200 shadow-2xs">
                <span className="text-slate-500 block text-[10px] font-medium">ดอกเบี้ย:</span>
                <span className="text-rose-600 font-black text-sm">{focusDebtObj.interestRate}%</span>
              </div>
            </div>
          </div>

          <p className="text-xs text-slate-600 pt-2 leading-relaxed border-t border-indigo-100 font-medium">
            💡 <strong>ทำไม AI ถึงเลือกก้อนนี้?</strong> เป้าหมาย {STRATEGIES_INFO[result.activeStrategyKey]?.outcomeLabel || result.activeStrategyName} แนะนำให้ทุ่มเงินโปะรายการนี้ก่อนรายการอื่น ๆ เพื่อลดดอกเบี้ยสะสมหรือปิดหนี้ให้เร็วที่สุด
          </p>

          <div className="absolute top-0 right-0 -mt-6 -mr-6 w-32 h-32 bg-indigo-500/5 rounded-full blur-2xl pointer-events-none" />
        </div>
      )}

      {/* SECTION 2: FORM - RECORD NEW PAYMENT */}
      <div className="bg-white p-6 rounded-2xl space-y-4 border border-slate-200 shadow-sm">
        <h3 className="text-base font-bold text-slate-900 flex items-center gap-2 border-b border-slate-100 pb-3">
          <PlusCircle className="w-5 h-5 text-indigo-600" />
          บันทึกการชำระหนี้ (Record Debt Payment)
        </h3>

        <form onSubmit={handleRecordPayment} className="grid grid-cols-1 md:grid-cols-4 gap-3 items-end">
          <div>
            <label className="text-xs font-bold text-slate-700 block mb-1 flex items-center justify-between">
              <span>เลือกรายการหนี้ *</span>
              {selectedDebtId === focusDebtId && (
                <span className="text-[10px] text-indigo-600 font-bold">🎯 หนี้ที่ AI แนะนำ</span>
              )}
            </label>
            <select
              value={selectedDebtId}
              onChange={(e) => setSelectedDebtId(e.target.value)}
              className={`input-dark font-semibold cursor-pointer ${
                selectedDebtId === focusDebtId ? 'border-indigo-500 text-indigo-700 bg-indigo-50/50' : 'text-slate-800'
              }`}
            >
              {debts.map(d => (
                <option key={d.id} value={d.id}>
                  {d.id === focusDebtId ? `🎯 ${d.name}` : d.name} (คงเหลือ: {formatCurrency(d.balance)})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-xs font-bold text-slate-700 block mb-1">จำนวนเงินที่จ่าย (บาท) *</label>
            <input
              type="number"
              placeholder="เช่น 3500"
              value={paymentAmount}
              onChange={(e) => setPaymentAmount(e.target.value)}
              className="input-dark font-black text-indigo-600 text-base"
              required
            />
          </div>

          <div>
            <label className="text-xs font-bold text-slate-700 block mb-1">วันที่จ่าย</label>
            <input
              type="date"
              value={paymentDate}
              onChange={(e) => setPaymentDate(e.target.value)}
              className="input-dark text-slate-800 font-medium"
            />
          </div>

          <div>
            <button
              type="submit"
              className="btn-gold text-xs py-2.5 w-full justify-center font-extrabold shadow-md cursor-pointer"
            >
              <CheckCircle2 className="w-4 h-4" />
              บันทึกชำระเงิน
            </button>
          </div>
        </form>
      </div>

      {/* SECTION 4: DEBT LIST STATUS */}
      <div className="bg-white p-6 rounded-2xl space-y-5 border border-slate-200 shadow-sm">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
              <CreditCard className="w-5 h-5 text-indigo-600" />
              สถานะหนี้แต่ละก้อน (DEBT LIST STATUS)
            </h3>
            <p className="text-xs text-slate-500 font-medium">แสดงผลลัพธ์เปอร์เซ็นต์การชำระ ยอดเดิม ยอดจ่ายแล้ว และยอดคงเหลือ</p>
          </div>
        </div>

        <div className="space-y-4">
          {debts.map((debt, index) => {
            const progressItem = progress.perDebt.find(p => p.debt.id === debt.id)
              || { original: Number(debt.balance), paid: 0, remaining: Number(debt.balance), percent: 0 };
            const original = progressItem.original;
            const currentBal = Number(debt.balance);
            const paidForThis = progressItem.paid;
            const itemPercent = progressItem.percent;
            const detail = result.debtPayoffDetails.find(d => d.id === debt.id);
            const isFocusTarget = debt.id === focusDebtId && currentBal > 0;

            let statusBadge = {
              text: '⚪ WAITING',
              bgColor: 'bg-slate-100 text-slate-600 border-slate-200',
              barColor: 'from-slate-400 to-slate-300'
            };

            if (currentBal <= 0) {
              statusBadge = {
                text: '🟢 CLOSED',
                bgColor: 'bg-emerald-50 text-emerald-700 border-emerald-200 font-extrabold',
                barColor: 'from-emerald-500 to-teal-400'
              };
            } else if (isFocusTarget) {
              statusBadge = {
                text: '🎯 หนี้เป้าหมาย (โปะก่อน)',
                bgColor: 'bg-indigo-600 text-white font-extrabold border-indigo-500 animate-pulse',
                barColor: 'from-indigo-600 via-indigo-500 to-emerald-400'
              };
            } else if (itemPercent > 0) {
              statusBadge = {
                text: '🟡 IN PROGRESS',
                bgColor: 'bg-indigo-50 text-indigo-700 border-indigo-200 font-bold',
                barColor: 'from-indigo-500 to-indigo-400'
              };
            }

            return (
              <div 
                key={debt.id}
                className={`p-4 rounded-2xl space-y-3 transition-all ${
                  isFocusTarget 
                    ? 'bg-indigo-50/60 border-2 border-indigo-500 shadow-md' 
                    : 'bg-slate-50/60 border border-slate-200 hover:border-slate-300'
                }`}
              >
                {/* Header Row */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div className="flex items-center gap-2.5">
                    <span className={`w-6 h-6 rounded-full text-xs font-extrabold flex items-center justify-center ${
                      isFocusTarget ? 'bg-indigo-600 text-white' : 'bg-indigo-50 text-indigo-600 border border-indigo-200'
                    }`}>
                      {index + 1}
                    </span>
                    <h4 className="font-bold text-slate-900 text-base flex items-center gap-2">
                      {debt.name}
                      {isFocusTarget && (
                        <span className="badge-gold text-[10px]">🔥 แนะนำโปะก่อน</span>
                      )}
                    </h4>
                    <span className="text-xs text-slate-500 font-medium">({debt.lender})</span>
                  </div>

                  <span className={`text-xs px-3 py-1 rounded-full border ${statusBadge.bgColor}`}>
                    {statusBadge.text} ({itemPercent}%)
                  </span>
                </div>

                {/* Progress Bar */}
                <div className="w-full h-3 bg-slate-200 rounded-full p-0.5 border border-slate-300/50 overflow-hidden">
                  <div 
                    className={`h-full bg-gradient-to-r ${statusBadge.barColor} rounded-full transition-all duration-500`}
                    style={{ width: `${Math.max(3, itemPercent)}%` }}
                  />
                </div>

                {/* Stat details */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs pt-1">
                  <div>
                    <span className="text-slate-500 font-medium block">ยอดเดิม:</span>
                    <span className="font-bold text-slate-800">{formatCurrency(original)}</span>
                  </div>

                  <div>
                    <span className="text-slate-500 font-medium block">ชำระแล้ว:</span>
                    <span className="font-black text-emerald-600">{formatCurrency(paidForThis)}</span>
                  </div>

                  <div>
                    <span className="text-slate-500 font-medium block">ยอดคงเหลือ:</span>
                    <span className="font-black text-indigo-600">{formatCurrency(currentBal)}</span>
                  </div>

                  <div>
                    <span className="text-slate-500 font-medium block">คาดว่าจะปิดได้:</span>
                    <span className="font-bold text-slate-900">เดือนที่ {detail?.paidOffMonth || '-'}</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* SECTION 5: PAYMENT LOGS HISTORY */}
      <div className="bg-white p-6 rounded-2xl space-y-4 border border-slate-200 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
            <History className="w-5 h-5 text-indigo-600" />
            ประวัติการบันทึกชำระหนี้ ({paymentLogs.length} รายการ)
          </h3>

          {paymentLogs.length > 0 && (
            <button
              onClick={() => exportPaymentHistoryToExcel(paymentLogs, userName)}
              className="btn-gold text-xs py-1.5 px-3.5 flex items-center gap-1.5 font-bold cursor-pointer shadow-xs"
            >
              <Download className="w-4 h-4" />
              ดาวน์โหลด Excel (Google Sheets Compatible)
            </button>
          )}
        </div>

        {paymentLogs.length === 0 ? (
          <div className="text-center py-8 text-slate-400 text-xs font-medium">
            ยังไม่มีประวัติการบันทึกชำระเงิน กดบันทึกการชำระหนี้ด้านบนเพื่อเริ่มสะสมประวัติ
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-slate-200 text-slate-500 font-bold uppercase tracking-wider bg-slate-50">
                  <th className="py-2.5 px-3">วันที่ชำระ</th>
                  <th className="py-2.5 px-3">รายการหนี้</th>
                  <th className="py-2.5 px-3 text-right">จำนวนเงินที่จ่าย</th>
                  <th className="py-2.5 px-3 text-right">คงเหลือหลังจ่าย</th>
                  <th className="py-2.5 px-3">หมายเหตุ</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700">
                {paymentLogs.map((log) => (
                  <tr key={log.id} className="hover:bg-slate-50 transition-colors">
                    <td className="py-3 px-3 text-slate-500 font-medium">{log.paymentDate}</td>
                    <td className="py-3 px-3 font-bold text-slate-900">{log.debtName}</td>
                    <td className="py-3 px-3 text-right font-black text-emerald-600">
                      +{formatCurrency(log.amountPaid)}
                    </td>
                    <td className="py-3 px-3 text-right font-extrabold text-indigo-600">
                      {formatCurrency(log.remainingBalance)}
                    </td>
                    <td className="py-3 px-3 text-slate-500 font-medium">{log.note}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

    </div>
  );
}
