/**
 * Refinance Net Savings Math Engine
 *
 * Pure, dependency-free calculation utilities used by the Refinance Dashboard.
 * Everything is deterministic — the same input always produces the same output,
 * so the numbers shown on screen and printed in the PDF are identical.
 *
 * Concept:
 *   - Load the local bank promo matrix from `src/data/refinanceRates.json`
 *     (NO third-party bank APIs — fully standalone).
 *   - Filter packages the user does NOT qualify for (income / occupation).
 *   - Compare the total interest paid over `termYears` (default 3 years) between
 *     the current bank and each candidate bank using standard amortization.
 *   - Subtract the one-time transfer fees (mortgage registration 1%,
 *     appraisal ~฿3,000, duty stamp 0.05%) with waiver promos applied.
 *   - Net Savings = (Current 3Y Interest − New 3Y Interest) − Total Transfer Fees
 *   - Break-even = how many months of lower installments it takes to recover fees.
 */

import RATE_MATRIX from '../data/refinanceRates.json';

export const TERM_MONTHS_DEFAULT = 36; // 3 years

/** Occupation keys used across the app (must match documentChecklist + JSON). */
export const OCCUPATIONS = ['salaried', 'government', 'freelance', 'business', 'pensioner', 'other'];

/**
 * Standard monthly amortization payment.
 * M = P * r / (1 − (1 + r)^−n)   where r = monthly rate, n = months.
 * Handles the 0% rate edge case (no interest → simple division).
 */
export function monthlyPayment(principal, annualRatePct, months = TERM_MONTHS_DEFAULT) {
  const P = Number(principal) || 0;
  const rate = (Number(annualRatePct) || 0) / 100 / 12; // monthly rate
  const n = Number(months) || 1;
  if (P <= 0) return 0;
  if (rate <= 0) return P / n;
  return (P * rate) / (1 - Math.pow(1 + rate, -n));
}

/** Total interest paid over the whole term: (payment × months) − principal. */
export function totalInterestPaid(principal, annualRatePct, months = TERM_MONTHS_DEFAULT) {
  const P = Number(principal) || 0;
  const n = Number(months) || 1;
  return Math.max(0, monthlyPayment(P, annualRatePct, n) * n - P);
}

/**
 * Eligibility check against one package's criteria.
 * A package is eligible only when BOTH income and occupation match.
 */
export function isPackageEligible(pkg, { monthlyIncome, occupation }) {
  if (!pkg) return false;
  const incomeOk = Number(monthlyIncome) >= Number(pkg.minIncome || 0);
  const occupationOk = occupation === 'other' || (pkg.allowedOccupations || []).includes(occupation);
  return incomeOk && occupationOk;
}

/**
 * Calculate the one-time transfer fees for a package, applying waiver promos.
 *
 * @returns {{ total: number, breakdown: Array<{key,label,amount,waived}> }}
 */
export function calculateTransferFees(pkg, balance, { wantMRTA = false } = {}) {
  const B = Number(balance) || 0;
  const fees = pkg.fees || RATE_MATRIX.defaultFees || {};

  // Raw fee amounts (before waivers)
  const raw = [
    { key: 'mortgageRegistration', label: 'ค่าจดจำนอง (1%)', amount: B * Number(fees.mortgageRegistrationPct || 0) },
    { key: 'appraisal', label: 'ค่าประเมินหลักทรัพย์', amount: Number(fees.appraisalFee || 0) },
    { key: 'dutyStamp', label: 'อากรแสตมป์ (0.05%)', amount: B * Number(fees.dutyStampPct || 0) }
  ];

  // Which fee keys are waived by promos (MRTA-conditional promos only apply if user wants MRTA)
  const waivedKeys = new Set();
  (pkg.waiverPromos || []).forEach(promo => {
    if (promo.requiresMRTA && !wantMRTA) return; // skip MRTA-only promos
    (promo.waives || []).forEach(key => waivedKeys.add(key));
  });

  const breakdown = raw.map(item => {
    const waived = waivedKeys.has(item.key);
    return { ...item, amount: Math.round(item.amount), waived };
  });

  const total = breakdown.reduce((sum, item) => sum + (item.waived ? 0 : item.amount), 0);
  return { total, breakdown };
}

