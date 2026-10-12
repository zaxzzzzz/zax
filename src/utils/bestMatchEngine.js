/**
 * Precision Smart-Match Recommendation Engine
 * -------------------------------------------
 * Takes the user's refinance inputs + the admin promotion DB and computes the
 * ONE best-value option to show on the single-page refinance form.
 *
 * STRICT filter chain (a promo must pass ALL):
 *   1. Property type — user's property MUST be listed in promo.property_types
 *                      (empty property_types = accepts any property)
 *   2. Income        — promo.min_income <= user monthly income
 *   3. Customer type — promo.customer_type must accept the user's type
 *                      ('ทุกประเภท' / empty = accepts any)
 *   4. Loan tier     — promo.min_loan_tier <= target loan amount
 *                      (e.g. a ">=3M" table promo only matches loans of 3M+)
 *   5. Loan range    — min_loan_amount <= loan <= max_loan_amount
 *                      (0 = unbounded on that side)
 *   6. LTV           — loan <= max_ltv_percent% × estimated property value
 *                      (skipped when either value is unknown)
 *   7. MRTA          — promo.is_mrta must equal the user's MRTA preference
 *
 * Best pick: the eligible promo with the LOWEST avg_3yr_rate
 * (tie-break: highest net savings for transparency on the card).
 */

import { monthlyPayment, totalInterestPaid, calculateTransferFees, calculateBreakEvenMonths } from './refinanceCalculator';
import { normalizeRateMatrix, pickBestMatrixRow } from '../types/rateMatrix';

const TERM_MONTHS = 36; // 3-year comparison horizon

/** Default one-time transfer fees (mirrors refinanceRates.json defaultFees). */
const DEFAULT_FEES = {
  mortgageRegistrationPct: 0.01,
  appraisalFee: 3000,
  dutyStampPct: 0.0005
};

/** Fee-waiver label (Thai) -> fee key in calculateTransferFees. */
const FEE_WAIVER_KEY_MAP = {
  'ประเมินราคา': 'appraisal',
  'ค่าประเมิน': 'appraisal',
  'จดจำนอง': 'mortgageRegistration',
  'ค่าจดจำนอง': 'mortgageRegistration',
  'อากรแสตมป์': 'dutyStamp',
  'อากรณ์แสตมป์': 'dutyStamp'
};

/** Customer-type groups: which promo customer_types accept which user occupation key. */
const CUSTOMER_TYPE_ACCEPTS = {
  'พนักงานประจำ': ['salaried', 'government'],
  'เจ้าของกิจการ': ['business'],
  'ฟรีแลนซ์': ['freelance'],
  'ข้าราชการ': ['government'],
  'ผู้รับบำนาญ': ['pensioner'],
  'ทุกประเภท': ['salaried', 'government', 'freelance', 'business', 'pensioner', 'other']
};

/**
 * Parse a rate string like "2.49%", "คงที่ 2.20%", "MRR - 2.00%" into a number.
 * MRR formulas cannot be resolved without the live MRR value, so they return 0
 * (the promo-level avg_3yr_rate is used instead).
 */
export function parseRatePercent(rateStr) {
  if (rateStr === null || rateStr === undefined) return 0;
  const s = String(rateStr).trim();
  if (!s || /mrr/i.test(s)) return 0;
  const m = s.match(/(\d+(?:\.\d+)?)/);
  return m ? Number(m[1]) : 0;
}

/** Average of year1 (×1) + year2-3 (×2) rates → numeric 3-yr average (%). */
export function variantAvgRate(variant) {
  const y1 = parseRatePercent(variant?.year_1_rate);
  const y23 = parseRatePercent(variant?.year_2_3_rate);
  if (y1 > 0 && y23 > 0) return Number(((y1 + y23 * 2) / 3).toFixed(2));
  return y1 || y23 || 0;
}

/** Build the effective rate ladder for one promo variant. */
function variantRateLadder(variant) {
  const y1 = parseRatePercent(variant?.year_1_rate);
  const y23 = parseRatePercent(variant?.year_2_3_rate) || y1;
  return { year1: y1 || y23, year2_3: y23 };
}

