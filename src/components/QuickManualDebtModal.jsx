import React, { useState, useEffect } from 'react';
import { 
  X, 
  Save, 
  Sparkles, 
  FileText, 
  PlusCircle, 
  Edit3, 
  AlertCircle, 
  CheckCircle2, 
  Loader2, 
  Building2, 
  CreditCard, 
  Calendar, 
  Percent, 
  Coins, 
  HelpCircle,
  Copy
} from 'lucide-react';
import { 
  BROAD_BANK_TYPES,
  mapToBroadBankType,
  parseDebtTextWithGemini 
} from '../services/geminiService';
import { formatCurrency, calculateDailyInterest } from '../utils/debtEngine';

export default function QuickManualDebtModal({ 
  isOpen = true, 
  editingDebt = null, 
  onSave, 
  onClose 
}) {
  const [activeTab, setActiveTab] = useState('manual'); // 'manual' | 'parser'
  
  // Form fields
  const [bankName, setBankName] = useState('หนี้ธนาคารพาณิชย์');
  const [customBankName, setCustomBankName] = useState('');
  const [debtName, setDebtName] = useState('');
  const [currentBalance, setCurrentBalance] = useState('');
  const [interestRatePercent, setInterestRatePercent] = useState('');
  const [minMonthlyPayment, setMinMonthlyPayment] = useState('');

  // Parser tab state
  const [rawText, setRawText] = useState('');
  const [isParsing, setIsParsing] = useState(false);
  const [parserSuccessMsg, setParserSuccessMsg] = useState('');

  // Validation state
  const [validationError, setValidationError] = useState('');
  const [wasParsedFromText, setWasParsedFromText] = useState(false);

  // Initialize form when editing
  useEffect(() => {
    if (editingDebt) {
      const bank = editingDebt.bank_name || editingDebt.lender || 'หนี้ธนาคารพาณิชย์';
      const mapped = mapToBroadBankType(bank);
      if (BROAD_BANK_TYPES.includes(mapped) && mapped !== 'หนี้อื่นๆ') {
        setBankName(mapped);
        setCustomBankName('');
      } else {
        setBankName('หนี้อื่นๆ');
        setCustomBankName(bank === 'หนี้อื่นๆ' ? '' : bank);
      }

      setDebtName(editingDebt.debt_name || editingDebt.name || '');
      setCurrentBalance(editingDebt.current_balance ?? editingDebt.balance ?? '');
      setInterestRatePercent(editingDebt.interest_rate_percent ?? editingDebt.interestRate ?? '');
      setMinMonthlyPayment(editingDebt.min_monthly_payment ?? editingDebt.minPayment ?? '');
      setActiveTab('manual');
    } else {
      // Reset form defaults for new debt
      setBankName('หนี้ธนาคารพาณิชย์');
      setCustomBankName('');
      setDebtName('');
      setCurrentBalance('');
      setInterestRatePercent('');
      setMinMonthlyPayment('');
      setRawText('');
      setParserSuccessMsg('');
      setValidationError('');
      setWasParsedFromText(false);
    }
  }, [editingDebt, isOpen]);

  // Auto-fill min payment preview if balance changes and min payment is empty
  const handleBalanceChange = (e) => {
    const val = e.target.value;
    setCurrentBalance(val);
    const num = parseFloat(val);
    if (!isNaN(num) && num > 0 && !minMonthlyPayment) {
      setMinMonthlyPayment(String(Math.round(num * 0.05)));
    }
  };

  // Handle Copy-Paste Text Parser via Gemini API
  const handleParseText = async () => {
    if (!rawText || !rawText.trim()) {
      setValidationError('กรุณาวางข้อความ e-Statement ก่อนสกัดข้อมูล');
      return;
    }

    setIsParsing(true);
    setValidationError('');
    setParserSuccessMsg('');

    try {
      const parsed = await parseDebtTextWithGemini(rawText);

      // Populate form fields
      if (parsed.bank_name) {
        const mapped = mapToBroadBankType(parsed.bank_name);
        setBankName(mapped);
        if (mapped === 'หนี้อื่นๆ') {
          setCustomBankName(parsed.bank_name);
        } else {
          setCustomBankName('');
        }
      }

      if (parsed.debt_name) {
        setDebtName(parsed.debt_name);
      } else if (parsed.debt_type) {
        setDebtName(`${parsed.debt_type} (${parsed.bank_name || 'ธนาคาร'})`);
      }
      if (parsed.current_balance) setCurrentBalance(String(parsed.current_balance));
      if (parsed.interest_rate_percent !== undefined) setInterestRatePercent(String(parsed.interest_rate_percent));
      if (parsed.min_monthly_payment) setMinMonthlyPayment(String(parsed.min_monthly_payment));

      setWasParsedFromText(true);
      setParserSuccessMsg('✨ AI สกัดข้อมูลจากข้อความสำเร็จแล้ว! ระบบสลับไปหน้าฟอร์มเพื่อให้คุณตรวจสอบเรียบร้อยแล้ว');
      setActiveTab('manual');
    } catch (err) {
      console.error('Failed to parse text:', err);
      setValidationError(`เกิดข้อผิดพลาดในการสกัดข้อมูล: ${err.message}`);
    } finally {
      setIsParsing(false);
    }
  };

  // Validate form submission
  const handleSubmit = (e) => {
    e.preventDefault();
    setValidationError('');

    const effectiveBankName = bankName === 'หนี้อื่นๆ' ? (customBankName.trim() || 'หนี้อื่นๆ') : bankName;
    const effectiveDebtName = debtName.trim() || `รายการหนี้ (${effectiveBankName})`;
    const balanceNum = parseFloat(currentBalance);
    const rateNum = parseFloat(interestRatePercent);
    const minPayNum = parseFloat(minMonthlyPayment);

    // Client-side Validation Rules
    if (!effectiveBankName) {
      setValidationError('กรุณาระบุสถาบันการเงิน / ประเภทเจ้าหนี้');
      return;
    }

    if (!effectiveDebtName) {
      setValidationError('กรุณาระบุชื่อรายการหนี้');
      return;
    }

    if (isNaN(balanceNum) || balanceNum <= 0) {
      setValidationError('ยอดหนี้คงเหลือปัจจุบันต้องมากกว่า 0 บาท');
      return;
    }

    if (isNaN(rateNum) || rateNum < 0) {
      setValidationError('อัตราดอกเบี้ยต้องไม่ติดลบ (0% ขึ้นไป)');
      return;
    }

    if (isNaN(minPayNum) || minPayNum <= 0) {
      setValidationError('ยอดชำระขั้นต่ำต่อเดือนต้องมากกว่า 0 บาท');
      return;
    }

    // Submit validated payload
    const debtPayload = {
      id: editingDebt?.id || `debt-${Date.now()}`,
      bank_name: effectiveBankName,
      creditor: effectiveBankName,
      lender: effectiveBankName,
      debt_name: effectiveDebtName,
      name: effectiveDebtName,
      debt_type: editingDebt?.debt_type || 'ทั่วไป',
      category: editingDebt?.category || 'general',
      current_balance: balanceNum,
      balance: balanceNum,
      interest_rate_percent: rateNum,
      interestRate: rateNum,
      min_monthly_payment: minPayNum,
      minPayment: minPayNum,
      due_day: editingDebt?.due_day || 15,
      dueDate: editingDebt?.dueDate || '15 ของทุกเดือน',
      entry_method: editingDebt ? (editingDebt.entry_method || 'manual') : (wasParsedFromText ? 'copy_paste' : 'manual'),
      isScanned: editingDebt?.isScanned || false
    };

    onSave(debtPayload);
    onClose();
  };

  if (!isOpen) return null;

  // Monthly interest estimate preview (daily-compounded formula)
  const today = new Date();
  const daysInCurrentMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();
  const estimatedMonthlyInterest = currentBalance && interestRatePercent
    ? Math.round(calculateDailyInterest(currentBalance, interestRatePercent, daysInCurrentMonth))
    : 0;

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center z-50 p-3 sm:p-4 animate-fade-in overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full border border-slate-200 overflow-hidden my-auto max-h-[92vh] flex flex-col">
        
        {/* Modal Header */}
        <div className="flex items-center justify-between p-4 sm:p-5 border-b border-slate-100 bg-slate-50/80">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-600 flex items-center justify-center text-white shadow-md">
              {editingDebt ? <Edit3 className="w-5 h-5" /> : <PlusCircle className="w-5 h-5" />}
            </div>
            <div>
              <h2 className="text-lg font-black text-slate-900 flex items-center gap-2 tracking-tight">
                {editingDebt ? `แก้ไขข้อมูลหนี้: ${editingDebt.name || editingDebt.debt_name}` : '+ เพิ่มรายการหนี้ (Add Debt)'}
              </h2>
              <p className="text-xs text-slate-500 font-medium">
                {editingDebt ? 'อัปเดตรายละเอียดหนี้เพื่อคำนวณแผนการโปะใหม่' : 'กรอกข้อมูลฟอร์ม e-Statement หรือคัดลอกข้อความวางให้ AI ช่วยสกัด'}
              </p>
            </div>
          </div>
          
          <button
            onClick={onClose}
            className="p-2 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-200/60 transition-colors cursor-pointer"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Toggle Navigation */}
        <div className="flex border-b border-slate-200 bg-slate-100/50 p-1.5 gap-1 text-xs font-bold">
          <button
            type="button"
            onClick={() => setActiveTab('manual')}
            className={`flex-1 py-2.5 px-3 rounded-xl flex items-center justify-center gap-2 transition-all cursor-pointer ${
              activeTab === 'manual'
                ? 'bg-white text-indigo-600 shadow-sm border border-slate-200 font-extrabold'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/50'
            }`}
          >
            <Building2 className="w-4 h-4" />
            <span>กรอกข้อมูลเอง (Quick Manual Form)</span>
          </button>
          
          <button
            type="button"
            onClick={() => setActiveTab('parser')}
            className={`flex-1 py-2.5 px-3 rounded-xl flex items-center justify-center gap-2 transition-all cursor-pointer ${
              activeTab === 'parser'
                ? 'bg-gradient-to-r from-indigo-600 to-purple-600 text-white shadow-sm font-extrabold'
                : 'text-slate-600 hover:text-indigo-600 hover:bg-slate-200/50'
            }`}
          >
            <Sparkles className="w-4 h-4 text-amber-300" />
            <span>คัดลอกข้อความวาง (Text Parser)</span>
          </button>
        </div>

        {/* Success Alert Banner */}
        {parserSuccessMsg && (
          <div className="bg-emerald-50 border-b border-emerald-200 p-3 px-5 flex items-center gap-2.5 text-xs text-emerald-800 font-semibold">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0" />
            <span>{parserSuccessMsg}</span>
          </div>
        )}

        {/* Validation Error Alert Banner */}
        {validationError && (
          <div className="bg-rose-50 border-b border-rose-200 p-3 px-5 flex items-center gap-2.5 text-xs text-rose-800 font-bold">
            <AlertCircle className="w-4 h-4 text-rose-600 flex-shrink-0" />
            <span>{validationError}</span>
          </div>
        )}

        {/* Modal Content Body */}
        <div className="p-5 sm:p-6 overflow-y-auto space-y-5 flex-1">
          
          {/* TAB 1: Quick Manual Form */}
          {activeTab === 'manual' && (
            <form id="quick-debt-form" onSubmit={handleSubmit} className="space-y-4">
              
              {/* Row 1: Simplified Bank Category */}
              <div>
                <label className="text-xs font-bold text-slate-700 flex items-center gap-1.5 mb-1.5">
                  <Building2 className="w-3.5 h-3.5 text-indigo-600" />
                  ประเภทสถาบันการเงิน / เจ้าหนี้
                </label>
                <select
                  value={bankName}
                  onChange={(e) => setBankName(e.target.value)}
                  className="input-dark text-slate-900 font-semibold text-xs"
                  required
                >
                  {BROAD_BANK_TYPES.map((b) => (
                    <option key={b} value={b}>{b}</option>
                  ))}
                </select>

                {/* Custom Bank Name Input if "หนี้อื่นๆ" is selected */}
                {bankName === 'หนี้อื่นๆ' && (
                  <input
                    type="text"
                    placeholder="ระบุชื่อสถาบันการเงิน / เจ้าหนี้เพิ่มเติม (ถ้ามี)..."
                    value={customBankName}
                    onChange={(e) => setCustomBankName(e.target.value)}
                    className="input-dark text-slate-900 font-medium text-xs mt-2"
                  />
                )}
              </div>

              {/* Row 2: Debt Name */}
              <div>
                <label className="text-xs font-bold text-slate-700 flex items-center justify-between mb-1.5">
                  <span className="flex items-center gap-1.5">
                    <FileText className="w-3.5 h-3.5 text-indigo-600" />
                    ชื่อรายการหนี้
                  </span>
                  <span className="text-[11px] text-slate-400 font-normal">เช่น 'บัตรเครดิต K-Bank', 'สินเชื่อส่วนบุคคล'</span>
                </label>
                <input
                  type="text"
                  placeholder="เช่น บัตรเครดิต K-Bank หรือ สินเชื่อส่วนบุคคล"
                  value={debtName}
                  onChange={(e) => setDebtName(e.target.value)}
                  className="input-dark text-slate-900 font-semibold text-sm"
                  required
                />
              </div>

              {/* Row 3: Current Balance & Interest Rate */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                
                {/* Current Balance */}
                <div>
                  <label className="text-xs font-bold text-slate-700 flex items-center gap-1.5 mb-1.5">
                    <Coins className="w-3.5 h-3.5 text-indigo-600" />
                    ยอดหนี้คงเหลือรวม
                  </label>
                  <div className="relative">
                    <input
                      type="number"
                      step="any"
                      placeholder="เช่น 45000"
                      value={currentBalance}
                      onChange={handleBalanceChange}
                      className="input-dark text-indigo-600 font-black text-base pr-10"
                      required
                    />
                    <span className="absolute right-3 top-2.5 text-xs text-slate-400 font-bold">บาท</span>
                  </div>
                </div>

                {/* Annual Interest Rate (%) */}
                <div>
                  <label className="text-xs font-bold text-slate-700 flex items-center gap-1.5 mb-1.5">
                    <Percent className="w-3.5 h-3.5 text-rose-600" />
                    อัตราดอกเบี้ยต่อปี
                  </label>
                  <div className="relative">
                    <input
                      type="number"
                      step="0.01"
                      placeholder="เช่น 16.0 หรือ 24.5"
                      value={interestRatePercent}
                      onChange={(e) => setInterestRatePercent(e.target.value)}
                      className="input-dark text-rose-600 font-black text-base pr-10"
                      required
                    />
                    <span className="absolute right-3 top-2.5 text-xs text-slate-400 font-bold">%</span>
                  </div>
                </div>

              </div>

              {/* Row 4: Minimum Payment */}
              <div>
                <label className="text-xs font-bold text-slate-700 flex items-center justify-between mb-1.5">
                  <span className="flex items-center gap-1.5">
                    <Coins className="w-3.5 h-3.5 text-blue-600" />
                    ค่างวดขั้นต่ำต่อเดือน
                  </span>
                </label>
                <div className="relative">
                  <input
                    type="number"
                    step="any"
                    placeholder="เช่น 2200"
                    value={minMonthlyPayment}
                    onChange={(e) => setMinMonthlyPayment(e.target.value)}
                    className="input-dark font-extrabold text-slate-900 text-sm pr-10"
                    required
                  />
                  <span className="absolute right-3 top-2.5 text-xs text-slate-400 font-bold">บาท</span>
                </div>
              </div>

              {/* Real-Time Monthly Interest Calculation Preview (Daily Compounding) */}
              {currentBalance && interestRatePercent && estimatedMonthlyInterest > 0 && (
                <div className="bg-indigo-50/80 border border-indigo-200 rounded-xl p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-1 text-xs">
                  <div className="flex items-center gap-2 text-indigo-800 font-semibold">
                    <AlertCircle className="w-4 h-4 text-indigo-600 flex-shrink-0" />
                    <span>ประมาณการดอกเบี้ยรายวันสะสมในเดือนนี้ ({daysInCurrentMonth} วัน):</span>
                  </div>
                  <span className="font-black text-rose-600 text-sm">
                    ~ {formatCurrency(estimatedMonthlyInterest)} / เดือน
                  </span>
                </div>
              )}

            </form>
          )}

          {/* TAB 2: Copy-Paste Text Parser */}
          {activeTab === 'parser' && (
            <div className="space-y-4">
              
              <div className="bg-indigo-50/70 border border-indigo-100 rounded-xl p-4 text-xs text-indigo-900 space-y-1">
                <h4 className="font-extrabold flex items-center gap-1.5 text-indigo-950">
                  <Copy className="w-4 h-4 text-indigo-600" />
                  วิธีใช้งานคัดลอกข้อความวาง (Copy-Paste Text Parser):
                </h4>
                <p className="text-slate-600 leading-relaxed">
                  คัดลอกข้อความแจ้งยอด e-Statement หรืออีเมลสรุปยอดหนี้จากธนาคาร เช่น "เรียน คุณสมชาย ยอดรวมชำระ 45,000 บาท ดอกเบี้ย 16% ชำระขั้นต่ำ 2,200 บาท วันครบกำหนด 15" แล้ววางในช่องด้านล่าง AI จะวิเคราะห์สกัดข้อมูลลงฟอร์มให้อัตโนมัติ
                </p>
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1.5">
                  ข้อความดิบ e-Statement / อีเมลแจ้งยอดหนี้
                </label>
                <textarea
                  rows={6}
                  placeholder="วางข้อความ e-Statement ที่นี่..."
                  value={rawText}
                  onChange={(e) => setRawText(e.target.value)}
                  className="input-dark text-xs font-mono p-3 leading-relaxed w-full focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={handleParseText}
                  disabled={isParsing || !rawText.trim()}
                  className="btn-gold text-xs py-2.5 px-5 flex items-center gap-2 font-extrabold shadow-md disabled:opacity-50 cursor-pointer"
                >
                  {isParsing ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Gemini AI กำลังสกัดข้อมูล...</span>
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-4 h-4 text-amber-950" />
                      <span>⚡ สกัดข้อมูลด้วย Gemini AI</span>
                    </>
                  )}
                </button>
              </div>

            </div>
          )}

        </div>

        {/* Modal Footer Controls */}
        <div className="p-4 sm:p-5 border-t border-slate-200 bg-slate-50 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={onClose}
            className="btn-secondary text-xs px-4 py-2.5 font-semibold cursor-pointer"
          >
            ยกเลิก
          </button>

          {activeTab === 'manual' && (
            <button
              type="submit"
              form="quick-debt-form"
              className="btn-gold text-xs px-6 py-2.5 flex items-center gap-2 font-black shadow-md cursor-pointer"
            >
              <Save className="w-4 h-4" />
              <span>{editingDebt ? 'บันทึกการแก้ไข' : 'บันทึกหนี้ใหม่'}</span>
            </button>
          )}
        </div>

      </div>
    </div>
  );
}
