/**
 * Service for managing bank refinance promotions state
 * Supports LocalStorage persistence and API synchronization.
 */

import { normalizeRateMatrix } from '../types/rateMatrix';
import { fetchPromotionsFromCloud, savePromotionToCloud, deletePromotionFromCloud } from './supabaseService';

const STORAGE_KEY = 'nee_noi_admin_refinance_promotions';

/** Canonical property types (Thai) — shared by admin UI + user form. */
export const PROPERTY_TYPES = ['บ้านเดี่ยว', 'ทาวน์เฮาส์', 'คอนโด', 'อาคารพาณิชย์', 'ที่ดินพร้อมสิ่งปลูกสร้าง'];

/** Canonical fee-waiver labels (Thai). */
export const FEE_WAIVER_TYPES = ['ประเมินราคา', 'จดจำนอง', 'อากรแสตมป์'];

/** Canonical customer types (Thai). */
export const CUSTOMER_TYPES = ['พนักงานประจำ', 'เจ้าของกิจการ', 'ฟรีแลนซ์', 'ข้าราชการ', 'ผู้รับบำนาญ', 'ทุกประเภท'];

// Default initial promotions seeded from baseline data
export const INITIAL_PROMOTIONS = [
  {
    id: 'promo-krungsri-opt1',
    bank_name: 'ธนาคารกรุงศรีอยุธยา',
    product_name: 'กรุงศรี รีไฟแนนซ์ ทางเลือก 1',
    property_types: ['บ้านเดี่ยว', 'ทาวน์เฮาส์', 'คอนโด'],
    min_income: 15000,
    customer_type: 'พนักงานประจำ',
    target_loan_amount: 0,
    min_loan_tier: 0,
    min_loan_amount: 0,
    max_loan_amount: 0,
    max_ltv_percent: 90,
    avg_3yr_rate: 2.55,
    year_1_rate: '2.20%',
    year_2_3_rate: '2.20%',
    after_year_3_rate: 'MRR - 2.15%',
    is_mrta: true,
    is_free_mortgage_fee: false,
    fee_waivers: [],
    variants: [],
    promo_image_url: 'https://www.krungsri.com/Krungsri2018/media/Personal/Loans/Home-Loan/refinance-banner.jpg',
    bank_ref_link: 'https://www.krungsri.com/th/personal/loans/home-loans/refinance',
    updated_at: Date.now()
  },
  {
    id: 'promo-ghbank-1',
    bank_name: 'ธนาคารอาคารสงเคราะห์',
    product_name: 'โครงการสินเชื่อบ้านสุขสันต์ (Refinance In)',
    property_types: ['บ้านเดี่ยว', 'ทาวน์เฮาส์', 'ที่ดินพร้อมสิ่งปลูกสร้าง'],
    min_income: 15000,
    customer_type: 'พนักงานประจำ',
    target_loan_amount: 0,
    min_loan_tier: 0,
    min_loan_amount: 0,
    max_loan_amount: 20000000,
    max_ltv_percent: 95,
    avg_3yr_rate: 2.99,
    year_1_rate: '1.99%',
    year_2_3_rate: '3.49%',
    after_year_3_rate: 'MRR - 1.50%',
    is_mrta: true,
    is_free_mortgage_fee: true,
    fee_waivers: ['จดจำนอง'],
    variants: [],
    promo_image_url: 'https://www.ghbank.co.th/uploads/banner/refinance-home.jpg',
    bank_ref_link: 'https://www.ghbank.co.th/product/loan',
    updated_at: Date.now()
  },
  {
    id: 'promo-kbank-1',
    bank_name: 'ธนาคารกสิกรไทย',
    product_name: 'K-Home Loan รีไฟแนนซ์ ปลดภาระหนี้บ้าน',
    property_types: ['บ้านเดี่ยว', 'คอนโด', 'อาคารพาณิชย์'],
    min_income: 30000,
    customer_type: 'พนักงานประจำ',
    target_loan_amount: 0,
    min_loan_tier: 0,
    min_loan_amount: 500000,
    max_loan_amount: 0,
    max_ltv_percent: 85,
    avg_3yr_rate: 2.99,
    year_1_rate: '2.50%',
    year_2_3_rate: '3.23%',
    after_year_3_rate: 'MRR - 1.80%',
    is_mrta: false,
    is_free_mortgage_fee: false,
    fee_waivers: ['ประเมินราคา'],
    variants: [],
    promo_image_url: 'https://www.kasikornbank.com/th/personal/loan/homeloan/publishingimages/refinance-banner.jpg',
    bank_ref_link: 'https://www.kasikornbank.com/th/personal/loan/homeloan/pages/refinance.aspx',
    updated_at: Date.now()
  },
  // ---- Krung Thai refinance tables (>=3M & <3M tiers) ----
  {
    id: 'promo-krungthai-tier3m',
    bank_name: 'ธนาคารกรุงไทย',
    product_name: 'กรุงไทย รีไฟแนนซ์บ้าน วงเงิน 3 ล้านบาทขึ้นไป',
    property_types: ['บ้านเดี่ยว', 'ทาวน์เฮาส์', 'คอนโด', 'อาคารพาณิชย์'],
    min_income: 30000,
    customer_type: 'พนักงานประจำ',
    target_loan_amount: 0,
    min_loan_tier: 3000000,
    min_loan_amount: 3000000,
    max_loan_amount: 0,
    max_ltv_percent: 85,
    avg_3yr_rate: 2.49,
    year_1_rate: '1.49%',
    year_2_3_rate: '2.49%',
    after_year_3_rate: 'MRR - 2.00%',
    is_mrta: true,
    is_free_mortgage_fee: true,
    fee_waivers: ['จดจำนอง', 'ประเมินราคา'],
    variants: [
      { style: 1, style_name: 'ทางเลือกที่ 1 (MRTA)', is_mrta: true, year_1_rate: '1.49%', year_2_3_rate: '2.49%', after_year_3_rate: 'MRR - 2.00%', mrr_formula: 'MRR - 2.00%', eir: 2.61 },
      { style: 2, style_name: 'ทางเลือกที่ 2 (MRTA)', is_mrta: true, year_1_rate: '1.79%', year_2_3_rate: '2.59%', after_year_3_rate: 'MRR - 1.90%', mrr_formula: 'MRR - 1.90%', eir: 2.68 },
      { style: 3, style_name: 'ทางเลือกที่ 3 (ไม่มี MRTA)', is_mrta: false, year_1_rate: '2.29%', year_2_3_rate: '2.79%', after_year_3_rate: 'MRR - 1.75%', mrr_formula: 'MRR - 1.75%', eir: 2.79 },
      { style: 4, style_name: 'ทางเลือกที่ 4 (ไม่มี MRTA)', is_mrta: false, year_1_rate: '2.59%', year_2_3_rate: '2.99%', after_year_3_rate: 'MRR - 1.50%', mrr_formula: 'MRR - 1.50%', eir: 2.93 }
    ],
    promo_image_url: '',
    bank_ref_link: 'https://www.krungthai.com/th/personal/loan/home-loan-refinance',
    updated_at: Date.now()
  },
  {
    id: 'promo-krungthai-under3m',
    bank_name: 'ธนาคารกรุงไทย',
    product_name: 'กรุงไทย รีไฟแนนซ์บ้าน วงเงินต่ำกว่า 3 ล้านบาท',
    property_types: ['บ้านเดี่ยว', 'ทาวน์เฮาส์', 'คอนโด'],
    min_income: 15000,
    customer_type: 'พนักงานประจำ',
    target_loan_amount: 0,
    min_loan_tier: 0,
    min_loan_amount: 0,
    max_loan_amount: 2999999,
    max_ltv_percent: 90,
    avg_3yr_rate: 2.69,
    year_1_rate: '1.79%',
    year_2_3_rate: '2.69%',
    after_year_3_rate: 'MRR - 1.85%',
    is_mrta: true,
    is_free_mortgage_fee: true,
    fee_waivers: ['จดจำนอง'],
    variants: [
      { style: 1, style_name: 'ทางเลือกที่ 1 (MRTA)', is_mrta: true, year_1_rate: '1.79%', year_2_3_rate: '2.69%', after_year_3_rate: 'MRR - 1.85%', mrr_formula: 'MRR - 1.85%', eir: 2.78 },
      { style: 2, style_name: 'ทางเลือกที่ 2 (MRTA)', is_mrta: true, year_1_rate: '2.09%', year_2_3_rate: '2.79%', after_year_3_rate: 'MRR - 1.75%', mrr_formula: 'MRR - 1.75%', eir: 2.83 },
      { style: 3, style_name: 'ทางเลือกที่ 3 (ไม่มี MRTA)', is_mrta: false, year_1_rate: '2.49%', year_2_3_rate: '2.99%', after_year_3_rate: 'MRR - 1.60%', mrr_formula: 'MRR - 1.60%', eir: 2.96 },
      { style: 4, style_name: 'ทางเลือกที่ 4 (ไม่มี MRTA)', is_mrta: false, year_1_rate: '2.79%', year_2_3_rate: '3.19%', after_year_3_rate: 'MRR - 1.40%', mrr_formula: 'MRR - 1.40%', eir: 3.12 }
    ],
    promo_image_url: '',
    bank_ref_link: 'https://www.krungthai.com/th/personal/loan/home-loan-refinance',
    updated_at: Date.now()
  }
];