/** Map Thai fee-waiver labels to calculator fee keys (unknown labels ignored). */
export function feeWaiversToKeys(feeWaivers = []) {
  const keys = [];
  (feeWaivers || []).forEach(label => {
    const key = FEE_WAIVER_KEY_MAP[String(label).trim()];
    if (key && !keys.includes(key)) keys.push(key);
  });
  return keys;
}

/** Resolve the user's effective customer-type string from the occupation key. */
export function occupationToCustomerType(occupation) {
  switch (occupation) {
    case 'government': return 'ข้าราชการ';
    case 'business': return 'เจ้าของกิจการ';
    case 'freelance': return 'ฟรีแลนซ์';
    case 'pensioner': return 'ผู้รับบำนาญ';
    case 'other': return 'ทุกประเภท';
    case 'salaried':
    default: return 'พนักงานประจำ';
  }
}

/**
 * STRICT eligibility check against one promotion (ALL rules must pass).
 * @param {object} promo - admin promotion record
 * @param {object} user  - { propertyType, monthlyIncome, occupation, targetLoanAmount,
 *                          wantMRTA, propertyValue? }
 * @returns {boolean}
 */
export function isPromoEligible(promo, user) {
  if (!promo) return false;

  // 1. Property type — must be explicitly listed (empty list = any property)
  const propertyTypes = Array.isArray(promo.property_types) ? promo.property_types : [];
  if (propertyTypes.length > 0 && user.propertyType) {
    if (!propertyTypes.includes(user.propertyType)) return false;
  }

  // 2. Income gate
  const income = Number(user.monthlyIncome) || 0;
  if (income < (Number(promo.min_income) || 0)) return false;

  // 3. Customer type — promo must accept the user's type
  const promoCustomer = String(promo.customer_type || '').trim();
  if (promoCustomer && promoCustomer !== 'ทุกประเภท') {
    const acceptedOccupations = CUSTOMER_TYPE_ACCEPTS[promoCustomer];
    if (acceptedOccupations && !acceptedOccupations.includes(user.occupation)) {
      // Also accept when the user's derived customer type matches exactly
      if (occupationToCustomerType(user.occupation) !== promoCustomer) return false;
    }
  }

  // 4. Loan-tier gate: promo tables for ">=3M" must not match smaller loans
  const loan = Number(user.targetLoanAmount) || 0;
  if (loan > 0 && loan < (Number(promo.min_loan_tier) || 0)) return false;

  // 5. Strict loan range (0 = unbounded on that side)
  if (loan > 0) {
    const minLoan = Number(promo.min_loan_amount) || 0;
    const maxLoan = Number(promo.max_loan_amount) || 0;
    if (minLoan > 0 && loan < minLoan) return false;
    if (maxLoan > 0 && loan > maxLoan) return false;
  }

  // 6. LTV gate — only enforced when both the loan and property value are known
  const maxLtv = Number(promo.max_ltv_percent) || 0;
  const propertyValue = Number(user.propertyValue) || 0;
  if (maxLtv > 0 && propertyValue > 0 && loan > 0) {
    if (loan > propertyValue * (maxLtv / 100)) return false;
  }

  // 7. MRTA gate — promo pricing assumes (or excludes) MRTA, must match exactly
  if (Boolean(promo.is_mrta) !== Boolean(user.wantMRTA)) return false;

  return true;
}

/**
 * Pick the best rate_matrix row (single condition row) for a user.
 * The user NEVER sees this matrix — the engine filters it by income / MRTA /
 * property type and returns only the row with the lowest avg_3yr_rate.
 * @param {object} promo - admin promotion record with rate_matrix
 * @param {{ monthlyIncome?: number, wantMRTA?: boolean, propertyType?: string, customerType?: string }} user
 * @returns {object|null} { row, rate3YAvg, rates } or null when no matrix
 */
export function pickMatrixRow(promo, user) {
  const matrix = normalizeRateMatrix(promo?.rate_matrix);
  if (matrix.length === 0) return null;
  const row = pickBestMatrixRow(promo.rate_matrix, user);
  if (!row) return null;
  const y1 = parseRatePercent(row.year_1_rate);
  const y23 = parseRatePercent(row.year_2_3_rate);
  return {
    row,
    rate3YAvg: Number(row.avg_3yr_rate) || variantAvgRate(row) || 0,
    rates: { year1: y1, year2_3: y23 || y1 }
  };
}

