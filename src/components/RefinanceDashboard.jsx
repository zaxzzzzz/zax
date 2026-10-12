import React, { useState, useMemo, useEffect } from 'react';
import {
  Home,
  ChevronRight,
  Landmark,
  RefreshCw,
  Sparkles,
  Info,
  Briefcase,
  Banknote,
  Wallet,
  ShieldCheck,
  Percent,
  Target,
  Building2,
  ExternalLink,
  AlertTriangle,
  Trophy
} from 'lucide-react';
import { formatBaht, OCCUPATIONS } from '../utils/refinanceCalculator';
import { getPromotions, getOccupations, PROPERTY_TYPES } from '../services/refinancePromotionService';
import { findBestMatch, hasUsableBestMatch } from '../utils/bestMatchEngine';
import BankLogo from './BankLogo';
import FormattedNumberInput from './FormattedNumberInput';
import { getBankShort } from '../utils/promotionSync';
import {
  fetchRefinanceSettingsFromCloud,
  saveRefinanceSettingsToCloud,
  subscribeToRefinanceSettings
} from '../services/supabaseService';

const STORAGE_KEY = (userName) => `nee_noi_refinance_form_v3_${userName}`;

/** Icons for the property type chips. */
const PROPERTY_TYPE_ICONS = {
  'บ้านเดี่ยว': '🏡',
  'ทาวน์เฮาส์': '🏘️',
  'คอนโด': '🏢',
  'อาคารพาณิชย์': '🏬',
  'ที่ดินพร้อมสิ่งปลูกสร้าง': '🌾'
};

/** MRTA option chips. */
const MRTA_OPTIONS = [
  { value: true, label: '✅ ทำ MRTA', desc: 'เปิดสิทธิ์โปรโมชันอัตราดอกเบี้ยที่ต้องทำประกัน' },
  { value: false, label: '❌ ไม่ทำ MRTA', desc: 'เลือกเฉพาะแพ็กเกจที่ไม่บังคับทำประกัน' }
];

/**
 * RefinanceDashboard — Single-Page Refinance Form (spec v2)
 *
 * Field order (top to bottom):
 *   1. Select existing home loan  (dropdown: A/B balance, remaining tenure, current rate)
 *   2. Select occupation          (from master data)
 *   3. Monthly income
 *   4. Top-up / cash-out          → target_loan_amount = balance + top-up
 *   5. MRTA option                [Yes / No]
 *   → Smart Best-Match: single recommendation card with external redirect.
 */
