import React, { useState, useEffect } from 'react';
import {
  Home,
  ChevronRight,
  Wallet,
  TrendingUp,
  TrendingDown,
  Plus,
  Filter,
  Calendar,
  LineChart,
  BarChart3,
  Download,
  Trash2,
  Edit3,
  CheckCircle2,
  AlertCircle,
  AlertTriangle,
  Sparkles,
  ShieldAlert,
  PiggyBank,
  Info
} from 'lucide-react';
import { calculateDebtProgress, formatCurrency } from '../utils/debtEngine';
import { exportPaymentHistoryToExcel } from '../utils/excelExport';
import { fetchCashflowFromCloud, saveCashflowToCloud, subscribeToCashflow } from '../services/supabaseService';
import { projectDailyLiquidity, buildCashflowRecommendations } from '../utils/cashflowEngine';

// ---------- Projection SVG Chart (interactive balance visualization) ----------
function ProjectionChart({ series }) {
  const W = 800;
  const H = 220;
  const pad = 14;

  if (!series || series.length === 0) {
    return <div className="h-48 flex items-center justify-center text-xs text-slate-400">ยังไม่มีข้อมูลการคาดการณ์</div>;
  }

  const values = series.map(s => s.balance);
  const minRaw = Math.min(0, ...values);
  const maxRaw = Math.max(0, ...values);
  const span = (maxRaw - minRaw) || 1;
  const yMin = minRaw - span * 0.08;
  const yMax = maxRaw + span * 0.08;

  const x = (i) => pad + (i * (W - pad * 2)) / (series.length - 1 || 1);
  const y = (v) => H - pad - ((v - yMin) / (yMax - yMin)) * (H - pad * 2);
  const zeroY = y(0);

  const pts = series.map((s, i) => `${x(i).toFixed(1)},${y(s.balance).toFixed(1)}`);
  const linePath = `M ${pts.join(' L ')}`;
  const areaPath = `${linePath} L ${x(series.length - 1).toFixed(1)},${zeroY.toFixed(1)} L ${x(0).toFixed(1)},${zeroY.toFixed(1)} Z`;

  // Contiguous danger runs (days balance < 0)
  const runs = [];
  let run = null;
  series.forEach((s, i) => {
    if (s.balance < 0) {
      if (!run) run = { start: i, end: i };
      else run.end = i;
    } else if (run) {
      runs.push(run);
      run = null;
    }
  });
  if (run) runs.push(run);

  const labelIndexes = [];
  const labelCount = Math.min(6, series.length);
  for (let k = 0; k < labelCount; k++) {
    labelIndexes.push(Math.round((k * (series.length - 1)) / (labelCount - 1 || 1)));
  }

  return (
    <div className="w-full overflow-x-auto">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full min-w-[560px]" role="img" aria-label="กราฟคาดการณ์ยอดเงินสดคงเหลือรายวัน">
        {/* Horizontal gridlines */}
        {[0.25, 0.5, 0.75].map(f => (
          <line key={f} x1={pad} x2={W - pad} y1={pad + (H - pad * 2) * f} y2={pad + (H - pad * 2) * f} stroke="#e2e8f0" strokeWidth="1" strokeDasharray="4 4" />
        ))}

        {/* Danger zone highlight */}
        {runs.map((r, idx) => (
          <rect
            key={idx}
            x={x(r.start)}
            y={zeroY}
            width={Math.max(2, x(r.end) - x(r.start))}
            height={H - pad - zeroY}
            fill="#f43f5e"
            opacity="0.18"
          />
        ))}

        {/* Zero line */}
        <line x1={pad} x2={W - pad} y1={zeroY} y2={zeroY} stroke="#94a3b8" strokeWidth="1.5" strokeDasharray="6 4" />

        {/* Area fill */}
        <path d={areaPath} fill="url(#cfGrad)" opacity="0.55" />

        {/* Balance line */}
        <path d={linePath} fill="none" stroke="#6366f1" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />

        {/* Hover points */}
        {series.map((s, i) => (
          <circle key={i} cx={x(i)} cy={y(s.balance)} r="3.5" fill={s.balance < 0 ? '#f43f5e' : '#6366f1'}>
            <title>
              {`${s.label}: ${formatCurrency(s.balance)}\n${s.events.map(e => `${e.label} ${e.amount >= 0 ? '+' : '-'}${formatCurrency(Math.abs(e.amount))}`).join('\n') || 'ไม่มีรายการ'}`}
            </title>
          </circle>
        ))}

        {/* X labels */}
        {labelIndexes.map(i => (
          <text key={i} x={x(i)} y={H - 2} textAnchor="middle" fontSize="10" fill="#94a3b8" fontWeight="600">
            {series[i].label}
          </text>
        ))}

        {/* Gradient defs */}
        <defs>
          <linearGradient id="cfGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#6366f1" stopOpacity="0.45" />
            <stop offset="100%" stopColor="#6366f1" stopOpacity="0.02" />
          </linearGradient>
        </defs>
      </svg>
      <div className="flex items-center gap-4 text-[10px] text-slate-500 font-medium pt-1">
        <span className="flex items-center gap-1"><span className="w-3 h-0.5 bg-indigo-600 inline-block rounded" /> ยอดเงินสดคงเหลือ</span>
        <span className="flex items-center gap-1"><span className="w-3 h-0.5 border-t border-dashed border-slate-400 inline-block" /> เส้นศูนย์ (เงินสดหมด)</span>
        <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 bg-rose-500/40 inline-block rounded" /> โซนอันตราย</span>
      </div>
    </div>
  );
}