/**
 * Pick the MRTA-matching variant (style 1-4) of a promotion for a user.
 * When the banner table has multiple styles, use the cheapest one whose MRTA
 * condition matches the user's choice; fall back to the promo-level rate.
 */
export function pickVariant(promo, wantMRTA) {
  const variants = Array.isArray(promo.variants) ? promo.variants : [];
  if (variants.length > 0) {
    const matching = variants.filter(v => Boolean(v.is_mrta) === Boolean(wantMRTA));
    const pool = matching.length > 0 ? matching : variants;
    // Cheapest by numeric avg rate first, keep banner order as tie-break
    const sorted = [...pool].sort((a, b) => (variantAvgRate(a) || 99) - (variantAvgRate(b) || 99));
    const variant = sorted[0];
    const ladder = variantRateLadder(variant);
    const avg = variantAvgRate(variant) || Number(promo.avg_3yr_rate) || 0;
    return { variant, rate3YAvg: avg, rates: ladder };
  }
  const rate = Number(promo.avg_3yr_rate) || 0;
  return { variant: null, rate3YAvg: rate, rates: { year1: rate, year2_3: rate } };
}

/** Build the effective package shape consumed by the transfer-fee calculator. */
function packageForFees(promo) {
  const waivedKeys = feeWaiversToKeys(promo.fee_waivers);
  return {
    fees: promo.fees || DEFAULT_FEES,
    waiverPromos: waivedKeys.length > 0
      ? [{ id: 'bestmatch-fee-waivers', label: (promo.fee_waivers || []).join(' + '), waives: waivedKeys, requiresMRTA: false }]
      : []
  };
}

/**
 * Evaluate ONE promotion for the user → comparable result record.
 * @returns {object|null} null when the promo has no usable numeric rate
 */
export function evaluatePromotion(promo, user, { currentRate, termMonths = TERM_MONTHS } = {}) {
  // PRIORITY 1: detailed rate_matrix — filter by income/MRTA/property and use
  // ONLY the single best-matching row (the user never sees the full matrix).
  const matrixResult = pickMatrixRow(promo, user);
  if (matrixResult && matrixResult.rate3YAvg > 0) {
    return evaluatePromotionWithRates(promo, user, matrixResult, { currentRate, termMonths });
  }

  // PRIORITY 2 (fallback): legacy variants / promo-level rate ladder
  const { variant, rate3YAvg, rates } = pickVariant(promo, user.wantMRTA);
  if (!(rate3YAvg > 0)) return null;
  return evaluatePromotionWithRates(promo, user, { variant, rate3YAvg, rates }, { currentRate, termMonths });
}

/**
 * Shared evaluation body — computes monthly payment / savings / fees from a
 * resolved rate source (matrix row OR legacy variant OR promo-level rate).
 */
function evaluatePromotionWithRates(promo, user, { row = null, variant = null, rate3YAvg, rates }, { currentRate, termMonths }) {

  // The best matrix row (when present) also refines the fee-waiver conditions
  // so a "ฟรีค่าจดจำนอง" row only waives fees when THAT row offers it.
  const effectivePromo = row
    ? {
        ...promo,
        fee_waivers: (row.fee_waivers?.length > 0)
          ? row.fee_waivers
          : (row.is_free_mortgage ? ['จดจำนอง'] : promo.fee_waivers)
      }
    : promo;

  const loan = Number(user.targetLoanAmount) || 0;
  const newMonthly = monthlyPayment(loan, rate3YAvg, termMonths);
  const newInterest = totalInterestPaid(loan, rate3YAvg, termMonths);
  const currentInterest = totalInterestPaid(loan, currentRate, termMonths);
  const currentMonthly = monthlyPayment(loan, currentRate, termMonths);

  const fees = calculateTransferFees(packageForFees(effectivePromo), loan, { wantMRTA: Boolean(user.wantMRTA) });
  const grossSavings = currentInterest - newInterest;
  const netSavings = grossSavings - fees.total;

  return {
    promo,
    variant,
    matrixRow: row,
    matrixCondition: row
      ? {
          customer_group: row.customer_group,
          min_income: row.min_income,
          is_mrta: row.is_mrta,
          is_free_mortgage: row.is_free_mortgage
        }
      : null,
    bank_name: promo.bank_name,
    product_name: promo.product_name,
    promo_image_url: promo.promo_image_url || '',
    bank_ref_link: promo.bank_ref_link || '',
    min_income: Number(promo.min_income) || 0,
    min_loan_tier: Number(promo.min_loan_tier) || 0,
    max_ltv_percent: Number(promo.max_ltv_percent) || 0,
    customer_type: promo.customer_type || 'ทุกประเภท',
    property_types: Array.isArray(promo.property_types) ? promo.property_types : [],
    fee_waivers: Array.isArray(effectivePromo.fee_waivers) ? effectivePromo.fee_waivers : [],
    rate3YAvg,
    year1Rate: rates.year1,
    year2_3Rate: rates.year2_3,
    mrrFormula: variant?.mrr_formula || row?.after_year_3_rate || promo.after_year_3_rate || '',
    eir: Number(variant?.eir) || Number(row?.eir) || 0,
    styleName: variant?.style_name || '',
    newMonthly,
    currentMonthly,
    monthlyDelta: currentMonthly - newMonthly,
    grossSavings,
    feesTotal: fees.total,
    feesWaived: fees.breakdown.filter(f => f.waived).map(f => f.label),
    netSavings,
    breakEvenMonths: calculateBreakEvenMonths(fees.total, currentMonthly, newMonthly),
    avgMonthlyPayment: newMonthly // explicit alias for the card render
  };
}

