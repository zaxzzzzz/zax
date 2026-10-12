/**
 * Predictive Cash Flow & Risk Early Warning Engine
 *
 * A deterministic 30–90 day daily liquidity engine built from the user's REAL data:
 *  - Debt minimum payments projected on their due day every month
 *  - Recurring income (from past income entries, projected monthly on the same day)
 *  - Average daily non-debt expense from the past `historyDays`
 *  - Optional monthly extra debt payment (extraBudget)
 *
 * Risk detection ("Danger Zone") and AI prescriptive recommendations are also
 * deterministic — every recommendation re-runs the projection with modified
 * inputs so its impact is backed by numbers.
 */

// Parse "15 ของทุกเดือน" -> 15 (clamped to a valid day-of-month)
export function parseDueDay(dueDateStr) {
  const match = String(dueDateStr || '').match(/(\d{1,2})/);
  const day = match ? parseInt(match[1], 10) : 15;
  return Math.min(28, Math.max(1, day));
}

// Parse 'YYYY-MM-DD' safely as LOCAL date (new Date('YYYY-MM-DD') is UTC and can shift a day)
export function parseDateStr(dateStr) {
  const parts = String(dateStr || '').split('-').map(Number);
  if (parts.length !== 3 || parts.some(isNaN)) return null;
  return new Date(parts[0], parts[1] - 1, parts[2]);
}