export default function RefinanceDashboard({ userName = 'User', onBack, ocrDebts = [] }) {
  // ---------- Home loans detected from the user's debt list ----------
  const homeLoans = useMemo(() => {
    const isHomeLoan = (d) => {
      if (d.debtCategory === 'HOME_LOAN') return true;
      if (d.category === 'mortgage') return true;
      const txt = `${d.name || ''} ${d.lender || ''}`.toLowerCase();
      return txt.includes('บ้าน') || txt.includes('home') || txt.includes('สินเชื่อบ้าน') || txt.includes('จำนอง');
    };
    return (ocrDebts || []).filter(isHomeLoan);
  }, [ocrDebts]);

  // ---------- Single-page form state ----------
  const [form, setForm] = useState(() => {
    const saved = localStorage.getItem(STORAGE_KEY(userName));
    if (saved) {
      try { return JSON.parse(saved); } catch (e) { /* ignore */ }
    }
    const firstLoan = null;
    return {
      selectedHomeLoanId: firstLoan?.id || '',
      existingBalance: 1000000,
      remainingTenureMonths: 180,
      currentRate: 6.0,
      propertyType: 'บ้านเดี่ยว',
      propertyValue: 0,
      occupation: 'salaried',
      customOccupation: '',
      monthlyIncome: 30000,
      topUpAmount: 0,
      wantMRTA: true
    };
  });

  // Auto-select the first detected home loan & sync its numbers
  useEffect(() => {
    if (homeLoans.length === 0) return;
    setForm(prev => {
      const alreadyValid = prev.selectedHomeLoanId && homeLoans.some(l => l.id === prev.selectedHomeLoanId);
      const loan = alreadyValid ? homeLoans.find(l => l.id === prev.selectedHomeLoanId) : homeLoans[0];
      const balance = Number(loan.totalBalance || loan.balance || 0);
      const rate = Number(loan.interestRate || loan.rate || 0);
      return {
        ...prev,
        selectedHomeLoanId: loan.id,
        existingBalance: balance > 0 ? balance : prev.existingBalance,
        currentRate: rate > 0 ? rate : prev.currentRate
      };
    });
  }, [homeLoans]);

  // Load from Supabase Cloud DB & setup Realtime sync
  useEffect(() => {
    let active = true;
    async function loadCloudSettings() {
      const cloudSettings = await fetchRefinanceSettingsFromCloud(userName);
      if (cloudSettings && active) {
        setForm(cloudSettings);
      }
    }
    loadCloudSettings();

    const unsubscribe = subscribeToRefinanceSettings(userName, (newCloudForm) => {
      if (active && newCloudForm) {
        setForm(newCloudForm);
      }
    });

    return () => {
      active = false;
      unsubscribe();
    };
  }, [userName]);

  // Persist form to LocalStorage & Supabase Cloud DB
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY(userName), JSON.stringify(form));
    saveRefinanceSettingsToCloud(userName, form);
  }, [form, userName]);

  // ---------- Master data (occupations + promotions) ----------
  const [occupations, setOccupations] = useState([]);
  const [promotions, setPromotions] = useState([]);
  const [loadingData, setLoadingData] = useState(true);
  const [dataError, setDataError] = useState('');
  const [isRefreshing, setIsRefreshing] = useState(false);

  const loadMasterData = async (showSpinner = false) => {
    if (showSpinner) setIsRefreshing(true);
    setLoadingData(true);
    try {
      const [occ, promos] = await Promise.all([getOccupations(), getPromotions()]);
      setOccupations(occ);
      setPromotions(promos);
      setDataError('');
    } catch (err) {
      setDataError(err.message || 'โหลดข้อมูลไม่สำเร็จ');
    } finally {
      setLoadingData(false);
      if (showSpinner) setIsRefreshing(false);
    }
  };

  useEffect(() => { loadMasterData(false); }, []);

  // Selected home loan object (for the picker metadata display)
  const selectedLoan = useMemo(
    () => homeLoans.find(l => l.id === form.selectedHomeLoanId) || null,
    [homeLoans, form.selectedHomeLoanId]
  );

  // Occupation dropdown options from master data (fallback to engine keys)
  const occupationOptions = useMemo(() => {
    const usable = (occupations || []).filter(o => o.allowed !== false);
    if (usable.length === 0) {
      return OCCUPATIONS.map(key => ({ key, label: key }));
    }
    return usable.map(o => ({ key: o.key || o.id, label: o.label || o.labelEn || o.key }));
  }, [occupations]);

  const selectedOccupationLabel = useMemo(() => {
    const found = occupationOptions.find(o => o.key === form.occupation);
    if (found) return found.label;
    return form.occupation === 'other' && form.customOccupation ? form.customOccupation : (form.occupation || '-');
  }, [occupationOptions, form.occupation, form.customOccupation]);

  // ---------- SMART BEST-MATCH (single recommendation) ----------
  const bestMatch = useMemo(() => {
    const income = Number(form.monthlyIncome) || 0;
    const balance = Number(form.existingBalance) || 0;
    if (income <= 0 || balance <= 0 || promotions.length === 0) return null;
    return findBestMatch({
      promotions,
      propertyType: form.propertyType || '',
      existingBalance: balance,
      topUpAmount: Number(form.topUpAmount) || 0,
      propertyValue: Number(form.propertyValue) || 0,
      currentRate: Number(form.currentRate) || 0,
      monthlyIncome: income,
      occupation: form.occupation,
      wantMRTA: Boolean(form.wantMRTA)
    });
  }, [form.monthlyIncome, form.existingBalance, form.topUpAmount, form.propertyType, form.propertyValue, form.currentRate, form.occupation, form.wantMRTA, promotions]);

  const best = bestMatch?.best || null;
  const showBestCard = hasUsableBestMatch(bestMatch);

  // ---------- Manual-empty-form fallback (parse failure / no match) ----------
  const [manualMode, setManualMode] = useState(false);

  // Validation summary state
  const [error, setError] = useState('');

  const handleHomeLoanSelect = (loanId) => {
    const loan = homeLoans.find(l => l.id === loanId);
    setForm(prev => ({
      ...prev,
      selectedHomeLoanId: loanId,
      existingBalance: Number(loan?.totalBalance || loan?.balance || 0) || prev.existingBalance,
      currentRate: Number(loan?.interestRate || loan?.rate || 0) || prev.currentRate
    }));
  };

  // ---------- Render ----------
  return (
    <div className="ref-page space-y-6 animate-fade-in pb-16">

      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-xs text-slate-500 font-medium">
        <button onClick={onBack} className="flex items-center gap-1 hover:text-indigo-600 transition-colors cursor-pointer">
          <Home className="w-3.5 h-3.5" />
          <span>หน้าหลัก</span>
        </button>
        <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
        <span className="text-indigo-600 font-bold flex items-center gap-1.5 bg-indigo-50 px-2.5 py-0.5 rounded-full border border-indigo-200">
          <Landmark className="w-3.5 h-3.5" />
          รีไฟแนนซ์บ้าน — จับคู่แพ็กเกจที่คุ้มที่สุดให้คุณ
        </span>
      </div>

      {/* Header */}
      <div className="bg-white p-6 rounded-2xl border border-indigo-100 shadow-md relative overflow-hidden">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 relative z-10">
          <div>
            <span className="badge-gold">
              <Sparkles className="w-3.5 h-3.5 text-indigo-600" />
              Smart Best-Match Refinance
            </span>
            <h1 className="text-2xl font-black text-slate-900 pt-2 tracking-tight">
              รีไฟแนนซ์บ้าน — กรอกครั้งเดียว จบในหน้าเดียว
            </h1>
            <p className="text-xs text-slate-500 font-medium mt-1 max-w-xl leading-relaxed">
              ระบบจะกรองโปรโมชันที่คุณผ่านเกณฑ์ (รายได้ • วงเงิน • MRTA) แล้วแนะนำแพ็กเกจที่ประหยัดสุทธิสูงสุดเพียงแพ็กเกจเดียว
              พร้อมปุ่มไปที่เว็บไซต์ธนาคารโดยตรง
            </p>
          </div>
          <div className="flex items-center gap-2 text-[11px] bg-indigo-50/70 border border-indigo-100 rounded-xl px-3 py-2 text-indigo-700 font-bold">
            <Info className="w-3.5 h-3.5" />
            โปรโมชันในระบบ {promotions.length} แพ็กเกจ
            <button
              onClick={() => loadMasterData(true)}
              disabled={isRefreshing}
              className="ml-1 flex items-center gap-1 px-2 py-1 rounded bg-indigo-600 hover:bg-indigo-700 text-white transition-all cursor-pointer disabled:opacity-50"
              title="ดึงข้อมูลโปรโมชันล่าสุดจากฐานข้อมูลแอดมิน"
            >
              <RefreshCw className={`w-3 h-3 ${isRefreshing ? 'animate-spin' : ''}`} />
              รีเฟรช
            </button>
          </div>
        </div>
      </div>

      {/* ============ SINGLE-PAGE FORM ============ */}
      <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-5">
        <h2 className="text-base font-black text-slate-900 flex items-center gap-2 border-b border-slate-100 pb-3">
          <Wallet className="w-5 h-5 text-indigo-600" />
          ข้อมูลสำหรับคำนวณรีไฟแนนซ์
        </h2>

        {/* 1. Select existing home loan */}
        <div>
          <label className="block text-xs font-bold text-slate-700 mb-1.5 flex items-center gap-1.5">
            <span className="w-5 h-5 rounded-full bg-indigo-600 text-white text-[10px] font-black flex items-center justify-center">1</span>
            เลือกหนี้บ้านที่มีอยู่ (Existing Home Loan)
          </label>
          {homeLoans.length > 0 ? (
            <>
              <select
                value={form.selectedHomeLoanId}
                onChange={(e) => handleHomeLoanSelect(e.target.value)}
                className="input-dark text-sm cursor-pointer w-full"
              >
                {homeLoans.map(loan => (
                  <option key={loan.id} value={loan.id}>
                    {loan.name || loan.lender || 'สินเชื่อบ้าน'} — {Number(loan.totalBalance || loan.balance || 0).toLocaleString()} ฿ @ {Number(loan.interestRate || loan.rate || 0)}%
                  </option>
                ))}
                <option value="">— ไม่เลือก (กรอกเองด้านล่าง) —</option>
              </select>
              {selectedLoan && (
                <div className="grid grid-cols-3 gap-2 mt-2">
                  <div className="bg-indigo-50/70 border border-indigo-100 rounded-xl p-2.5">
                    <div className="text-[10px] text-slate-500 font-bold">ยอดคงเหลือ (Balance)</div>
                    <div className="text-sm font-black text-indigo-700">฿{Number(selectedLoan.totalBalance || selectedLoan.balance || 0).toLocaleString()}</div>
                  </div>
                  <div className="bg-indigo-50/70 border border-indigo-100 rounded-xl p-2.5">
                    <div className="text-[10px] text-slate-500 font-bold">ดอกเบี้ยปัจจุบัน</div>
                    <div className="text-sm font-black text-rose-600">{Number(selectedLoan.interestRate || selectedLoan.rate || 0)}% / ปี</div>
                  </div>
                  <div className="bg-indigo-50/70 border border-indigo-100 rounded-xl p-2.5">
                    <div className="text-[10px] text-slate-500 font-bold">ผ่อนคงเหลือ</div>
                    <div className="text-sm font-black text-amber-600">
                      {Number(selectedLoan.tenureMonths || selectedLoan.remainingMonths || form.remainingTenureMonths || 0).toLocaleString()} เดือน
                    </div>
                  </div>
                </div>
              )}
            </>
          ) : (
            <p className="text-[11px] text-slate-400 font-medium bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5">
              ยังไม่พบหนี้บ้านในระบบ — กรอกยอดหนี้และดอกเบี้ยปัจจุบันด้านล่างได้เลย หรือเพิ่มหนี้บ้านผ่านหน้า "สแกนใบแจ้งหนี้"
            </p>
          )}
        </div>

        {/* Property type (strict matching input) */}
        <div>
          <label className="block text-xs font-bold text-slate-700 mb-1.5 flex items-center gap-1.5">
            <span className="w-5 h-5 rounded-full bg-indigo-600 text-white text-[10px] font-black flex items-center justify-center">🏠</span>
            ประเภทหลักประกัน (Property Type) — ใช้จับคู่เงื่อนไขธนาคารแบบเข้มงวด
          </label>
          <div className="flex flex-wrap gap-2">
            {PROPERTY_TYPES.map(type => {
              const selected = form.propertyType === type;
              return (
                <button
                  key={type}
                  type="button"
                  onClick={() => setForm({ ...form, propertyType: type })}
                  className={`text-xs font-bold px-3.5 py-2 rounded-xl border-2 transition-all cursor-pointer ${
                    selected
                      ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm'
                      : 'bg-white text-slate-600 border-slate-200 hover:border-indigo-300'
                  }`}
                >
                  {PROPERTY_TYPE_ICONS[type] || '🏠'} {type}
                </button>
              );
            })}
          </div>
          {/* Optional property value for the LTV gate */}
          <div className="mt-2 max-w-xs">
            <label className="block text-[11px] font-bold text-slate-500 mb-1">
              มูลค่าประเมินทรัพย์ (ถ้าทราบ) — ใช้ตรวจเงื่อนไข LTV
            </label>
            <FormattedNumberInput
              value={form.propertyValue || 0}
              onChange={(v) => setForm({ ...form, propertyValue: v })}
              min={0}
              prefix="฿"
              placeholder="เช่น 2,500,000"
              className="[&_input]:input-dark [&_input]:text-sm [&_input]:font-bold"
            />
          </div>
        </div>

        {/* Balance / rate / tenure (editable, synced from selected loan) */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">ยอดหนี้บ้านคงเหลือ (บาท)</label>
            <FormattedNumberInput
              value={form.existingBalance || 0}
              onChange={(v) => setForm({ ...form, existingBalance: v })}
              min={0}
              prefix="฿"
              placeholder="1,000,000"
              className="[&_input]:input-dark [&_input]:text-sm [&_input]:font-bold [&_input]:text-indigo-600"
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">ดอกเบี้ยปัจจุบัน (% ต่อปี)</label>
            <FormattedNumberInput
              value={form.currentRate || 0}
              onChange={(v) => setForm({ ...form, currentRate: v })}
              min={0}
              step={0.01}
              suffix="%"
              placeholder="6.0"
              className="[&_input]:input-dark [&_input]:text-sm [&_input]:font-bold [&_input]:text-rose-600"
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">ระยะเวลาผ่อนคงเหลือ (เดือน)</label>
            <FormattedNumberInput
              value={form.remainingTenureMonths || 0}
              onChange={(v) => setForm({ ...form, remainingTenureMonths: v })}
              min={1}
              suffix="เดือน"
              placeholder="180"
              className="[&_input]:input-dark [&_input]:text-sm [&_input]:font-bold [&_input]:text-amber-600"
            />
          </div>
        </div>

        {/* 2. Occupation (master data) */}
        <div>
          <label className="block text-xs font-bold text-slate-700 mb-1.5 flex items-center gap-1.5">
            <span className="w-5 h-5 rounded-full bg-indigo-600 text-white text-[10px] font-black flex items-center justify-center">2</span>
            <Briefcase className="w-3.5 h-3.5 text-indigo-600" />
            อาชีพ (จากข้อมูล Master)
          </label>
          <select
            value={form.occupation}
            onChange={(e) => setForm({ ...form, occupation: e.target.value })}
            className="input-dark text-sm cursor-pointer w-full"
          >
            {occupationOptions.map(opt => (
              <option key={opt.key} value={opt.key}>{opt.label}</option>
            ))}
          </select>
          {form.occupation === 'other' && (
            <input
              type="text"
              placeholder="ระบุอาชีพของคุณ..."
              value={form.customOccupation || ''}
              onChange={(e) => setForm({ ...form, customOccupation: e.target.value })}
              className="input-dark text-sm mt-2"
            />
          )}
        </div>

        {/* 3. Monthly income */}
        <div>
          <label className="block text-xs font-bold text-slate-700 mb-1.5 flex items-center gap-1.5">
            <span className="w-5 h-5 rounded-full bg-indigo-600 text-white text-[10px] font-black flex items-center justify-center">3</span>
            <Banknote className="w-3.5 h-3.5 text-emerald-600" />
            รายได้ต่อเดือน (บาท)
          </label>
          <FormattedNumberInput
            value={form.monthlyIncome || 0}
            onChange={(v) => setForm({ ...form, monthlyIncome: v })}
            min={0}
            prefix="฿"
            placeholder="30,000"
            className="[&_input]:input-dark [&_input]:text-sm [&_input]:font-bold [&_input]:text-emerald-600"
          />
        </div>

        {/* 4. Top-up / cash-out → target loan amount */}
        <div>
          <label className="block text-xs font-bold text-slate-700 mb-1.5 flex items-center gap-1.5">
            <span className="w-5 h-5 rounded-full bg-indigo-600 text-white text-[10px] font-black flex items-center justify-center">4</span>
            <Target className="w-3.5 h-3.5 text-indigo-600" />
            เงินเพิ่ม (Top-up / Cash-out) — ยอดกู้เป้าหมาย
          </label>
          <FormattedNumberInput
            value={form.topUpAmount || 0}
            onChange={(v) => setForm({ ...form, topUpAmount: v })}
            min={0}
            prefix="฿"
            placeholder="0"
            className="[&_input]:input-dark [&_input]:text-sm [&_input]:font-bold [&_input]:text-indigo-600"
          />
          <div className="mt-2 flex items-center gap-2 bg-indigo-50/80 border border-indigo-100 rounded-xl px-3 py-2 text-xs font-bold text-indigo-800">
            <Building2 className="w-4 h-4 text-indigo-600" />
            ยอดกู้เป้าหมาย (target_loan_amount) =
            <span className="text-indigo-900">฿{(Number(form.existingBalance) || 0).toLocaleString()}</span>
            + <span className="text-indigo-900">฿{(Number(form.topUpAmount) || 0).toLocaleString()}</span>
            = <span className="text-indigo-900 font-black">{formatBaht((Number(form.existingBalance) || 0) + (Number(form.topUpAmount) || 0))}</span>
          </div>
        </div>

        {/* 5. MRTA option */}
        <div>
          <label className="block text-xs font-bold text-slate-700 mb-1.5 flex items-center gap-1.5">
            <span className="w-5 h-5 rounded-full bg-indigo-600 text-white text-[10px] font-black flex items-center justify-center">5</span>
            <ShieldCheck className="w-3.5 h-3.5 text-indigo-600" />
            ประกัน MRTA
          </label>
          <div className="grid grid-cols-2 gap-2">
            {MRTA_OPTIONS.map(opt => (
              <button
                key={String(opt.value)}
                type="button"
                onClick={() => setForm({ ...form, wantMRTA: opt.value })}
                className={`text-left p-3 rounded-xl border-2 transition-all cursor-pointer ${
                  form.wantMRTA === opt.value
                    ? 'border-indigo-500 bg-indigo-50/60 shadow-sm'
                    : 'border-slate-200 bg-white hover:border-indigo-300'
                }`}
              >
                <div className="text-sm font-bold text-slate-900">{opt.label}</div>
                <div className="text-[11px] text-slate-500 mt-0.5">{opt.desc}</div>
              </button>
            ))}
          </div>
        </div>

        {error && (
          <div className="bg-rose-50 text-rose-700 border border-rose-200 rounded-xl px-3.5 py-2.5 text-xs font-bold flex items-center gap-2">
            <AlertTriangle className="w-4 h-4" /> {error}
          </div>
        )}
      </div>

      {/* ============ SMART BEST-MATCH: SINGLE CARD ============ */}
      {loadingData ? (
        <div className="bg-white p-10 rounded-2xl border border-slate-200 shadow-sm text-center">
          <RefreshCw className="w-6 h-6 animate-spin mx-auto text-indigo-600" />
          <p className="text-xs text-slate-400 font-bold mt-3">กำลังโหลดโปรโมชันจากฐานข้อมูล...</p>
        </div>
      ) : showBestCard ? (
        <div className="bg-white rounded-2xl border-2 border-emerald-300 shadow-md overflow-hidden">
          {/* Card header */}
          <div className="bg-gradient-to-r from-emerald-500 to-emerald-600 px-6 py-4 flex items-center justify-between">
            <div className="flex items-center gap-2 text-white">
              <Trophy className="w-5 h-5" />
              <span className="text-sm font-black uppercase tracking-wider">แพ็กเกจที่คุ้มที่สุดสำหรับคุณ (Best Match)</span>
            </div>
            <span className="text-[10px] font-black bg-white/20 text-white px-2.5 py-1 rounded-full">
              จาก {bestMatch.eligibleCount} แพ็กเกจที่ผ่านเกณฑ์
            </span>
          </div>

          <div className="p-6 space-y-4">
            {/* Bank + product */}
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                <BankLogo bankShort={getBankShort(best.bank_name)} logoUrl="" size={44} />
                <div>
                  <div className="text-lg font-black text-slate-900">{best.bank_name}</div>
                  <div className="text-xs text-slate-500 font-medium">{best.product_name}</div>
                  {best.styleName && (
                    <span className="inline-block mt-1 text-[10px] font-black bg-indigo-50 text-indigo-700 border border-indigo-200 px-2 py-0.5 rounded-full">
                      {best.styleName}
                    </span>
                  )}
                </div>
              </div>
              {best.promo_image_url && (
                <img
                  src={best.promo_image_url}
                  alt={`แบนเนอร์ ${best.bank_name}`}
                  className="w-28 h-16 object-contain rounded-lg border border-slate-200 bg-slate-50"
                  onError={(e) => { e.currentTarget.style.display = 'none'; }}
                />
              )}
            </div>

            {/* Key numbers */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <div className="bg-indigo-50/70 border border-indigo-100 rounded-xl p-3">
                <div className="text-[10px] text-slate-500 font-bold uppercase">ค่างวดต่อเดือน</div>
                <div className="text-lg font-black text-indigo-700">{formatBaht(best.newMonthly)}</div>
                <div className="text-[10px] font-bold text-emerald-600">
                  {best.monthlyDelta > 0 ? `ลดลง ${formatBaht(best.monthlyDelta)}/เดือน` : 'เท่าเดิม'}
                </div>
              </div>
              <div className="bg-rose-50/70 border border-rose-100 rounded-xl p-3">
                <div className="text-[10px] text-slate-500 font-bold uppercase">ดอกเบี้ยเฉลี่ย 3 ปี</div>
                <div className="text-lg font-black text-rose-600">{best.rate3YAvg}%</div>
                <div className="text-[10px] text-slate-400 font-medium">
                  {best.year1Rate > 0 ? `ปีแรก ${best.year1Rate}%` : ''}{best.year2_3Rate > 0 ? ` • ปี 2-3 ${best.year2_3Rate}%` : ''}
                </div>
              </div>
              <div className="bg-emerald-50/70 border border-emerald-100 rounded-xl p-3">
                <div className="text-[10px] text-slate-500 font-bold uppercase">ประหยัดดอกเบี้ย 3 ปี</div>
                <div className={`text-lg font-black ${best.grossSavings > 0 ? 'text-emerald-600' : 'text-slate-400'}`}>
                  {formatBaht(Math.max(0, best.grossSavings))}
                </div>
                <div className="text-[10px] text-slate-400 font-medium">สุทธิหลังหักค่าธรรมเนียม {formatBaht(Math.max(0, best.netSavings))}</div>
              </div>
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-3">
                <div className="text-[10px] text-slate-500 font-bold uppercase">ยอดกู้เป้าหมาย</div>
                <div className="text-lg font-black text-slate-900">{formatBaht(bestMatch.targetLoanAmount)}</div>
                <div className="text-[10px] text-slate-400 font-medium">ค่าธรรมเนียมโอน ~{formatBaht(best.feesTotal)}</div>
              </div>
            </div>

            {/* Matched perks + variant details */}
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 flex flex-wrap items-center gap-2 text-[11px] font-bold text-slate-600">
              <Percent className="w-3.5 h-3.5 text-indigo-600" />
              {best.wantMRTAMatched ? '🛡️ เงื่อนไข MRTA ตรงกับที่คุณเลือก' : (best.variant?.is_mrta ? '🛡️ เงื่อนไข MRTA' : 'ไม่ต้องทำ MRTA')}
              {best.mrrFormula && <span className="bg-white border border-slate-200 px-2 py-0.5 rounded-lg">หลังปี 3: {best.mrrFormula}</span>}
              {best.eir > 0 && <span className="bg-white border border-slate-200 px-2 py-0.5 rounded-lg">EIR {best.eir}%</span>}
              {(best.fee_waivers || []).length > 0 && (
                <span className="bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-lg border border-emerald-300">
                  🎁 สิทธิพิเศษ: ฟรี{best.fee_waivers.join(' + ')}
                </span>
              )}
              {best.max_ltv_percent > 0 && (
                <span className="bg-white border border-slate-200 px-2 py-0.5 rounded-lg">LTV ≤ {best.max_ltv_percent}%</span>
              )}
            </div>

            {/* CTA: external redirect */}
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-2 border-t border-slate-100">
              <p className="text-[11px] text-slate-500 font-medium">
                ผ่านเกณฑ์: รายได้ ≥ {best.min_income > 0 ? `฿${best.min_income.toLocaleString()}/เดือน` : 'ไม่กำหนด'}
                {best.min_loan_tier > 0 ? ` • วงเงิน ≥ ฿${best.min_loan_tier.toLocaleString()}` : ' • ทุกขนาดวงเงิน'}
              </p>
              {best.bank_ref_link ? (
                <a
                  href={best.bank_ref_link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn-gold text-xs font-black py-3 px-6 flex items-center gap-2 shadow-md cursor-pointer"
                >
                  สมัครที่เว็บไซต์{best.bank_name.replace('ธนาคาร', '')}
                  <ExternalLink className="w-4 h-4" />
                </a>
              ) : (
                <span className="text-[11px] text-slate-400 font-medium">ยังไม่มีลิงก์เว็บไซต์ธนาคาร (ให้แอดมินเพิ่มในหลังบ้าน)</span>
              )}
            </div>
          </div>
        </div>
      ) : (
        /* Fallback: manual empty form + alert (no eligible promo / parse failed) */
        <div className="bg-white rounded-2xl border-2 border-amber-300 shadow-sm p-6 space-y-4">
          <div className="flex items-start gap-3 bg-amber-50 border border-amber-200 rounded-xl p-4">
            <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
            <div>
              <h3 className="text-sm font-black text-amber-800">
                {promotions.length === 0
                  ? 'ยังไม่มีข้อมูลโปรโมชันในระบบ'
                  : bestMatch && bestMatch.eligibleCount === 0
                    ? 'ไม่พบแพ็กเกจที่คุณผ่านเกณฑ์'
                    : 'ข้อมูลแพ็กเกจยังไม่ครบถ้วน'}
              </h3>
              <p className="text-xs text-amber-700 font-medium mt-1">
                {promotions.length === 0
                  ? 'กรุณาให้แอดมินอัปโหลดแบนเนอร์โปรโมชันในหลังบ้าน หรือลองกด "รีเฟรช" อีกครั้ง'
                  : 'ลองปรับรายได้ วงเงิน หรือตัวเลือก MRTA — หรือกรอกแบบฟอร์มว่างด้านล่างเพื่อติดต่อธนาคารโดยตรง'}
              </p>
            </div>
          </div>

          {/* Manual empty form render */}
          <div className="space-y-3">
            <h4 className="text-xs font-black text-slate-800 uppercase tracking-wider">แบบฟอร์มแจ้งข้อมูลเพื่อติดต่อธนาคาร (กรอกเอง)</h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl">
                <div className="text-[10px] text-slate-500 font-bold">ยอดกู้เป้าหมาย</div>
                <div className="text-sm font-black text-slate-900">{formatBaht((Number(form.existingBalance) || 0) + (Number(form.topUpAmount) || 0))}</div>
              </div>
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl">
                <div className="text-[10px] text-slate-500 font-bold">รายได้ต่อเดือน</div>
                <div className="text-sm font-black text-slate-900">฿{(Number(form.monthlyIncome) || 0).toLocaleString()}</div>
              </div>
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl">
                <div className="text-[10px] text-slate-500 font-bold">อาชีพ</div>
                <div className="text-sm font-black text-slate-900">{selectedOccupationLabel}</div>
              </div>
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl">
                <div className="text-[10px] text-slate-500 font-bold">ประกัน MRTA</div>
                <div className="text-sm font-black text-slate-900">{form.wantMRTA ? 'ทำ MRTA' : 'ไม่ทำ MRTA'}</div>
              </div>
            </div>
            <p className="text-[11px] text-slate-500 font-medium">
              💡 พิมพ์ข้อมูลด้านบนแนบไปยื่นที่สาขา หรือรอแอดมินเพิ่มโปรโมชันก่อนกลับมาคำนวณใหม่
            </p>
          </div>
        </div>
      )}

      {/* Disclaimer */}
      <div className="text-[11px] text-slate-400 font-medium bg-white/60 border border-slate-200 rounded-xl px-4 py-3 leading-relaxed">
        ⚠️ อัตราดอกเบี้ยและโปรโมชันเป็นข้อมูลอ้างอิงจากฐานข้อมูลแอดมิน ควรยืนยันเงื่อนไขกับธนาคารก่อนยื่นกู้จริง
        การคำนวณค่างวดใช้แบบแผน amortization มาตรฐาน (36 เดือนแรก)
      </div>
    </div>
  );
}