/**
 * Break-even period in months: how long the monthly installment savings
 * take to recover the one-time transfer fees.
 * Returns Infinity when the new installment is NOT cheaper (never breaks even).
 */
export function calculateBreakEvenMonths(feesTotal, currentMonthly, newMonthly) {
  const monthlySavings = Number(currentMonthly) - Number(newMonthly);
  if (monthlySavings <= 0) return Infinity;
  return Math.ceil(Number(feesTotal) / monthlySavings);
}

/**
 * Main entry point — compare every eligible bank package and rank them
 * by net savings (highest first).
 *
 * @param {object} input
 * @param {number} input.currentBalance  outstanding home-loan balance (฿)
 * @param {number} input.currentRate     current annual interest rate (%)
 * @param {number} input.monthlyIncome   monthly income (฿)
 * @param {string} input.occupation      'salaried' | 'freelance' | 'business'
 * @param {boolean} [input.wantMRTA]     whether the user will buy MRTA insurance
 * @param {number} [input.termYears]     comparison horizon in years (default 3)
 * @param {Array}  [input.packages]      override package list (for tests)
 *
 * @returns {object} { current, results, best, meta }
 */
export function calculateRefinanceSavings({
  currentBalance,
  currentRate,
  monthlyIncome,
  occupation,
  wantMRTA = false,
  termYears = 3,
  termMonths = null,
  packages = RATE_MATRIX.packages
}) {
  const B = Number(currentBalance) || 0;
  const months = termMonths ? Number(termMonths) : Math.max(1, Math.round(Number(termYears) * 12));

  // Current bank baseline
  const currentMonthly = monthlyPayment(B, currentRate, months);
  const currentInterest = totalInterestPaid(B, currentRate, months);

  // 1. Filter eligible packages
  const eligible = (packages || []).filter(pkg => isPackageEligible(pkg, { monthlyIncome, occupation }));

  // 2-4. For each candidate: interest comparison, fees, net savings, break-even
  const results = eligible.map(pkg => {
    const newMonthly = monthlyPayment(B, pkg.rate3YAvg, months);
    const newInterest = totalInterestPaid(B, pkg.rate3YAvg, months);
    const grossSavings = currentInterest - newInterest;
    const fees = calculateTransferFees(pkg, B, { wantMRTA });
    const netSavings = grossSavings - fees.total;
    return {
      package: pkg,
      bank: pkg.bank,
      bankShort: pkg.bankShort,
      packageTitle: pkg.packageTitle,
      rate3YAvg: pkg.rate3YAvg,
      minIncome: pkg.minIncome,
      eligible: true,
      newMonthly,
      newInterest,
      grossSavings,
      fees,
      netSavings,
      breakEvenMonths: calculateBreakEvenMonths(fees.total, currentMonthly, newMonthly)
    };
  });

  // Sort: highest net savings first, tie-break by lowest rate
  results.sort((a, b) =>
    b.netSavings - a.netSavings ||
    a.rate3YAvg - b.rate3YAvg
  );

  return {
    meta: {
      currency: RATE_MATRIX.currency,
      termYears,
      termMonths: months,
      disclaimer: RATE_MATRIX.disclaimer,
      updatedAt: RATE_MATRIX.updatedAt
    },
    current: {
      balance: B,
      rate: Number(currentRate) || 0,
      monthly: currentMonthly,
      totalInterest: currentInterest
    },
    results,
    best: results[0] || null
  };
}

/** Format a number as Thai Baht currency (used by UI + PDF). */
export function formatBaht(n) {
  const value = Number(n) || 0;
  const rounded = Math.round(value);
  return new Intl.NumberFormat('th-TH', { maximumFractionDigits: 0 }).format(rounded) + ' บาท';
}
