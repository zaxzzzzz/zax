/**
 * Unit tests for the RateMatrix contract + filtering engine
 * (src/types/rateMatrix.js and its integration in bestMatchEngine.js)
 */

import { describe, it, expect } from 'vitest';
import {
  parseMrtaCell,
  parseFreeMortgageCell,
  computeAvg3yr,
  normalizeRateMatrixRow,
  normalizeRateMatrix,
  bestMatrixRow,
  pickBestMatrixRow,
  emptyMatrixRow
} from '../types/rateMatrix';
import { pickMatrixRow, evaluatePromotion } from '../utils/bestMatchEngine';

describe('parseMrtaCell', () => {
  it('maps "ทำประกันชีวิต" / MRTA cells to true', () => {
    expect(parseMrtaCell('ทำประกันชีวิต')).toBe(true);
    expect(parseMrtaCell('มี MRTA')).toBe(true);
    expect(parseMrtaCell('MLTA')).toBe(true);
    expect(parseMrtaCell(true)).toBe(true);
  });

  it('maps "ไม่ทำ" / empty cells to false', () => {
    expect(parseMrtaCell('ไม่ทำ')).toBe(false);
    expect(parseMrtaCell('ไม่มี')).toBe(false);
    expect(parseMrtaCell('')).toBe(false);
    expect(parseMrtaCell(null)).toBe(false);
  });
});

describe('parseFreeMortgageCell', () => {
  it('maps "ฟรีค่าจดจำนอง" to true and "-" / "ไม่ฟรี" to false', () => {
    expect(parseFreeMortgageCell('ฟรีค่าจดจำนอง')).toBe(true);
    expect(parseFreeMortgageCell('Free mortgage fee')).toBe(true);
    expect(parseFreeMortgageCell('-')).toBe(false);
    expect(parseFreeMortgageCell('ไม่ฟรี')).toBe(false);
  });
});

describe('computeAvg3yr', () => {
  it('computes the weighted (y1 + y23×2)/3 average', () => {
    expect(computeAvg3yr({ year_1_rate: '1.49%', year_2_3_rate: '2.49%' })).toBeCloseTo(2.16, 2);
  });

  it('falls back to whichever rate exists', () => {
    expect(computeAvg3yr({ year_1_rate: '2.5%', year_2_3_rate: '' })).toBe(2.5);
    expect(computeAvg3yr({})).toBe(0);
  });
});

describe('normalizeRateMatrixRow', () => {
  it('coerces a raw Gemini row into a fully typed RateMatrixRow', () => {
    const row = normalizeRateMatrixRow({
      customer_group: 'พนักงานประจำ',
      min_income: '20,000',
      property_types: 'บ้านเดี่ยว, คอนโด',
      is_mrta: 'ทำประกันชีวิต',
      is_free_mortgage: 'ฟรีค่าจดจำนอง',
      year_1_rate: '1.49%',
      year_2_3_rate: '2.49%'
    }, 0);
    expect(row.min_income).toBe(20000);
    expect(row.property_types).toEqual(['บ้านเดี่ยว', 'คอนโด']);
    expect(row.is_mrta).toBe(true);
    expect(row.is_free_mortgage).toBe(true);
    expect(row.fee_waivers).toEqual(['จดจำนอง']);
    expect(row.avg_3yr_rate).toBeCloseTo(2.16, 2);
    expect(row.id).toBeTruthy();
  });

  it('degrades safely on null/garbage input', () => {
    const row = normalizeRateMatrixRow(null, 2);
    expect(row.customer_group).toBe('ทุกประเภท');
    expect(row.min_income).toBe(0);
    expect(row.is_mrta).toBe(false);
    expect(row.style).toBe(3);
  });
});

describe('normalizeRateMatrix', () => {
  it('accepts an array, a single object, or null', () => {
    expect(normalizeRateMatrix(null)).toEqual([]);
    expect(normalizeRateMatrix({ year_1_rate: '2%' })).toHaveLength(1);
    expect(normalizeRateMatrix([{ year_1_rate: '2%' }, { year_1_rate: '3%' }])).toHaveLength(2);
  });
});