/**
 * Get all promotions
 * @returns {Promise<Array>} List of promotions
 */
export async function getPromotions() {
  // 1. Try Supabase Cloud DB
  try {
    const cloudPromos = await fetchPromotionsFromCloud();
    if (cloudPromos && cloudPromos.length > 0) {
      return cloudPromos;
    }
  } catch (e) {
    // Cloud fetch error, fallback below
  }

  // 2. Try Local API endpoint if available
  try {
    const response = await fetch('/api/admin/promotions');
    if (response.ok) {
      const data = await response.json();
      if (Array.isArray(data.promotions) && data.promotions.length > 0) {
        return data.promotions;
      }
    }
  } catch (e) {
    // API not reachable
  }

  // 3. Fallback to LocalStorage
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved) {
    try {
      return JSON.parse(saved);
    } catch (e) {
      console.error('Failed to parse saved promotions:', e);
    }
  }

  // Seed default data
  localStorage.setItem(STORAGE_KEY, JSON.stringify(INITIAL_PROMOTIONS));
  return INITIAL_PROMOTIONS;
}

/**
 * Upload a banner image to the backend and get back a short public URL.
 * The backend stores the file in server/data/uploads and serves it at
 * /uploads/<name> — so the DB stores a compact URL instead of a huge base64
 * data URL (which previously overflowed the localStorage quota too).
 * Falls back to the original data URL when the backend is unreachable
 * (client-only / dev mode without `npm run server`).
 * @param {string} imageDataUrl - "data:image/png;base64,..." string
 * @returns {Promise<string>} Public image URL, e.g. "/uploads/promo-xxx.png"
 */
