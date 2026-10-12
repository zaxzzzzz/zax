/**
 * Promotion Sync — bridges Admin-managed promotions to the public website.
 *
 * The Admin Dashboard saves promotion records (bank_name, min_income,
 * avg_3yr_rate, promo_image_url, bank_ref_link, ...) into the backend DB.
 * This module converts those records into the two shapes the public
 * Refinance module consumes:
 *   1. `offers`      — used by useBankOffers / getEligibleOffers
 *   2. `packages`    — used by refinanceCalculator via rateMatrix.packages
 * and merges them on top of the bundled baseline data, so every visitor of
 * the public website instantly sees the latest admin-updated rates.
 */

import { BANK_LOGOS } from '../data/bankLogos';

// Canonical Thai bank name -> bankShort key used by BankLogo / brand colors
const BANK_SHORT_MAP = {
  'ธนาคารกรุงศรีอยุธยา': 'Krungsri',
  'ธนาคารกสิกรไทย': 'KBank',
  'ธนาคารไทยพาณิชย์': 'SCB',
  'ธนาคารอาคารสงเคราะห์': 'GH Bank',
  'ธนาคารออมสิน': 'GSB',
  'ธนาคารทหารไทยธนชาต': 'ttb',
  'ธนาคารซีไอเอ็มบี ไทย': 'CIMB Thai',
  'ธนาคารกรุงเทพ': 'Bangkok Bank',
  'ธนาคารกรุงไทย': 'Krungthai',
  'ธนาคารยูโอบี': 'UOB'
};

export function getBankShort(bankName) {
  return BANK_SHORT_MAP[bankName] || 'Krungsri';
}

/** Derive a stable package id from a promotion record. */
function packageIdFor(promo) {
  return promo.id ? `admin-${promo.id}` : `admin-${Date.now()}`;
}

const ALL_OCCUPATIONS = ['salaried', 'government', 'freelance', 'business', 'pensioner', 'other'];

/**
 * Convert one admin promotion record into the public `offer` shape.
 * @param {object} promo - Admin promotion record
 * @returns {object} Offer shaped for useBankOffers
 */
export function promoToOffer(promo) {
  return {
    bankId: getBankShort(promo.bank_name).toUpperCase().replace(/\s+/g, '_'),
    bankName: promo.bank_name,
    packageName: promo.product_name,
    avg3YearRate: Number(promo.avg_3yr_rate) || 0,
    minIncome: Number(promo.min_income) || 0,
    freeMortgageFee: Boolean(promo.is_free_mortgage_fee),
    highlights: [
      promo.year_1_rate && `ดอกเบี้ยปีแรก ${promo.year_1_rate}`,
      promo.year_2_3_rate && `ดอกเบี้ยปีที่ 2-3 ${promo.year_2_3_rate}`,
      promo.after_year_3_rate && `หลังปีที่ 3 ${promo.after_year_3_rate}`,
      promo.is_mrta && 'มีเงื่อนไขทำประกัน MRTA/MLTA',
      promo.is_free_mortgage_fee && 'ฟรีค่าจดจำนอง 1%'
    ].filter(Boolean),
    sourceUrl: promo.bank_ref_link || '',
    promoImageUrl: promo.promo_image_url || '',
    lastUpdated: promo.updated_at ? new Date(promo.updated_at).toISOString().split('T')[0] : undefined,
    isAdminPromo: true
  };
}

/**
 * Convert one admin promotion record into a refinance `package` (matrix) shape.
 * Merged over the baseline package of the same bank (when found) so bank
 * fees / waiver promos stay consistent with the rest of the app.
 * @param {object} promo - Admin promotion record
 * @param {Array} baselinePackages - Bundled baseline packages from refinanceRates.json
 * @returns {object} Package shaped for refinanceCalculator
 */