/**
 * MAIN ENTRY — precision best-match recommendation.
 *
 * @param {object} input
 * @param {Array}  input.promotions          admin promotion records (DB)
 * @param {string} input.propertyType        user's property type (Thai, e.g. 'บ้านเดี่ยว')
 * @param {number} input.existingBalance     outstanding home-loan balance (฿)
 * @param {number} [input.topUpAmount]       cash-out / top-up (฿)
 * @param {number} [input.propertyValue]     estimated property value for the LTV gate (฿)
 * @param {number} input.currentRate         current loan rate (%/yr)
 * @param {number} input.monthlyIncome       income (฿/mo)
 * @param {string} input.occupation          occupation key from master data
 * @param {boolean} input.wantMRTA           MRTA option Yes/No
 * @param {number} [input.termMonths]        repayment horizon (default 36)
 *
 * @returns {{
 *   targetLoanAmount, eligibleCount, evaluatedCount,
 *   best, alternates, rejectedBy
 * }}
 */
export function findBestMatch({
  promotions = [],
  propertyType = '',
  existingBalance = 0,
  topUpAmount = 0,
  propertyValue = 0,
  currentRate = 0,
  monthlyIncome = 0,
  occupation = '',
  wantMRTA = false,
  termMonths = TERM_MONTHS
}) {
  const targetLoanAmount = Math.max(0, (Number(existingBalance) || 0) + (Number(topUpAmount) || 0));
  const user = {
    propertyType,
    monthlyIncome: Number(monthlyIncome) || 0,
    targetLoanAmount,
    propertyValue: Number(propertyValue) || 0,
    occupation,
    wantMRTA: Boolean(wantMRTA)
  };

  const eligible = (promotions || []).filter(p => isPromoEligible(p, user));
  const evaluated = eligible
    .map(p => evaluatePromotion(p, user, { currentRate, termMonths }))
    .filter(Boolean);

  // STRICT best pick: lowest avg_3yr_rate wins; tie-break by net savings
  evaluated.sort((a, b) =>
    a.rate3YAvg - b.rate3YAvg ||
    b.netSavings - a.netSavings
  );

  return {
    targetLoanAmount,
    eligibleCount: eligible.length,
    evaluatedCount: evaluated.length,
    best: evaluated[0] || null,
    alternates: evaluated.slice(1, 4), // kept for admin/debug, hidden by default
    rejectedBy: eligible.filter(p => !evaluated.some(e => e.promo.id === p.id))
  };
}

/** True when the result object contains a usable recommendation. */
export function hasUsableBestMatch(result) {
  return Boolean(result?.best && result.best.rate3YAvg > 0);
}

export default {
  parseRatePercent,
  variantAvgRate,
  feeWaiversToKeys,
  occupationToCustomerType,
  isPromoEligible,
  pickMatrixRow,
  pickVariant,
  evaluatePromotion,
  findBestMatch,
  hasUsableBestMatch
};