export async function uploadPromoImage(imageDataUrl) {
  if (!imageDataUrl || typeof imageDataUrl !== 'string') return '';
  // Not an inline data URL (already an http(s) or /uploads/ path) — pass through
  if (!imageDataUrl.startsWith('data:')) return imageDataUrl;

  try {
    const response = await fetch('/api/admin/promotions/upload-image', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ image_base64: imageDataUrl })
    });
    if (response.ok) {
      const data = await response.json();
      if (data?.ok && data?.url) return data.url;
    }
  } catch (e) {
    // Backend not running — keep the data URL (dev fallback)
    console.warn('uploadPromoImage: backend unavailable, keeping inline data URL', e.message);
  }
  return imageDataUrl;
}

/**
 * Save or Update a promotion
 * @param {Object} promo - Promotion object
 * @returns {Promise<Object>} Saved promotion
 */
export async function savePromotion(promo) {
  const isEdit = Boolean(promo.id);
  const feeWaivers = Array.isArray(promo.fee_waivers)
    ? promo.fee_waivers
    : String(promo.fee_waivers || '').split(',').map(s => s.trim()).filter(Boolean);
  const updatedPromo = {
    ...promo,
    id: promo.id || `promo-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
    property_types: Array.isArray(promo.property_types) ? promo.property_types : [],
    min_income: Number(promo.min_income) || 0,
    customer_type: String(promo.customer_type || 'ทุกประเภท').trim(),
    target_loan_amount: Number(promo.target_loan_amount) || 0,
    min_loan_tier: Number(promo.min_loan_tier) || 0,
    min_loan_amount: Number(promo.min_loan_amount) || 0,
    max_loan_amount: Number(promo.max_loan_amount) || 0,
    max_ltv_percent: Number(promo.max_ltv_percent) || 0,
    avg_3yr_rate: Number(promo.avg_3yr_rate) || 0,
    is_mrta: Boolean(promo.is_mrta),
    is_free_mortgage_fee: feeWaivers.includes('จดจำนอง') || Boolean(promo.is_free_mortgage_fee),
    fee_waivers: feeWaivers,
    variants: Array.isArray(promo.variants) ? promo.variants : [],
    // Detailed condition rows (income / MRTA / fee waivers per row) — normalized
    // through the shared RateMatrixRow contract before persistence.
    rate_matrix: normalizeRateMatrix(promo.rate_matrix),
    updated_at: Date.now()
  };

  // Try Supabase Cloud DB save
  savePromotionToCloud(updatedPromo);

  // Try API backend
  try {
    const response = await fetch('/api/admin/promotions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updatedPromo)
    });
    if (response.ok) {
      const resData = await response.json();
      if (resData.promotion) {
        return resData.promotion;
      }
    }
  } catch (e) {
    // Fallback to local storage
  }

  // Local storage save (guarded — large base64 banner images can exceed the quota)
  try {
    const current = await getPromotions();
    let updatedList;
    if (isEdit) {
      updatedList = current.map(p => p.id === updatedPromo.id ? updatedPromo : p);
    } else {
      updatedList = [updatedPromo, ...current];
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updatedList));
  } catch (e) {
    console.warn('Failed to persist promotions to localStorage (quota?):', e);
  }

  return updatedPromo;
}

/**
 * Delete a promotion by ID
 * @param {string} id - Promotion ID
 * @returns {Promise<boolean>} Success indicator
 */
export async function deletePromotion(id) {
  deletePromotionFromCloud(id);

  try {
    const response = await fetch(`/api/admin/promotions?id=${encodeURIComponent(id)}`, {
      method: 'DELETE'
    });
    if (response.ok) {
      return true;
    }
  } catch (e) {
    // Fallback to local storage
  }

  try {
    const current = await getPromotions();
    const updatedList = current.filter(p => p.id !== id);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updatedList));
  } catch (e) {
    console.warn('Failed to update localStorage promotions after delete:', e);
  }
  return true;
}

/* ---------------- Occupations master (admin CRUD) ---------------- */
const OCCUPATIONS_STORAGE_KEY = 'nee_noi_admin_occupations';

/**
 * Get the occupations master list.
 * Backend DB first; falls back to localStorage / bundled defaults.
 * @returns {Promise<Array>} Occupations: { id, key, label, labelEn, allowed }
 */
export async function getOccupations() {
  try {
    const response = await fetch('/api/admin/occupations');
    if (response.ok) {
      const data = await response.json();
      if (Array.isArray(data.occupations)) return data.occupations;
    }
  } catch (e) {
    // Backend not running — fallback below
  }

  const saved = localStorage.getItem(OCCUPATIONS_STORAGE_KEY);
  if (saved) {
    try {
      const parsed = JSON.parse(saved);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    } catch (e) { /* ignore malformed */ }
  }
  return DEFAULT_OCCUPATIONS;
}

/**
 * Save (create/update) an occupation in the master list.
 * @param {Object} occupation - { id?, key, label, labelEn?, allowed? }
 * @returns {Promise<Object>} Saved occupation
 */
export async function saveOccupation(occupation) {
  const payload = {
    ...occupation,
    id: occupation.id || `occ-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    key: occupation.key || (occupation.id || `occ-${Date.now()}`),
    label: String(occupation.label || '').trim(),
    labelEn: String(occupation.labelEn || '').trim(),
    allowed: occupation.allowed === undefined ? true : Boolean(occupation.allowed),
    updated_at: Date.now()
  };

  try {
    const response = await fetch('/api/admin/occupations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (response.ok) {
      const data = await response.json();
      if (data?.ok && data?.occupation) return data.occupation;
    }
  } catch (e) {
    // Fallback to localStorage below
  }

  // localStorage fallback
  const current = await getOccupations();
  const idx = current.findIndex(o => o.id === payload.id || (payload.key && o.key === payload.key));
  let updated;
  if (idx >= 0) {
    updated = current.map(o => o.id === payload.id ? { ...o, ...payload } : o);
  } else {
    updated = [...current, payload];
  }
  try { localStorage.setItem(OCCUPATIONS_STORAGE_KEY, JSON.stringify(updated)); } catch (e) { /* quota */ }
  return payload;
}