describe('pickBestMatrixRow', () => {
  const MATRIX = [
    { customer_group: 'ทุกประเภท', min_income: 15000, is_mrta: true, is_free_mortgage: true, year_1_rate: '1.99%', year_2_3_rate: '2.99%', avg_3yr_rate: 2.66 },
    { customer_group: 'ทุกประเภท', min_income: 15000, is_mrta: false, is_free_mortgage: false, year_1_rate: '2.49%', year_2_3_rate: '3.49%', avg_3yr_rate: 3.16 },
    { customer_group: 'ทุกประเภท', min_income: 50000, is_mrta: false, is_free_mortgage: false, year_1_rate: '1.79%', year_2_3_rate: '2.79%', avg_3yr_rate: 2.46 },
    { customer_group: 'ทุกประเภท', min_income: 0, is_mrta: false, is_free_mortgage: false, property_types: ['คอนโด'], year_1_rate: '1.29%', year_2_3_rate: '2.29%', avg_3yr_rate: 1.96 }
  ];

  it('filters by income + MRTA and returns the LOWEST avg_3yr_rate row', () => {
    const row = pickBestMatrixRow(MATRIX, { monthlyIncome: 30000, wantMRTA: true });
    expect(row.avg_3yr_rate).toBe(2.66);
    expect(row.is_mrta).toBe(true);
  });

  it('excludes rows whose min_income exceeds the user income', () => {
    // 'บ้านเดี่ยว' excludes the wildcard-income condo row (1.96); the 2.46 row
    // needs 50k income, so the 3.16 row is the best fit for a 30k earner.
    const row = pickBestMatrixRow(MATRIX, { monthlyIncome: 30000, wantMRTA: false, propertyType: 'บ้านเดี่ยว' });
    expect(row.avg_3yr_rate).toBe(3.16);
    const rich = pickBestMatrixRow(MATRIX, { monthlyIncome: 60000, wantMRTA: false, propertyType: 'บ้านเดี่ยว' });
    expect(rich.avg_3yr_rate).toBe(2.46);
  });

  it('filters by property type when the row lists property_types', () => {
    const house = pickBestMatrixRow(MATRIX, { monthlyIncome: 60000, wantMRTA: false, propertyType: 'บ้านเดี่ยว' });
    expect(house.avg_3yr_rate).toBe(2.46);
    const condo = pickBestMatrixRow(MATRIX, { monthlyIncome: 60000, wantMRTA: false, propertyType: 'คอนโด' });
    expect(condo.avg_3yr_rate).toBe(1.96);
  });

  it('degrades gracefully (MRTA match, then any row) when nothing matches exactly', () => {
    const weird = [{ min_income: 999999, is_mrta: false, avg_3yr_rate: 5 }];
    // Income gate fails for everyone → falls back to MRTA-matching pool
    const row = pickBestMatrixRow(weird, { monthlyIncome: 100, wantMRTA: false });
    expect(row.avg_3yr_rate).toBe(5);
  });

  it('returns null for an empty matrix', () => {
    expect(pickBestMatrixRow([], { monthlyIncome: 30000, wantMRTA: true })).toBeNull();
  });
});

describe('pickMatrixRow (engine integration)', () => {
  const PROMO = {
    id: 'promo-matrix',
    bank_name: 'ธนาคารเมทริกซ์',
    product_name: 'แพ็กเกจเมทริกซ์',
    property_types: [],
    min_income: 0,
    customer_type: 'ทุกประเภท',
    min_loan_tier: 0,
    min_loan_amount: 0,
    max_loan_amount: 0,
    max_ltv_percent: 0,
    avg_3yr_rate: 0,
    is_mrta: false,
    is_free_mortgage_fee: false,
    fee_waivers: [],
    variants: [],
    rate_matrix: [
      { min_income: 15000, is_mrta: true, is_free_mortgage: true, year_1_rate: '1.99%', year_2_3_rate: '2.99%', avg_3yr_rate: 2.66 },
      { min_income: 15000, is_mrta: false, is_free_mortgage: false, year_1_rate: '2.49%', year_2_3_rate: '3.49%', avg_3yr_rate: 3.16 }
    ]
  };

  it('resolves the single matching row for a no-MRTA user', () => {
    const result = pickMatrixRow(PROMO, { monthlyIncome: 30000, wantMRTA: false });
    expect(result.row.avg_3yr_rate).toBe(3.16);
    expect(result.rate3YAvg).toBe(3.16);
    expect(result.rates.year1).toBe(2.49);
  });

  it('returns null when the promo has no matrix', () => {
    expect(pickMatrixRow({ ...PROMO, rate_matrix: [] }, { wantMRTA: false })).toBeNull();
  });
});