export function promoToPackage(promo, baselinePackages = []) {
  const bankShort = getBankShort(promo.bank_name);
  const baseline = baselinePackages.find(p => p.bankShort === bankShort);
  const rate = Number(promo.avg_3yr_rate) || baseline?.rate3YAvg || 0;
  const id = packageIdFor(promo);

  const waiverPromos = [];
  if (promo.is_free_mortgage_fee) {
    waiverPromos.push({ id: `${id}-free-regis`, label: 'ฟรีค่าจดจำนอง 1%', waives: ['mortgageRegistration'], requiresMRTA: false });
  }
  if (baseline?.waiverPromos) {
    waiverPromos.push(...baseline.waiverPromos);
  }

  const notesParts = [
    promo.year_1_rate && `ปีแรก ${promo.year_1_rate}`,
    promo.year_2_3_rate && `ปีที่ 2-3 ${promo.year_2_3_rate}`,
    promo.after_year_3_rate && `หลังปีที่ 3 ${promo.after_year_3_rate}`
  ].filter(Boolean);

  return {
    id,
    bank: promo.bank_name,
    bankShort,
    packageTitle: promo.product_name + (rate ? ` (ดอกเบี้ยเฉลี่ย 3 ปี ${rate}%)` : ''),
    rate3YAvg: rate,
    minIncome: Number(promo.min_income) || 0,
    // Loan-tier gate (e.g. 3000000 for ">=3M" banner tables, 0 = any size)
    minLoanTier: Number(promo.min_loan_tier) || 0,
    targetLoanAmount: Number(promo.target_loan_amount) || 0,
    // Variant styles (1-4) with MRTA condition / MRR formula / EIR
    variants: Array.isArray(promo.variants) ? promo.variants : [],
    allowedOccupations: baseline?.allowedOccupations || [...ALL_OCCUPATIONS],
    fees: baseline?.fees || null, // null -> calculator falls back to matrix defaultFees
    waiverPromos,
    notes: notesParts.join(' • ') || promo.product_name,
    promoImageUrl: promo.promo_image_url || '',
    bankRefLink: promo.bank_ref_link || '',
    isAdminPromo: true
  };
}

/**
 * Fetch the latest admin promotions from the backend DB.
 * Returns an empty array when the backend is unreachable (client-only mode).
 * @returns {Promise<Array>} Admin promotion records
 */
export async function fetchAdminPromotions() {
  try {
    const res = await fetch('/api/admin/promotions');
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data.promotions)) return data.promotions;
    }
  } catch (e) {
    // Backend not running — caller falls back to bundled baseline data
  }
  return [];
}

/**
 * Build the merged offers list (admin promotions first, then baseline offers
 * from banks the admin has not covered).
 * @param {Array} adminPromotions
 * @param {Array} baselineOffers - Bundled baseline offers from bankOffers.json
 * @returns {Array} Merged offers sorted by avg3YearRate ascending
 */
export function mergeOffers(adminPromotions, baselineOffers = []) {
  const adminOffers = (adminPromotions || []).map(promoToOffer);
  const adminBanks = new Set(adminOffers.map(o => o.bankName));
  const baselineRest = (baselineOffers || []).filter(o => !adminBanks.has(o.bankName));
  return [...adminOffers, ...baselineRest]
    .sort((a, b) => Number(a.avg3YearRate) - Number(b.avg3YearRate));
}

/**
 * Build the merged rate matrix: admin promotions become the newest packages
 * (prefixed ids guarantee they are never stale-cached), then baseline packages
 * from banks the admin has not covered are appended.
 * @param {Array} adminPromotions
 * @param {object} baselineMatrix - Bundled baseline matrix from refinanceRates.json
 * @returns {object} Merged rate matrix
 */
export function mergeRateMatrix(adminPromotions, baselineMatrix) {
  const baselinePackages = baselineMatrix?.packages || [];
  const adminPackages = (adminPromotions || []).map(promo => promoToPackage(promo, baselinePackages));
  const adminBanks = new Set(adminPackages.map(p => p.bank));
  const baselineRest = baselinePackages.filter(p => !adminBanks.has(p.bank));
  return {
    ...(baselineMatrix || {}),
    updatedAt: new Date().toISOString().split('T')[0],
    packages: [...adminPackages, ...baselineRest]
  };
}

export default {
  fetchAdminPromotions,
  promoToOffer,
  promoToPackage,
  mergeOffers,
  mergeRateMatrix,
  getBankShort,
  BANK_SHORT_MAP
};