// ---------- Risk Badge ----------
function RiskBadge({ risk }) {
  if (risk === 'danger') {
    return (
      <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-rose-600 text-white text-xs font-black animate-pulse shadow-md shadow-rose-500/30">
        <AlertTriangle className="w-4 h-4" /> โซนอันตราย (DANGER)
      </span>
    );
  }
  if (risk === 'warning') {
    return (
      <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-amber-500 text-white text-xs font-black shadow-md shadow-amber-500/30">
        <AlertCircle className="w-4 h-4" /> เฝ้าระวัง (WARNING)
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-emerald-600 text-white text-xs font-black shadow-md shadow-emerald-500/30">
      <CheckCircle2 className="w-4 h-4" /> ปลอดภัย (SAFE)
    </span>
  );
}

export default function CashflowPage({
  debts,
  setDebts,
  paymentLogs,
  setPaymentLogs,
  extraBudget,
  onBack,
  userName = 'User'
}) {
  // Chart and Display Settings
  const [chartTimePeriod, setChartTimePeriod] = useState('monthly'); // 'daily', 'weekly', 'monthly'
  const [chartDataType, setChartDataType] = useState('net'); // 'income', 'expense', 'net'
  const [dateRange, setDateRange] = useState({
    startDate: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    endDate: new Date().toISOString().split('T')[0]
  });

  // Cashflow Management
  const [cashflowEntries, setCashflowEntries] = useState(() => {
    const saved = localStorage.getItem(`nee_noi_cashflow_${userName}`);
    return saved ? JSON.parse(saved) : [];
  });

  const [showAddEntry, setShowAddEntry] = useState(false);
  const [editingEntry, setEditingEntry] = useState(null);
  const [entryFilter, setEntryFilter] = useState('all'); // 'all', 'income', 'expense'

  // Form State for New/Edited Entry
  const [formData, setFormData] = useState({
    type: 'income', // 'income' or 'expense'
    amount: '',
    category: '',
    description: '',
    date: new Date().toISOString().split('T')[0],
    isDebtPayment: false,
    debtId: ''
  });

  // ---- Predictive Cash Flow & Risk Early Warning settings ----
  const [riskHorizon, setRiskHorizon] = useState(90); // 30 | 60 | 90 days
  const [startingBalance, setStartingBalance] = useState(() => {
    const saved = localStorage.getItem(`nee_noi_cashflow_${userName}_start_balance`);
    const parsed = Number(saved);
    return !isNaN(parsed) ? parsed : 10000;
  });
  const [includeExtra, setIncludeExtra] = useState(true);

  // ---- Monthly lump-sum income/expense (Monthly Budget) ----
  const [monthlyBudget, setMonthlyBudget] = useState(() => {
    const saved = localStorage.getItem(`nee_noi_cashflow_${userName}_monthly_budget`);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        return {
          income: Number(parsed.income) || 0,
          expense: Number(parsed.expense) || 0,
          incomeDay: Math.min(28, Math.max(1, Number(parsed.incomeDay) || 1))
        };
      } catch (e) { /* ignore malformed */ }
    }
    return { income: 0, expense: 0, incomeDay: 1 };
  });

  // Load from Supabase Cloud DB & setup Realtime sync
  useEffect(() => {
    let active = true;
    async function loadCloudCashflow() {
      const data = await fetchCashflowFromCloud(userName);
      if (data && active) {
        if (data.entries) setCashflowEntries(data.entries);
        if (data.startingBalance !== undefined) setStartingBalance(data.startingBalance);
        if (data.monthlyBudget) setMonthlyBudget(data.monthlyBudget);
      }
    }
    loadCloudCashflow();

    const unsubscribe = subscribeToCashflow(userName, (cloudData) => {
      if (!active) return;
      if (cloudData.entries) setCashflowEntries(cloudData.entries);
      if (cloudData.startingBalance !== undefined) setStartingBalance(cloudData.startingBalance);
      if (cloudData.monthlyBudget) setMonthlyBudget(cloudData.monthlyBudget);
    });

    return () => {
      active = false;
      unsubscribe();
    };
  }, [userName]);

  // Persist risk settings & cashflow entries to LocalStorage & Supabase Cloud DB
  useEffect(() => {
    localStorage.setItem(`nee_noi_cashflow_${userName}_start_balance`, String(startingBalance));
    localStorage.setItem(`nee_noi_cashflow_${userName}_monthly_budget`, JSON.stringify(monthlyBudget));
    localStorage.setItem(`nee_noi_cashflow_${userName}`, JSON.stringify(cashflowEntries));

    saveCashflowToCloud(userName, {
      entries: cashflowEntries,
      startingBalance,
      monthlyBudget
    });
  }, [startingBalance, monthlyBudget, cashflowEntries, userName]);

  // ---- Deterministic 30-90 day liquidity projection & risk detection ----
  const projection = projectDailyLiquidity({
    debts,
    cashflowEntries,
    startingBalance,
    horizonDays: riskHorizon,
    monthlyExtra: extraBudget,
    includeExtra,
    monthlyIncome: monthlyBudget.income,
    monthlyExpense: monthlyBudget.expense,
    incomeDay: monthlyBudget.incomeDay
  });

  // ---- AI prescriptive recommendations (rule-based, simulated) ----
  const recommendationData = buildCashflowRecommendations({
    debts,
    cashflowEntries,
    startingBalance,
    horizonDays: riskHorizon,
    monthlyExtra: extraBudget,
    includeExtra,
    monthlyIncome: monthlyBudget.income,
    monthlyExpense: monthlyBudget.expense,
    incomeDay: monthlyBudget.incomeDay
  });

  // ---- Real debt progress (consistent with every other page) ----
  const progress = calculateDebtProgress(debts, paymentLogs);

  // Generate chart data based on time period and entries
  const generateChartData = () => {
    const entries = cashflowEntries.filter(entry => {
      const entryDate = new Date(entry.date);
      const startDate = new Date(dateRange.startDate);
      const endDate = new Date(dateRange.endDate);
      return entryDate >= startDate && entryDate <= endDate;
    });

    const groupedData = {};

    entries.forEach(entry => {
      let periodKey;
      const entryDate = new Date(entry.date);

      switch (chartTimePeriod) {
        case 'daily':
          periodKey = entry.date;
          break;
        case 'weekly': {
          const weekStart = new Date(entryDate);
          weekStart.setDate(entryDate.getDate() - entryDate.getDay());
          periodKey = weekStart.toISOString().split('T')[0];
          break;
        }
        case 'monthly':
          periodKey = `${entryDate.getFullYear()}-${String(entryDate.getMonth() + 1).padStart(2, '0')}`;
          break;
        default:
          periodKey = entry.date;
      }

      if (!groupedData[periodKey]) {
        groupedData[periodKey] = {
          period: periodKey,
          income: 0,
          expense: 0,
          net: 0,
          entries: []
        };
      }

      if (entry.type === 'income') {
        groupedData[periodKey].income += entry.amount;
      } else {
        groupedData[periodKey].expense += entry.amount;
      }

      groupedData[periodKey].net = groupedData[periodKey].income - groupedData[periodKey].expense;
      groupedData[periodKey].entries.push(entry);
    });

    const result = Object.values(groupedData).sort((a, b) => a.period.localeCompare(b.period));

    return result.map(item => ({
      ...item,
      periodLabel: chartTimePeriod === 'daily'
        ? new Date(item.period).toLocaleDateString('th-TH', { day: 'numeric', month: 'short' })
        : chartTimePeriod === 'weekly'
          ? `สัปดาห์ที่ ${new Date(item.period).getWeek()}`
          : `เดือน ${new Date(`${item.period}-01`).toLocaleDateString('th-TH', { month: 'short', year: 'numeric' })}`
    }));
  };

  // Chart Summary Calculations
  const chartSummary = (() => {
    const data = generateChartData();
    const totalIncome = data.reduce((sum, item) => sum + item.income, 0);
    const totalExpense = data.reduce((sum, item) => sum + item.expense, 0);
    const netTotal = totalIncome - totalExpense;

    const recentTrend = data.slice(-3);
    const previousTrend = data.slice(-6, -3);

    const recentIncome = recentTrend.reduce((sum, item) => sum + item.income, 0);
    const previousIncome = previousTrend.reduce((sum, item) => sum + item.income, 0);
    const incomeTrend = previousIncome > 0 ? ((recentIncome - previousIncome) / previousIncome) * 100 : 0;

    const recentExpense = recentTrend.reduce((sum, item) => sum + item.expense, 0);
    const previousExpense = previousTrend.reduce((sum, item) => sum + item.expense, 0);
    const expenseTrend = previousExpense > 0 ? ((recentExpense - previousExpense) / previousExpense) * 100 : 0;

    return {
      totalIncome,
      totalExpense,
      netTotal,
      incomeTrend,
      expenseTrend,
      chartData: data
    };
  })();

  // Cashflow Entries Management
  const addCashflowEntry = (e) => {
    e.preventDefault();

    if (!formData.amount || !formData.category || !formData.description) {
      return;
    }

    const newEntry = {
      id: editingEntry ? editingEntry.id : `cashflow-${Date.now()}`,
      type: formData.type,
      amount: Number(formData.amount),
      category: formData.category,
      description: formData.description,
      date: formData.date,
      isDebtPayment: formData.isDebtPayment,
      debtId: formData.debtId || '',
      createdAt: new Date().toISOString()
    };

    if (editingEntry) {
      setCashflowEntries(prev => prev.map(entry =>
        entry.id === editingEntry.id ? newEntry : entry
      ));
    } else {
      setCashflowEntries(prev => [newEntry, ...prev]);
    }

    // If it's a debt payment, also update payment logs
    if (formData.isDebtPayment && formData.type === 'expense') {
      const targetDebt = debts.find(d => d.id === formData.debtId);
      if (targetDebt) {
        const newBalance = Math.max(0, Number(targetDebt.balance) - newEntry.amount);
        setDebts(prev => prev.map(d =>
          d.id === targetDebt.id
            ? { ...d, balance: newBalance }
            : d
        ));

        const newLog = {
          id: `pay-${Date.now()}`,
          debtId: targetDebt.id,
          debtName: targetDebt.name,
          lender: targetDebt.lender,
          amountPaid: newEntry.amount,
          previousBalance: targetDebt.balance,
          remainingBalance: newBalance,
          paymentDate: newEntry.date,
          note: `${newEntry.description} (บันทึกจากบันทึกกระแสเงินสด)`
        };
        setPaymentLogs(prev => [newLog, ...prev]);
      }
    }

    // Reset form
    setShowAddEntry(false);
    setEditingEntry(null);
    setFormData({
      type: 'income',
      amount: '',
      category: '',
      description: '',
      date: new Date().toISOString().split('T')[0],
      isDebtPayment: false,
      debtId: ''
    });
  };

  const editEntry = (entry) => {
    setEditingEntry(entry);
    setFormData({
      type: entry.type,
      amount: entry.amount.toString(),
      category: entry.category,
      description: entry.description,
      date: entry.date,
      isDebtPayment: entry.isDebtPayment || false,
      debtId: entry.debtId || ''
    });
    setShowAddEntry(true);
  };

  const deleteEntry = (id) => {
    if (confirm('คุณแน่ใจหรือไม่ว่าต้องการเอาบันทึกกระแสเงินสดนี้ออก?')) {
      setCashflowEntries(prev => prev.filter(entry => entry.id !== id));
    }
  };

  const filteredEntries = cashflowEntries.filter(entry =>
    entryFilter === 'all' || entry.type === entryFilter
  );

  // Get category info by ID
  const getCategoryInfo = (categoryId, type) => {
    const categories = type === 'income' ? incomeCategories : expenseCategories;
    return categories.find(cat => cat.id === categoryId) || { name: categoryId, icon: '📝', color: 'bg-slate-500' };
  };

  const activeDebts = debts.filter(d => Number(d.balance) > 0);

  const riskPanelStyle =
    projection.risk === 'danger'
      ? 'border-rose-300 bg-gradient-to-br from-rose-50 via-white to-rose-50/50'
      : projection.risk === 'warning'
        ? 'border-amber-300 bg-gradient-to-br from-amber-50 via-white to-amber-50/50'
        : 'border-emerald-300 bg-gradient-to-br from-emerald-50 via-white to-emerald-50/50';

  return (
    <div className="space-y-6 animate-fade-in pb-16">

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
          <Wallet className="w-3.5 h-3.5" />
          บันทึกกระแสเงินสด & ระบบเตือนภัยสภาพคล่อง
        </span>
      </div>

      {/* 2. Debt Progress Strip (REAL data, consistent everywhere) */}
      <div className="bg-white p-5 rounded-2xl border border-indigo-100 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="badge-gold">
              <Sparkles className="w-3.5 h-3.5 text-indigo-600" />
              ความคืบหน้าการปลดหนี้รวม
            </span>
            <span className="text-xs font-black text-indigo-600">{progress.progressPercent}%</span>
          </div>
          <div className="flex items-center gap-4 text-[11px] font-bold">
            <span className="text-emerald-600">จ่ายไปแล้ว {formatCurrency(progress.totalPaid)}</span>
            <span className="text-slate-500">คงเหลือ {formatCurrency(progress.totalRemaining)}</span>
            <span className="text-slate-400">ยอดเดิม {formatCurrency(progress.totalOriginal)}</span>
          </div>
        </div>
        <div className="w-full h-4 bg-slate-100 rounded-full p-0.5 border border-slate-200 overflow-hidden mt-3 shadow-inner">
          <div
            className="h-full bg-gradient-to-r from-indigo-600 via-indigo-500 to-emerald-400 rounded-full transition-all duration-700 ease-out"
            style={{ width: `${Math.max(4, progress.progressPercent)}%` }}
          />
        </div>
      </div>

      {/* 3. Predictive Cash Flow & Risk Early Warning (Danger Zone) */}
      <div className={`bg-white p-6 rounded-2xl border-2 ${riskPanelStyle} shadow-md`}>
        <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-4 pb-5 border-b border-slate-100">
          <div>
            <span className="badge-gold">
              <ShieldAlert className="w-3.5 h-3.5 text-indigo-600" />
              Predictive Cash Flow & Risk Early Warning
            </span>
            <h1 className="text-xl font-black text-slate-900 pt-2 flex items-center gap-2 tracking-tight">
              คาดการณ์สภาพคล่องเงินสด 30-90 วัน
            </h1>
            <p className="text-xs text-slate-500 font-medium mt-1">
              ระบบคำนวณยอดเงินสดคงเหลือรายวันแบบ deterministic จากข้อมูลจริงของคุณ (รายรับ-รายจ่าย + ค่างวดหนี้)
            </p>
          </div>
          <RiskBadge risk={projection.risk} />
        </div>

        {/* Settings */}
        <div className="flex flex-wrap items-center gap-3 pt-4">
          <div className="flex items-center gap-2 bg-slate-50 rounded-xl border border-slate-200 px-3 py-2">
            <label className="text-xs font-bold text-slate-600 whitespace-nowrap">เงินสดคงเหลือตอนนี้ (บาท)</label>
            <input
              type="number"
              value={startingBalance}
              onChange={(e) => setStartingBalance(Number(e.target.value) || 0)}
              className="input-dark w-32 font-black text-indigo-600 text-sm"
            />
          </div>

          <div className="flex items-center gap-1 bg-slate-50 rounded-xl border border-slate-200 p-1">
            {[30, 60, 90].map(days => (
              <button
                key={days}
                onClick={() => setRiskHorizon(days)}
                className={`text-xs px-3 py-1.5 rounded-lg font-bold transition-all cursor-pointer ${
                  riskHorizon === days
                    ? 'bg-indigo-600 text-white shadow-md shadow-indigo-500/25'
                    : 'text-slate-600 hover:bg-slate-200/60'
                }`}
              >
                {days} วัน
              </button>
            ))}
          </div>

          <label className="flex items-center gap-2 bg-slate-50 rounded-xl border border-slate-200 px-3 py-2 cursor-pointer">
            <input
              type="checkbox"
              checked={includeExtra}
              onChange={(e) => setIncludeExtra(e.target.checked)}
              className="w-4 h-4 text-indigo-600 rounded border-slate-300"
            />
            <span className="text-xs font-bold text-slate-600 whitespace-nowrap">
              รวมงบโปะหนี้ {formatCurrency(extraBudget)}/เดือน
            </span>
          </label>
        </div>

        {/* Risk reason banner */}
        <div className={`mt-4 p-3.5 rounded-xl border text-xs font-semibold flex items-start gap-2.5 ${
          projection.risk === 'danger'
            ? 'bg-rose-50 border-rose-200 text-rose-800'
            : projection.risk === 'warning'
              ? 'bg-amber-50 border-amber-200 text-amber-800'
              : 'bg-emerald-50 border-emerald-200 text-emerald-800'
        }`}>
          {projection.risk === 'danger' ? <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
            : projection.risk === 'warning' ? <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
            : <CheckCircle2 className="w-4 h-4 flex-shrink-0 mt-0.5" />}
          <span>{projection.riskReason}</span>
        </div>

        {/* Summary cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mt-4">
          <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200/80">
            <div className="text-xs text-slate-500 font-medium">เงินสดคงเหลือต่ำสุด</div>
            <div className={`text-lg font-black ${projection.minBalance < 0 ? 'text-rose-600' : 'text-emerald-600'}`}>
              {formatCurrency(projection.minBalance)}
            </div>
            <div className="text-[10px] text-slate-400 font-medium">วันที่ {projection.minBalanceLabel}</div>
          </div>

          <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200/80">
            <div className="text-xs text-slate-500 font-medium">วันแรกที่เงินสดจะติดลบ</div>
            <div className={`text-lg font-black ${projection.daysUntilDanger === null ? 'text-emerald-600' : 'text-rose-600'}`}>
              {projection.daysUntilDanger === null ? 'ไม่ติดลบ' : `อีก ${projection.daysUntilDanger} วัน`}
            </div>
            <div className="text-[10px] text-slate-400 font-medium">
              {projection.firstDangerLabel ? `วันที่ ${projection.firstDangerLabel}` : 'ภายในช่วงที่คาดการณ์'}
            </div>
          </div>

          <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200/80">
            <div className="text-xs text-slate-500 font-medium">จำนวนวันที่ติดลบ ({riskHorizon} วัน)</div>
            <div className={`text-lg font-black ${projection.dangerDays > 0 ? 'text-rose-600' : 'text-emerald-600'}`}>
              {projection.dangerDays} วัน
            </div>
            <div className="text-[10px] text-slate-400 font-medium">ใน {riskHorizon} วันข้างหน้า</div>
          </div>

          <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200/80">
            <div className="text-xs text-slate-500 font-medium">เงินสำรองที่แนะนำ</div>
            <div className="text-lg font-black text-indigo-600">{formatCurrency(projection.safetyBuffer)}</div>
            <div className="text-[10px] text-slate-400 font-medium">= ค่าใช้จ่ายเฉลี่ย 1 เดือน</div>
          </div>
        </div>

        {/* Interactive balance chart */}
        <div className="mt-5 pt-5 border-t border-slate-100">
          <div className="flex items-center justify-between flex-wrap gap-2 mb-3">
            <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <LineChart className="w-4 h-4 text-indigo-600" />
              กราฟคาดการณ์ยอดเงินสดคงเหลือ ({riskHorizon} วัน)
            </h3>
            <span className="text-[10px] text-slate-400 font-medium">ชี้บนจุดเพื่อดูรายละเอียดรายวัน</span>
          </div>
          <ProjectionChart series={projection.series} />
        </div>

        {/* Assumptions */}
        <div className="mt-4 bg-slate-50/80 border border-slate-200 rounded-xl p-3.5 space-y-1.5">
          <div className="flex items-center gap-1.5 text-[11px] font-black text-slate-600 uppercase tracking-wider">
            <Info className="w-3.5 h-3.5 text-indigo-600" />
            สมมติฐานการคาดการณ์ (จากข้อมูลจริงของคุณ)
          </div>
          <ul className="text-[11px] text-slate-500 font-medium space-y-1">
            {projection.assumptions.monthlyIncomeInput !== null ? (
              <li>• รายรับต่อเดือน (กรอก): <strong className="text-emerald-600">{formatCurrency(projection.assumptions.monthlyIncomeInput)}</strong> เข้าวันที่ {projection.assumptions.incomeDay} ของทุกเดือน</li>
            ) : projection.assumptions.recurringIncome.length > 0 ? (
              projection.assumptions.recurringIncome.map((inc, i) => (
                <li key={i}>• รายรับประจำ: <strong className="text-emerald-600">{formatCurrency(inc.amount)}</strong> ({inc.description || inc.category}) ทุกวันที่ {inc.dayOfMonth}</li>
              ))
            ) : (
              <li>• ยังไม่มีรายการรายรับ → ยังไม่มีการคาดการณ์รายได้ประจำ <button onClick={() => setShowAddEntry(true)} className="text-indigo-600 font-bold hover:underline cursor-pointer">เพิ่มรายการรายรับ</button></li>
            )}
            {projection.assumptions.monthlyExpenseInput !== null ? (
              <li>• รายจ่ายต่อเดือน (กรอก): <strong className="text-rose-600">{formatCurrency(projection.assumptions.monthlyExpenseInput)}</strong> (เฉลี่ย {formatCurrency(projection.assumptions.avgDailyExpense)}/วัน)</li>
            ) : (
              <li>• ค่าใช้จ่ายเฉลี่ยต่อวัน: <strong>{formatCurrency(projection.assumptions.avgDailyExpense)}</strong> (จากข้อมูลย้อนหลัง 60 วัน ไม่รวมจ่ายหนี้)</li>
            )}
            <li>• ค่างวดหนี้ที่ต้องจ่าย: <strong>{projection.assumptions.debtPayments.length} ก้อน</strong> รวม {formatCurrency(projection.assumptions.debtPayments.reduce((s, d) => s + d.minPayment, 0))}/เดือน{projection.assumptions.monthlyExtraIncluded ? ` + โปะ ${formatCurrency(extraBudget)}/เดือน` : ''}</li>
          </ul>
        </div>
      </div>

      {/* 3.5. Monthly Budget (lump-sum income & expense) */}
      <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
        <div className="flex items-center justify-between gap-3 pb-4 border-b border-slate-100">
          <div>
            <span className="badge-gold">
              <PiggyBank className="w-3.5 h-3.5 text-indigo-600" />
              Monthly Budget (รายรับ-รายจ่ายรายเดือน)
            </span>
            <h2 className="text-lg font-bold text-slate-900 pt-1.5">กรอกยอดรวมรายเดือน</h2>
            <p className="text-xs text-slate-500 font-medium mt-0.5">
              กรอกเลขรวมต่อเดือน ไม่ต้องบันทึกรายการย่อยทีละวัน — ระบบนำไปคำนวณคาดการณ์สภาพคล่องให้ทันที
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-4">
          <div>
            <label className="text-xs font-bold text-slate-700 block mb-1 flex items-center gap-1">
              <TrendingUp className="w-3.5 h-3.5 text-emerald-600" />
              รายรับต่อเดือน (บาท)
            </label>
            <input
              type="number"
              placeholder="เช่น 30000"
              value={monthlyBudget.income === 0 ? '' : monthlyBudget.income}
              onChange={(e) => setMonthlyBudget(prev => ({ ...prev, income: e.target.value === '' ? 0 : Number(e.target.value) || 0 }))}
              className="input-dark font-black text-emerald-600 text-base w-full"
            />
          </div>

          <div>
            <label className="text-xs font-bold text-slate-700 block mb-1">วันที่ได้รับเงิน</label>
            <input
              type="number"
              min="1"
              max="28"
              value={monthlyBudget.incomeDay}
              onChange={(e) => {
                const v = Math.min(28, Math.max(1, Number(e.target.value) || 1));
                setMonthlyBudget(prev => ({ ...prev, incomeDay: v }));
              }}
              className="input-dark text-slate-800 font-medium w-full"
            />
          </div>

          <div>
            <label className="text-xs font-bold text-slate-700 block mb-1 flex items-center gap-1">
              <TrendingDown className="w-3.5 h-3.5 text-rose-600" />
              รายจ่ายต่อเดือน (บาท)
            </label>
            <input
              type="number"
              placeholder="เช่น 15000"
              value={monthlyBudget.expense === 0 ? '' : monthlyBudget.expense}
              onChange={(e) => setMonthlyBudget(prev => ({ ...prev, expense: e.target.value === '' ? 0 : Number(e.target.value) || 0 }))}
              className="input-dark font-black text-rose-600 text-base w-full"
            />
          </div>
        </div>

        <div className="mt-3 text-[11px] text-slate-500 font-medium bg-slate-50 border border-slate-200 rounded-xl p-3">
          💡 รายจ่ายต่อเดือนจะกระจายเฉลี่ยรายวันให้อัตโนมัติ (รายจ่าย/30 วัน) ถ้ายังไม่กรอก ระบบจะประมาณจากรายการบันทึกกระแสเงินสดย้อนหลัง 60 วันแทน
        </div>
      </div>

      {/* 4. AI Prescriptive Recommendations */}
      <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
        <div className="flex items-center justify-between gap-3 pb-4 border-b border-slate-100">
          <div>
            <span className="badge-gold">
              <Sparkles className="w-3.5 h-3.5 text-indigo-600" />
              AI Prescriptive Recommendations
            </span>
            <h2 className="text-lg font-bold text-slate-900 pt-1.5 flex items-center gap-2">
              AI แนะนำวิธีรับมือเมื่อกระแสเงินสดอยู่ในโซนอันตราย
            </h2>
            <p className="text-xs text-slate-500 font-medium mt-0.5">
              แต่ละแผนคำนวณผลลัพธ์จริง (จำลองย้อนกลับ) เพื่อให้คุณเห็นผลกระทบก่อนตัดสินใจ
            </p>
          </div>
        </div>

        {recommendationData.recommendations.length === 0 ? (
          <div className="py-8 text-center text-xs text-slate-400 font-medium">
            ยังไม่มีข้อมูลพอสำหรับการแนะนำ ลองเพิ่มรายการรายรับ/รายจ่าย หรือตั้งงบโปะหนี้ก่อน
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
            {recommendationData.recommendations.map(rec => (
              <div
                key={rec.key}
                className={`p-4 rounded-2xl border transition-all relative overflow-hidden ${
                  recommendationData.topRecommendation?.key === rec.key
                    ? 'border-indigo-500 bg-indigo-50/50 shadow-md'
                    : 'border-slate-200 bg-slate-50/50 hover:border-slate-300'
                }`}
              >
                {recommendationData.topRecommendation?.key === rec.key && (
                  <span className="absolute top-0 right-0 bg-indigo-600 text-white text-[9px] font-black px-2.5 py-1 rounded-bl-xl rounded-tr-2xl uppercase tracking-wider">
                    ⭐ AI แนะนำที่สุด
                  </span>
                )}

                <h3 className="text-sm font-extrabold text-slate-900 pr-20">{rec.title}</h3>
                <p className="text-xs text-slate-600 font-medium mt-1.5 leading-relaxed">{rec.description}</p>

                <div className="flex items-center gap-2 mt-3">
                  <span className="bg-emerald-50 text-emerald-700 border border-emerald-200 text-[11px] font-black px-2.5 py-1 rounded-lg">
                    💰 ได้เงินสดเพิ่ม {formatCurrency(rec.freedMonthly)}/เดือน
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-2 mt-3">
                  <div className="bg-white border border-slate-200 rounded-xl p-2.5">
                    <div className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">สถานการณ์ปัจจุบัน</div>
                    <div className="text-[11px] font-bold text-slate-700 mt-1 space-y-0.5">
                      <div>เงินสดต่ำสุด: <span className={rec.before.minBalance < 0 ? 'text-rose-600' : 'text-emerald-600'}>{formatCurrency(rec.before.minBalance)}</span></div>
                      <div>วันวิกฤต: {rec.before.daysUntilDanger === null ? 'ไม่มี' : `อีก ${rec.before.daysUntilDanger} วัน`}</div>
                      <div>ติดลบ: <span className="text-rose-600">{rec.before.dangerDays} วัน</span></div>
                    </div>
                  </div>
                  <div className="bg-indigo-50/60 border border-indigo-200 rounded-xl p-2.5">
                    <div className="text-[10px] text-indigo-500 font-bold uppercase tracking-wider">หลังทำตามแผน</div>
                    <div className="text-[11px] font-bold text-slate-800 mt-1 space-y-0.5">
                      <div>เงินสดต่ำสุด: <span className={rec.after.minBalance < 0 ? 'text-rose-600' : 'text-emerald-600'}>{formatCurrency(rec.after.minBalance)}</span></div>
                      <div>วันวิกฤต: {rec.after.daysUntilDanger === null ? 'ไม่มี' : `อีก ${rec.after.daysUntilDanger} วัน`}</div>
                      <div>ติดลบ: <span className={rec.after.dangerDays === 0 ? 'text-emerald-600' : 'text-rose-600'}>{rec.after.dangerDays} วัน</span></div>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 5. Hero Summary */}
      <div className="bg-white p-6 rounded-2xl relative overflow-hidden border border-slate-200 shadow-sm">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 relative z-10">
          <div className="space-y-4 flex-1">
            <span className="badge-gold">
              <Sparkles className="w-3.5 h-3.5 text-indigo-600" />
              การวิเคราะห์กระแสเงินสด
            </span>

            <div className="space-y-2">
              <div className="flex justify-between items-end gap-4">
                <div>
                  <h1 className="text-2xl font-black text-slate-900 tracking-tight">ภาพรวมกระแสเงินสด</h1>
                  <p className="text-xs text-slate-500 font-medium mt-1">
                    ช่วง {new Date(dateRange.startDate).toLocaleDateString('th-TH')} - {new Date(dateRange.endDate).toLocaleDateString('th-TH')}
                  </p>
                </div>
                <div className="text-right">
                  <span className={`text-3xl font-black tracking-tight ${chartSummary.netTotal >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>{formatCurrency(chartSummary.netTotal)}</span>
                  <span className="block text-[11px] text-slate-500 font-bold">สุทธิ</span>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-1">
              <div className="bg-emerald-50/70 p-3 rounded-xl border border-emerald-100">
                <div className="text-xs text-slate-500 font-medium">รายรับรวม</div>
                <div className="text-base font-extrabold text-emerald-600">{formatCurrency(chartSummary.totalIncome)}</div>
                <div className={`text-[10px] mt-1 flex items-center gap-1 ${chartSummary.incomeTrend >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                  <TrendingUp className="w-3 h-3" /> +{chartSummary.incomeTrend.toFixed(1)}%
                </div>
              </div>

              <div className="bg-rose-50/70 p-3 rounded-xl border border-rose-100">
                <div className="text-xs text-slate-500 font-medium">รายจ่ายรวม</div>
                <div className="text-base font-extrabold text-rose-600">{formatCurrency(chartSummary.totalExpense)}</div>
                <div className={`text-[10px] mt-1 flex items-center gap-1 ${chartSummary.expenseTrend <= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                  <TrendingDown className="w-3 h-3" /> {chartSummary.expenseTrend.toFixed(1)}%
                </div>
              </div>

              <div className="bg-indigo-50/70 p-3 rounded-xl border border-indigo-100">
                <div className="text-xs text-slate-500 font-medium flex items-center gap-1">
                  <Calendar className="w-3 h-3 text-indigo-600" />
                  จำนวนช่วงเวลา
                </div>
                <div className="text-base font-extrabold text-slate-900">{chartSummary.chartData.length || 0}</div>
              </div>

              <div className="bg-purple-50/70 p-3 rounded-xl border border-purple-100">
                <div className="text-xs text-slate-500 font-medium flex items-center gap-1">
                  <PiggyBank className="w-3 h-3 text-purple-600" />
                  เฉลี่ย/ช่วง
                </div>
                <div className={`text-base font-extrabold ${chartSummary.netTotal >= 0 ? 'text-purple-600' : 'text-rose-600'}`}>
                  {formatCurrency(chartSummary.netTotal / (chartSummary.chartData.length || 1))}
                </div>
              </div>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row gap-3 justify-center w-full lg:w-auto">
            <button
              onClick={() => setShowAddEntry(!showAddEntry)}
              className="btn-gold text-xs py-3 px-5 flex items-center gap-2 font-extrabold shadow-md cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              บันทึกรายการใหม่
            </button>
            <button
              onClick={() => setEntryFilter(entryFilter === 'all' ? 'income' : entryFilter === 'income' ? 'expense' : 'all')}
              className="btn-secondary text-xs py-2.5 px-4 flex items-center gap-1.5 cursor-pointer font-bold"
            >
              <Filter className="w-4 h-4" />
              กรอง: {entryFilter === 'all' ? 'ทั้งหมด' : entryFilter === 'income' ? 'รายรับ' : 'รายจ่าย'}
            </button>
          </div>
        </div>
      </div>

      {/* 6. Line Chart Section */}
      <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-100">
          <div>
            <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
              <LineChart className="w-5 h-5 text-indigo-600" />
              กราฟกระแสเงินสด ({chartTimePeriod})
            </h2>
            <p className="text-xs text-slate-500 font-medium">แสดง {chartDataType === 'income' ? 'รายรับ' : chartDataType === 'expense' ? 'รายจ่าย' : 'สุทธิ'} ตาม {chartTimePeriod}</p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <select
              value={chartTimePeriod}
              onChange={(e) => setChartTimePeriod(e.target.value)}
              className="text-xs px-3 py-1.5 rounded-xl border bg-white text-slate-700 border-slate-200 hover:border-slate-300 cursor-pointer font-medium"
            >
              <option value="daily">รายวัน</option>
              <option value="weekly">รายสัปดาห์</option>
              <option value="monthly">รายเดือน</option>
            </select>

            <select
              value={chartDataType}
              onChange={(e) => setChartDataType(e.target.value)}
              className="text-xs px-3 py-1.5 rounded-xl border bg-white text-slate-700 border-slate-200 hover:border-slate-300 cursor-pointer font-medium"
            >
              <option value="income">รายรับ</option>
              <option value="expense">รายจ่าย</option>
              <option value="net">สุทธิ</option>
            </select>

            <button
              onClick={() => setDateRange({
                startDate: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
                endDate: new Date().toISOString().split('T')[0]
              })}
              className="text-xs px-3 py-1.5 rounded-xl border bg-indigo-50 text-indigo-700 border-indigo-200 hover:bg-indigo-100 font-medium cursor-pointer"
            >
              30วัน
            </button>
            <button
              onClick={() => setDateRange({
                startDate: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
                endDate: new Date().toISOString().split('T')[0]
              })}
              className="text-xs px-3 py-1.5 rounded-xl border bg-indigo-50 text-indigo-700 border-indigo-200 hover:bg-indigo-100 font-medium cursor-pointer"
            >
              90วัน
            </button>
          </div>
        </div>

        {/* Historical bar chart */}
        <div className="mt-6 h-80 bg-slate-50 rounded-xl border border-slate-200 flex items-center justify-center relative overflow-hidden">
          <div className="text-center space-y-4 p-8">
            <LineChart className="w-16 h-16 text-indigo-300 mx-auto" />
            <div>
              <h3 className="text-base font-bold text-slate-700 mb-2">กราฟแท่งแสดงกระแสเงินสดย้อนหลัง</h3>
              <p className="text-xs text-slate-500 mb-4">
                แสดง {chartDataType === 'income' ? 'รายรับ' : chartDataType === 'expense' ? 'รายจ่าย' : 'สุทธิ'} {chartTimePeriod === 'daily' ? 'รายวัน' : chartTimePeriod === 'weekly' ? 'รายสัปดาห์' : 'รายเดือน'}
              </p>
              {chartSummary.chartData.length === 0 ? (
                <p className="text-xs text-slate-400 font-medium">ยังไม่มีข้อมูลในช่วงเวลาที่เลือก</p>
              ) : (
                <div className="bg-white rounded-lg p-4 border border-slate-200 inline-block">
                  <div className="flex items-end gap-2 h-32 mb-2">
                    {chartSummary.chartData.slice(-7).map((item, idx) => {
                      const allValues = chartSummary.chartData.map(d =>
                        chartDataType === 'income' ? d.income : chartDataType === 'expense' ? d.expense : d.net
                      );
                      const maxValue = Math.max(...allValues);
                      const minValue = Math.min(...allValues);
                      const value = chartDataType === 'income' ? item.income : chartDataType === 'expense' ? item.expense : item.net;
                      const heightPercent = maxValue > 0 ? Math.abs(value / maxValue) * 100 : 0;
                      const colorClass = value < 0 ? 'bg-rose-500' : chartDataType === 'income' ? 'bg-emerald-500' : chartDataType === 'expense' ? 'bg-rose-500' : 'bg-indigo-500';

                      return (
                        <div key={idx} className="flex flex-col items-center gap-1">
                          <div
                            className={`w-8 rounded-t-lg ${colorClass} transition-all hover:opacity-80 cursor-pointer`}
                            style={{ height: `${Math.max(5, heightPercent)}%` }}
                            title={`${item.periodLabel}: ${formatCurrency(value)} (ช่วง ${formatCurrency(minValue)} - ${formatCurrency(maxValue)})`}
                          />
                          <span className="text-[10px] text-slate-500">
                            {item.periodLabel.length > 8 ? item.periodLabel.substring(0, 6) + '...' : item.periodLabel}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                  <div className="flex justify-between text-[10px] text-slate-600 font-medium">
                    <span>{formatCurrency(Math.min(...chartSummary.chartData.map(d =>
                      chartDataType === 'income' ? d.income : chartDataType === 'expense' ? d.expense : d.net
                    )))}</span>
                    <span>{formatCurrency(Math.max(...chartSummary.chartData.map(d =>
                      chartDataType === 'income' ? d.income : chartDataType === 'expense' ? d.expense : d.net
                    )))}</span>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* 7. Add/Edit Entry Form */}
      {showAddEntry && (
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm animate-fade-in">
          <h3 className="text-base font-bold text-slate-900 flex items-center gap-2 border-b border-slate-100 pb-3 mb-4">
            <Plus className="w-5 h-5 text-indigo-600" />
            {editingEntry ? 'แก้ไขรายการ' : 'เพิ่มรายการกระแสเงินสดใหม่'}
          </h3>

          <form onSubmit={addCashflowEntry} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="sm:col-span-2 lg:col-span-1">
                <label className="text-xs font-bold text-slate-700 block mb-1">ประเภท</label>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setFormData(prev => ({ ...prev, type: 'income' }))}
                    className={`flex-1 py-2 px-3 rounded-lg border text-xs font-bold transition-colors cursor-pointer ${formData.type === 'income'
                      ? 'bg-emerald-50 text-emerald-700 border-emerald-300'
                      : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'}`}
                  >
                    <TrendingUp className="w-3.5 h-3.5 inline mr-1" />
                    รายรับ
                  </button>
                  <button
                    type="button"
                    onClick={() => setFormData(prev => ({ ...prev, type: 'expense' }))}
                    className={`flex-1 py-2 px-3 rounded-lg border text-xs font-bold transition-colors cursor-pointer ${formData.type === 'expense'
                      ? 'bg-rose-50 text-rose-700 border-rose-300'
                      : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'}`}
                  >
                    <TrendingDown className="w-3.5 h-3.5 inline mr-1" />
                    รายจ่าย
                  </button>
                </div>
              </div>

              <div className="sm:col-span-2 lg:col-span-1">
                <label className="text-xs font-bold text-slate-700 block mb-1">จำนวนเงิน (บาท) *</label>
                <input
                  type="number"
                  placeholder="เช่น 5000"
                  value={formData.amount}
                  onChange={(e) => setFormData(prev => ({ ...prev, amount: e.target.value }))}
                  className="input-dark font-black text-indigo-600 text-base w-full"
                  required
                />
              </div>

              <div className="sm:col-span-2 lg:col-span-1">
                <label className="text-xs font-bold text-slate-700 block mb-1">วันที่</label>
                <input
                  type="date"
                  value={formData.date}
                  onChange={(e) => setFormData(prev => ({ ...prev, date: e.target.value }))}
                  className="input-dark text-slate-800 font-medium w-full"
                />
              </div>

              <div className="sm:col-span-2 lg:col-span-1">
                <label className="text-xs font-bold text-slate-700 block mb-1">หมวดหมู่ *</label>
                <select
                  value={formData.category}
                  onChange={(e) => setFormData(prev => ({ ...prev, category: e.target.value }))}
                  className="input-dark text-slate-800 font-medium w-full cursor-pointer"
                  required
                >
                  <option value="">เลือกหมวดหมู่</option>
                  {(formData.type === 'income' ? incomeCategories : expenseCategories).map(cat => (
                    <option key={cat.id} value={cat.id}>
                      {cat.icon} {cat.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="sm:col-span-2 lg:col-span-2">
                <label className="text-xs font-bold text-slate-700 block mb-1">รายละเอียด *</label>
                <input
                  type="text"
                  placeholder="เช่น เงินเดือน, ค่าเช่า, ค่าขนส่ง..."
                  value={formData.description}
                  onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                  className="input-dark text-slate-800 font-medium w-full"
                  required
                />
              </div>

              {formData.type === 'expense' && (
                <div className="sm:col-span-2 lg:col-span-2">
                  <div className="bg-slate-50 p-3 rounded-lg border border-slate-200 space-y-2">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={formData.isDebtPayment}
                        onChange={(e) => setFormData(prev => ({ ...prev, isDebtPayment: e.target.checked }))}
                        className="w-4 h-4 text-indigo-600 rounded border-slate-300"
                      />
                      <span className="text-xs font-medium text-slate-700">จ่ายหนี้ (จะบันทึกในประวัติการชำระหนี้ด้วย)</span>
                    </label>
                    {formData.isDebtPayment && (
                      <>
                        <div>
                          <label className="text-xs font-bold text-slate-600 block mb-1">เลือกรายการหนี้ที่จ่าย *</label>
                          <select
                            value={formData.debtId}
                            onChange={(e) => setFormData(prev => ({ ...prev, debtId: e.target.value }))}
                            className="input-dark text-slate-800 font-medium w-full cursor-pointer"
                            required
                          >
                            <option value="">เลือกหนี้ที่จ่าย</option>
                            {activeDebts.map(d => (
                              <option key={d.id} value={d.id}>
                                {d.name} (คงเหลือ: {formatCurrency(d.balance)})
                              </option>
                            ))}
                          </select>
                        </div>
                        <div className="text-xs text-slate-600 bg-white p-2 rounded border border-slate-200">
                          💡 รายจ่ายนี้จะบันทึกเป็นทั้งรายการเงินสด และหักยอดหนี้ในประวัติการชำระหนี้ให้อัตโนมัติ
                        </div>
                      </>
                    )}
                  </div>
                </div>
              )}
            </div>

            <div className="flex justify-end gap-3 pt-4 border-t border-slate-100">
              <button
                type="button"
                onClick={() => {
                  setShowAddEntry(false);
                  setEditingEntry(null);
                  setFormData({
                    type: 'income',
                    amount: '',
                    category: '',
                    description: '',
                    date: new Date().toISOString().split('T')[0],
                    isDebtPayment: false,
                    debtId: ''
                  });
                }}
                className="text-xs px-4 py-2.5 rounded-xl border text-slate-600 border-slate-200 hover:bg-slate-100 font-medium cursor-pointer"
              >
                ยกเลิก
              </button>
              <button
                type="submit"
                className="btn-gold text-xs py-2.5 px-5 flex items-center gap-2 font-extrabold shadow-md cursor-pointer"
              >
                <CheckCircle2 className="w-4 h-4" />
                {editingEntry ? 'บันทึกการแก้ไข' : 'เพิ่มรายการ'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* 8. Cashflow Entries List */}
      <div className="bg-white p-6 rounded-2xl space-y-4 border border-slate-200 shadow-sm">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
              <BarChart3 className="w-5 h-5 text-indigo-600" />
              บันทึกกระแสเงินสด ({filteredEntries.length} รายการ)
            </h3>
            <p className="text-xs text-slate-500 font-medium">แสดงรายการ {entryFilter === 'all' ? 'ทั้งหมด' : entryFilter === 'income' ? 'รายรับ' : 'รายจ่าย'} เรียงตามวันที่</p>
          </div>

          {filteredEntries.length > 0 && (
            <button
              onClick={() => exportPaymentHistoryToExcel(cashflowEntries, userName)}
              className="btn-gold text-xs py-1.5 px-3.5 flex items-center gap-1.5 font-bold cursor-pointer shadow-xs"
            >
              <Download className="w-4 h-4" />
              ดาวน์โหลด Excel
            </button>
          )}
        </div>

        {filteredEntries.length === 0 ? (
          <div className="text-center py-8 text-slate-400 text-xs font-medium">
            ยังไม่มีรายการกระแสเงินสด {entryFilter === 'all' ? '' : entryFilter === 'income' ? 'รายรับ' : 'รายจ่าย'} ในช่วงระยะเวลาที่เลือก
            <br />
            <button
              onClick={() => setShowAddEntry(true)}
              className="text-indigo-600 font-bold hover:underline cursor-pointer"
            >
              เพิ่มรายการแรกของคุณ
            </button>
          </div>
        ) : (
          <div className="space-y-3 max-h-96 overflow-y-auto">
            {filteredEntries.slice(0, 20).map((entry) => {
              const categoryInfo = getCategoryInfo(entry.category, entry.type);
              return (
                <div
                  key={entry.id}
                  className="p-4 rounded-xl border border-slate-200 bg-slate-50/60 hover:border-slate-300 hover:bg-slate-50/80 transition-all cursor-pointer group"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3 flex-1">
                      <div className={`p-2 rounded-xl ${categoryInfo.color} text-white shadow-sm`}>
                        <span className="text-lg">{categoryInfo.icon}</span>
                      </div>

                      <div className="flex-1">
                        <div className="font-bold text-slate-900 text-sm flex items-center gap-2">
                          {entry.description}
                          {entry.isDebtPayment && (
                            <span className="badge-gold text-[10px]">💳 จ่ายหนี้</span>
                          )}
                        </div>
                        <div className="text-xs text-slate-500 font-medium flex items-center gap-2 mt-0.5">
                          <Calendar className="w-3 h-3" />
                          {new Date(entry.date).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric' })}
                          <span className="text-slate-400">•</span>
                          <span className={`font-bold ${entry.type === 'income' ? 'text-emerald-600' : 'text-rose-600'}`}>
                            {entry.type === 'income' ? '+' : '-'}{formatCurrency(entry.amount)}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={() => editEntry(entry)}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-indigo-600 hover:bg-slate-100 transition-colors cursor-pointer"
                        title="แก้ไข"
                      >
                        <Edit3 className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => deleteEntry(entry.id)}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer"
                        title="ลบ"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
            {filteredEntries.length > 20 && (
              <div className="text-center pt-4 border-t border-slate-200">
                <span className="text-xs text-slate-500 font-medium">
                  แสดง 20 รายการแรก จากทั้งหมด {filteredEntries.length} รายการ
                </span>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// Helper function for week numbers
Date.prototype.getWeek = function () {
  const date = new Date(this);
  const firstDayOfYear = new Date(date.getFullYear(), 0, 1);
  const pastDaysOfYear = Math.floor((date - firstDayOfYear) / 86400000);
  return Math.ceil((pastDaysOfYear + firstDayOfYear.getDay() + 1) / 7);
};