/**
 * Delete an occupation from the master list by id.
 * @param {string} id
 * @returns {Promise<boolean>}
 */
export async function deleteOccupation(id) {
  try {
    const response = await fetch(`/api/admin/occupations?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
    if (response.ok) return true;
  } catch (e) {
    // Fallback below
  }
  const current = await getOccupations();
  try { localStorage.setItem(OCCUPATIONS_STORAGE_KEY, JSON.stringify(current.filter(o => o.id !== id))); } catch (e) { /* quota */ }
  return true;
}

/** Bundled defaults mirroring the server seed (used in client-only mode). */
export const DEFAULT_OCCUPATIONS = [
  { id: 'occ-salaried', key: 'salaried', label: 'พนักงานเงินเดือน', labelEn: 'Salaried Employee', allowed: true },
  { id: 'occ-government', key: 'government', label: 'ข้าราชการ / พนักงานรัฐวิสาหกิจ', labelEn: 'Government Officer', allowed: true },
  { id: 'occ-freelance', key: 'freelance', label: 'ฟรีแลนซ์ / อาชีพอิสระ', labelEn: 'Freelance', allowed: true },
  { id: 'occ-business', key: 'business', label: 'เจ้าของกิจการ / ธุรกิจ', labelEn: 'Business Owner', allowed: true },
  { id: 'occ-pensioner', key: 'pensioner', label: 'ผู้รับบำนาญ / เกษียณอายุ', labelEn: 'Pensioner', allowed: true },
  { id: 'occ-other', key: 'other', label: 'อื่นๆ (ระบุเอง)', labelEn: 'Other', allowed: true }
];

export default {
  getPromotions,
  savePromotion,
  deletePromotion,
  uploadPromoImage,
  getOccupations,
  saveOccupation,
  deleteOccupation,
  INITIAL_PROMOTIONS,
  DEFAULT_OCCUPATIONS
};