describe('evaluatePromotion with rate_matrix', () => {
  const USER = {
    propertyType: 'บ้านเดี่ยว',
    monthlyIncome: 30000,
    targetLoanAmount: 2000000,
    propertyValue: 0,
    occupation: 'salaried',
    wantMRTA: false
  };

  it('uses ONLY the best matching row and refines fee waivers from that row', () => {
    const promo = {
      id: 'promo-eval',
      bank_name: 'ธนาคารทดสอบ',
      product_name: 'แพ็กเกจทดสอบ',
      property_types: [],
      min_income: 0,
      customer_type: 'ทุกประเภท',
      min_loan_tier: 0,
      min_loan_amount: 0,
      max_loan_amount: 0,
      max_ltv_percent: 0,
      avg_3yr_rate: 0,
      is_mrta: false,
      is_free_mortgage_fee: false,
      fee_waivers: [],
      variants: [],
      rate_matrix: [
        { min_income: 0, is_mrta: true, is_free_mortgage: true, year_1_rate: '1.49%', year_2_3_rate: '2.49%', avg_3yr_rate: 2.16 },
        { min_income: 0, is_mrta: false, is_free_mortgage: false, year_1_rate: '2.49%', year_2_3_rate: '3.49%', avg_3yr_rate: 3.16 }
      ]
    };
    const result = evaluatePromotion(promo, USER, { currentRate: 6.0 });
    // No-MRTA user → 3.16 row (not the cheaper 2.16 MRTA row)
    expect(result.rate3YAvg).toBe(3.16);
    expect(result.matrixRow.is_mrta).toBe(false);
    expect(result.matrixCondition).toEqual({
      customer_group: 'ทุกประเภท',
      min_income: 0,
      is_mrta: false,
      is_free_mortgage: false
    });
    // The chosen row has no free mortgage → no waived fees even though the
    // OTHER (MRTA) row does offer it.
    expect(result.feesWaived).toEqual([]);
  });

  it('falls back to variants when no matrix exists (legacy behaviour)', () => {
    const promo = {
      id: 'promo-legacy',
      bank_name: 'ธนาคารทดสอบ',
      product_name: 'แพ็กเกจทดสอบ',
      property_types: [],
      min_income: 0,
      customer_type: 'ทุกประเภท',
      min_loan_tier: 0,
      min_loan_amount: 0,
      max_loan_amount: 0,
      max_ltv_percent: 0,
      avg_3yr_rate: 2.5,
      is_mrta: false,
      is_free_mortgage_fee: false,
      fee_waivers: [],
      variants: [
        { style: 1, is_mrta: false, year_1_rate: '2.29%', year_2_3_rate: '2.79%' }
      ]
    };
    const result = evaluatePromotion(promo, USER, { currentRate: 6.0 });
    expect(result.rate3YAvg).toBeCloseTo(2.62, 2);
    expect(result.matrixRow).toBeNull();
  });
});

describe('emptyMatrixRow / bestMatrixRow helpers', () => {
  it('creates a normalized empty row with sequential style', () => {
    const row = emptyMatrixRow(3);
    expect(row.style).toBe(3);
    expect(row.customer_group).toBe('ทุกประเภท');
    expect(row.avg_3yr_rate).toBe(0);
  });

  it('bestMatrixRow returns the lowest-avg row with rowCount', () => {
    const best = bestMatrixRow([
      { avg_3yr_rate: 3.0 },
      { avg_3yr_rate: 1.5 },
      { avg_3yr_rate: 2.0 }
    ]);
    expect(best.avg_3yr_rate).toBe(1.5);
    expect(best.rowCount).toBe(3);
  });
});