function toDateStr(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function addDays(date, days) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

/**
 * Project daily cash balance for the next `horizonDays`.
 *
 * @param {object} opts
 * @param {Array}  opts.debts            [{ id, name, minPayment, dueDate, interestRate }]
 * @param {Array}  opts.cashflowEntries  [{ type:'income'|'expense', amount, category, date, isDebtPayment }]
 * @param {number} opts.startingBalance  current cash on hand
 * @param {number} opts.horizonDays      30 | 60 | 90
 * @param {number} opts.monthlyExtra     extraBudget to project as a monthly extra payment
 * @param {boolean} opts.includeExtra    whether monthlyExtra is included
 * @param {number} opts.historyDays      how far back to look for recurring income / expense (default 60)
 * @param {Array}  opts.pauseDebtIds     debt ids to pause min payments for the first `pauseMonths` months
 * @param {number} opts.pauseMonths      how many months the paused debts skip their min payment (e.g. 2)
 * @param {number} opts.pauseExtraMonths pause the monthly extra (โปะ) payment for the first N months (e.g. 2)
 * @param {number} opts.monthlyIncome    lump-sum monthly income (0 = derive from cashflow entries)
 * @param {number} opts.monthlyExpense   lump-sum monthly expense (0 = derive from cashflow entries)
 * @param {number} opts.incomeDay        day of month the monthly income is credited (1-28, default 1)
 */
export function projectDailyLiquidity({
  debts = [],
  cashflowEntries = [],
  startingBalance = 0,
  horizonDays = 90,
  monthlyExtra = 0,
  includeExtra = true,
  historyDays = 60,
  pauseDebtIds = [],
  pauseMonths = 0,
  pauseExtraMonths = 0,
  monthlyIncome = 0,
  monthlyExpense = 0,
  incomeDay = 1
} = {}) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const windowStart = addDays(today, -historyDays);
  const pauseSet = new Set(pauseDebtIds || []);
  const daysInCurrentMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();

  // ---- 1. Recurring income
  // If the user entered a lump-sum monthly income, use it (credited on `incomeDay` every month).
  // Otherwise fall back to the most recent income entry per category from the past entries.
  let recurringIncome = [];
  if (Number(monthlyIncome) > 0) {
    recurringIncome = [{
      amount: Number(monthlyIncome),
      dayOfMonth: Math.min(28, Math.max(1, Number(incomeDay) || 1)),
      category: 'salary',
      description: 'รายได้ต่อเดือน (กรอก)'
    }];
  } else {
    const incomeByCategory = {};
    (cashflowEntries || []).forEach(entry => {
      if (entry.type !== 'income') return;
      const d = parseDateStr(entry.date);
      if (!d || d < windowStart || d > today) return;
      const prev = incomeByCategory[entry.category];
      if (!prev || d > prev.date) {
        incomeByCategory[entry.category] = {
          date: d,
          amount: Number(entry.amount) || 0,
          dayOfMonth: d.getDate(),
          category: entry.category,
          description: entry.description
        };
      }
    });
    recurringIncome = Object.values(incomeByCategory);
  }

  // ---- 2. Average daily non-debt expense
  // If the user entered a lump-sum monthly expense, spread it evenly across the month.
  // Otherwise fall back to the average daily non-debt expense from past entries.
  let avgDailyExpense = 0;
  if (Number(monthlyExpense) > 0) {
    avgDailyExpense = Number(monthlyExpense) / daysInCurrentMonth;
  } else {
    let totalExpense = 0;
    (cashflowEntries || []).forEach(entry => {
      if (entry.type !== 'expense') return;
      if (entry.isDebtPayment || entry.category === 'debt_payment') return; // debt payments are projected from debts
      const d = parseDateStr(entry.date);
      if (!d || d < windowStart || d > today) return;
      totalExpense += Number(entry.amount) || 0;
    });
    avgDailyExpense = historyDays > 0 ? totalExpense / historyDays : 0;
  }

  // ---- 3. Debt minimum payment schedule
  const activeDebts = (debts || []).filter(d => Number(d.balance) > 0);
  const debtPayments = activeDebts.map(d => ({
    id: d.id,
    name: d.name,
    minPayment: Number(d.minPayment) || 0,
    dueDay: parseDueDay(d.dueDate)
  }));

  // Extra budget payment lands on the focus (highest-priority) debt's due day, or the 1st if no debts
  const extraDueDay = debtPayments.length > 0 ? debtPayments[0].dueDay : 1;

  // ---- 4. Daily simulation
  const series = [];
  let balance = Number(startingBalance) || 0;

  for (let i = 0; i < horizonDays; i++) {
    const date = addDays(today, i);
    const dayOfMonth = date.getDate();
    // Months elapsed since today (0 = current month, 1 = next month, ...)
    const monthsSinceStart = (date.getFullYear() - today.getFullYear()) * 12 + (date.getMonth() - today.getMonth());
    const isPauseWindow = pauseMonths > 0 && monthsSinceStart < pauseMonths;
    const events = [];

    // Recurring income on this day
    recurringIncome.forEach(inc => {
      if (inc.dayOfMonth === dayOfMonth) {
        balance += inc.amount;
        events.push({ type: 'income', label: `รายรับ: ${inc.description || inc.category}`, amount: inc.amount });
      }
    });

    // Average daily expense
    if (avgDailyExpense > 0) {
      balance -= avgDailyExpense;
      events.push({ type: 'expense', label: 'ค่าใช้จ่ายเฉลี่ยต่อวัน', amount: avgDailyExpense });
    }

    // Debt minimum payments on this day (skipped for paused debts during the pause window)
    debtPayments.forEach(dp => {
      if (dp.dueDay !== dayOfMonth || dp.minPayment <= 0) return;
      if (isPauseWindow && pauseSet.has(dp.id)) {
        events.push({ type: 'pause', label: `พักชำระ ${dp.name} (เดือน ${monthsSinceStart + 1})`, amount: 0 });
        return;
      }
      balance -= dp.minPayment;
      events.push({ type: 'debt', label: `ค่างวด ${dp.name}`, amount: dp.minPayment });
    });

    // Monthly extra debt payment (paused during the extra pause window)
    if (includeExtra && Number(monthlyExtra) > 0 && extraDueDay === dayOfMonth) {
      if (pauseExtraMonths > 0 && monthsSinceStart < pauseExtraMonths) {
        events.push({ type: 'pause', label: 'พักงบโปะหนี้เพิ่ม (ชั่วคราว)', amount: 0 });
      } else {
        balance -= Number(monthlyExtra);
        events.push({ type: 'debt', label: 'งบโปะหนี้เพิ่ม', amount: Number(monthlyExtra) });
      }
    }

    series.push({
      index: i,
      date: toDateStr(date),
      label: date.toLocaleDateString('th-TH', { day: 'numeric', month: 'short' }),
      balance: Math.round(balance * 100) / 100,
      events
    });
  }

  // ---- 5. Danger Zone statistics
  const balances = series.map(s => s.balance);
  const minBalance = Math.min(...balances);
  const minBalanceIndex = balances.indexOf(minBalance);
  const dangerDays = balances.filter(b => b < 0).length;
  const firstDangerIndex = balances.findIndex(b => b < 0);

  const safetyBuffer = avgDailyExpense * 30; // one month of expenses as a safety cushion

  let risk = 'safe';
  let riskReason = '';

  if (firstDangerIndex !== -1 && firstDangerIndex < 30) {
    risk = 'danger';
    riskReason = `เงินสดจะติดลบภายใน ${firstDangerIndex + 1} วัน (วันที่ ${series[firstDangerIndex].label}) อยู่ในโซนอันตราย!`;
  } else if (dangerDays > 0) {
    risk = 'warning';
    riskReason = `เงินสดจะติดลบ ${dangerDays} วัน ภายใน ${horizonDays} วันข้างหน้า (เริ่มวันที่ ${series[firstDangerIndex].label}) ควรเตรียมแผนล่วงหน้า`;
  } else if (safetyBuffer > 0 && minBalance < safetyBuffer) {
    risk = 'warning';
    riskReason = `เงินสดคงเหลือต่ำสุด ${formatBaht(minBalance)} น้อยกว่าเงินสำรอง 1 เดือน (${formatBaht(safetyBuffer)}) ควรเพิ่มสภาพคล่อง`;
  } else {
    riskReason = 'กระแสเงินสดคาดการณ์อยู่ในเกณฑ์ปลอดภัย';
  }

  return {
    series,
    minBalance,
    minBalanceDate: series[minBalanceIndex]?.date || null,
    minBalanceLabel: series[minBalanceIndex]?.label || '-',
    dangerDays,
    firstDangerIndex: firstDangerIndex === -1 ? null : firstDangerIndex,
    firstDangerLabel: firstDangerIndex === -1 ? null : series[firstDangerIndex].label,
    daysUntilDanger: firstDangerIndex === -1 ? null : firstDangerIndex + 1,
    risk,
    riskReason,
    safetyBuffer,
    assumptions: {
      recurringIncome,
      avgDailyExpense,
      debtPayments,
      monthlyExtraIncluded: includeExtra && Number(monthlyExtra) > 0,
      monthlyIncomeInput: Number(monthlyIncome) > 0 ? Number(monthlyIncome) : null,
      monthlyExpenseInput: Number(monthlyExpense) > 0 ? Number(monthlyExpense) : null,
      incomeDay: Number(incomeDay) > 0 ? Math.min(28, Math.max(1, Number(incomeDay))) : 1
    }
  };
}

function formatBaht(n) {
  return new Intl.NumberFormat('th-TH', { style: 'currency', currency: 'THB', maximumFractionDigits: 0 }).format(n || 0);
}

/**
 * AI prescriptive recommendations.
 * Each recommendation is a deterministic re-simulation; impact is shown as
 * before -> after numbers (min balance / danger days / days until danger).
 */
export function buildCashflowRecommendations({
  debts = [],
  cashflowEntries = [],
  startingBalance = 0,
  horizonDays = 90,
  monthlyExtra = 0,
  includeExtra = true,
  historyDays = 60,
  monthlyIncome = 0,
  monthlyExpense = 0,
  incomeDay = 1
} = {}) {
  const baseOpts = { debts, cashflowEntries, startingBalance, horizonDays, monthlyExtra, includeExtra, historyDays, monthlyIncome, monthlyExpense, incomeDay };
  const base = projectDailyLiquidity(baseOpts);
  const recs = [];
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const summarize = (sim) => ({
    minBalance: sim.minBalance,
    dangerDays: sim.dangerDays,
    daysUntilDanger: sim.daysUntilDanger,
    risk: sim.risk
  });
  const impactText = (sim) => {
    const parts = [];
    parts.push(`เงินสดต่ำสุด ${formatBaht(sim.minBalance)}`);
    parts.push(`วันวิกฤต ${sim.daysUntilDanger === null ? 'ไม่มี' : `อีก ${sim.daysUntilDanger} วัน`}`);
    parts.push(`ติดลบ ${sim.dangerDays} วัน`);
    return parts.join(' • ');
  };

  // R1: Pause the extra (โปะ) debt payment for 2 months
  if (includeExtra && Number(monthlyExtra) > 0) {
    const sim = projectDailyLiquidity({ ...baseOpts, pauseExtraMonths: 2 });
    recs.push({
      key: 'pause_extra',
      title: '⏸️ หยุดโปะหนี้ชั่วคราว (ประหยัดเงินสดทันที)',
      description: `หยุดจ่ายงบโปะเพิ่ม ${formatBaht(monthlyExtra)}/เดือน ไปก่อน ชั่วคราว 1-2 เดือน จ่ายเฉพาะค่างวดขั้นต่ำเพื่อรักษาสภาพคล่อง แล้วกลับมาโปะต่อเมื่อกระแสเงินสดฟื้น`,
      freedMonthly: Number(monthlyExtra),
      before: summarize(base),
      after: summarize(sim),
      impact: impactText(sim)
    });
  }

  // R2: Pay minimum only on the essential (highest-interest) debts, pause low-interest debts for 2 months
  const activeDebts = (debts || []).filter(d => Number(d.balance) > 0);
  const sortedByInterest = [...activeDebts].sort((a, b) => Number(a.interestRate) - Number(b.interestRate));
  if (sortedByInterest.length >= 2) {
    const shortfall = Math.max(0, -base.minBalance);
    let freed = 0;
    const paused = [];
    for (const d of sortedByInterest) {
      if (freed >= shortfall && paused.length > 0) break;
      freed += Number(d.minPayment) || 0;
      paused.push(d);
      if (freed >= shortfall) break;
    }
    const pausedIds = paused.map(d => d.id);
    const sim = projectDailyLiquidity({ ...baseOpts, pauseDebtIds: pausedIds, pauseMonths: 2 });
    recs.push({
      key: 'pause_low_interest',
      title: '💳 จ่ายขั้นต่ำเฉพาะหนี้สำคัญ พักหนี้ดอกเบี้ยต่ำ 2 เดือน',
      description: `พักชำระ ${paused.map(d => d.name).join(', ')} (ดอกเบี้ยต่ำสุด) เป็นเวลา 2 เดือน แล้วนำเงิน ${formatBaht(freed)}/เดือน ไปประคองค่าใช้จ่ายจำเป็นและหนี้ดอกเบี้ยสูง`,
      freedMonthly: freed,
      before: summarize(base),
      after: summarize(sim),
      impact: impactText(sim)
    });
  }

  // R3: Cut expenses by 20% (lump-sum monthly expense if entered, otherwise the largest non-debt expense category)
  if (Number(monthlyExpense) > 0) {
    const cut = Number(monthlyExpense) * 0.2;
    const sim = projectDailyLiquidity({ ...baseOpts, monthlyExpense: Number(monthlyExpense) * 0.8 });
    recs.push({
      key: 'cut_expense',
      title: '✂️ ลดรายจ่ายต่อเดือนลง 20%',
      description: `จากรายจ่ายต่อเดือนที่กรอกไว้ ${formatBaht(monthlyExpense)} ลองลดลง 20% จะประหยัดได้ประมาณ ${formatBaht(cut)}/เดือน`,
      freedMonthly: cut,
      before: summarize(base),
      after: summarize(sim),
      impact: impactText(sim)
    });
  } else {
    const windowStart = addDays(today, -historyDays);
    const expenseByCategory = {};
    (cashflowEntries || []).forEach(entry => {
      if (entry.type !== 'expense' || entry.isDebtPayment || entry.category === 'debt_payment') return;
      const d = parseDateStr(entry.date);
      if (!d || d < windowStart || d > today) return;
      const key = entry.category || 'other';
      expenseByCategory[key] = (expenseByCategory[key] || 0) + (Number(entry.amount) || 0);
    });
    const topCategoryKey = Object.keys(expenseByCategory).sort((a, b) => expenseByCategory[b] - expenseByCategory[a])[0];
    if (topCategoryKey) {
      const monthlyAmount = (expenseByCategory[topCategoryKey] / historyDays) * 30;
      const cut = Math.max(0, monthlyAmount * 0.2);
      const sim = projectDailyLiquidity({
        ...baseOpts,
        cashflowEntries: (cashflowEntries || []).map(e =>
          e.category === topCategoryKey ? { ...e, amount: Number(e.amount) * 0.8 } : e
        )
      });
      recs.push({
        key: 'cut_expense',
        title: '✂️ ลดรายจ่ายหมวดใหญ่ลง 20%',
        description: `หมวด "${topCategoryKey}" มีรายจ่ายเฉลี่ย ${formatBaht(monthlyAmount)}/เดือน ลองลดลง 20% จะประหยัดได้ประมาณ ${formatBaht(cut)}/เดือน`,
        freedMonthly: cut,
        before: summarize(base),
        after: summarize(sim),
        impact: impactText(sim)
      });
    }
  }

  // R4: Increase income
  const currentMonthlyIncome = base.assumptions.recurringIncome.reduce((s, inc) => s + inc.amount, 0);
  const extraIncome = Math.max(5000, Math.round(currentMonthlyIncome * 0.1));
  const simIncome = projectDailyLiquidity({
    ...baseOpts,
    cashflowEntries: (cashflowEntries || []).concat([{
      type: 'income',
      amount: extraIncome,
      category: 'other_income',
      description: 'รายได้เสริม (AI แนะนำ)',
      date: toDateStr(addDays(today, -1))
    }])
  });
  recs.push({
    key: 'more_income',
    title: '💼 หารายได้เสริมชั่วคราว',
    description: `เพิ่มรายได้เสริมประมาณ ${formatBaht(extraIncome)}/เดือน (ขายของมือสอง งานฟรีแลนซ์ ฯลฯ) จนกว่ากระแสเงินสดจะกลับมาแข็งแรง`,
    freedMonthly: extraIncome,
    before: summarize(base),
    after: summarize(simIncome),
    impact: impactText(simIncome)
  });

  // Rank: recommendations that fully resolve the danger zone first, then by biggest improvement
  const resolves = recs.filter(r => r.after.dangerDays === 0);
  const others = recs.filter(r => r.after.dangerDays > 0);
  const improvement = (r) => base.dangerDays - r.after.dangerDays;
  const ranked = [...resolves, ...others].sort((a, b) => improvement(b) - improvement(a));
  const top = ranked[0] || null;

  return { base, recommendations: ranked, topRecommendation: top };
}
