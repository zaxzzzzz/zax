/**
 * Unit tests for the Precision Smart-Match engine (bestMatchEngine.js)
 */

import { describe, it, expect } from 'vitest';
import {
  parseRatePercent,
  variantAvgRate,
  feeWaiversToKeys,
  occupationToCustomerType,
  isPromoEligible,
  pickVariant,
  findBestMatch,
  hasUsableBestMatch
} from './bestMatchEngine';

const BASE_PROMO = {
  id: 'promo-test',
  bank_name: 'ธนาคารทดสอบ',
  product_name: 'แพ็กเกจทดสอบ',
  property_types: ['บ้านเดี่ยว', 'คอนโด'],
  min_income: 15000,
  customer_type: 'ทุกประเภท',
  min_loan_tier: 0,
  min_loan_amount: 0,
  max_loan_amount: 0,
  max_ltv_percent: 0,
  avg_3yr_rate: 2.5,
  is_mrta: false,
  is_free_mortgage_fee: false,
  fee_waivers: [],
  variants: [],
  promo_image_url: '',
  bank_ref_link: 'https://example.com'
};

const BASE_USER = {
  propertyType: 'บ้านเดี่ยว',
  monthlyIncome: 30000,
  targetLoanAmount: 2000000,
  propertyValue: 0,
  occupation: 'salaried',
  wantMRTA: false
};

describe('parseRatePercent', () => {
  it('parses plain fixed rates with % sign', () => {
    expect(parseRatePercent('2.49%')).toBe(2.49);
    expect(parseRatePercent('คงที่ 2.20%')).toBe(2.2);
    expect(parseRatePercent('1.49')).toBe(1.49);
  });

  it('returns 0 for MRR formulas and empty values (cannot be resolved statically)', () => {
    expect(parseRatePercent('MRR - 2.00%')).toBe(0);
    expect(parseRatePercent('')).toBe(0);
    expect(parseRatePercent(null)).toBe(0);
  });
});

describe('variantAvgRate', () => {
  it('computes weighted average of year 1 (x1) and year 2-3 (x2)', () => {
    expect(variantAvgRate({ year_1_rate: '1.49%', year_2_3_rate: '2.49%' })).toBeCloseTo(2.16, 2);
  });

  it('falls back to whichever rate is available', () => {
    expect(variantAvgRate({ year_1_rate: '2.5%', year_2_3_rate: '' })).toBe(2.5);
    expect(variantAvgRate({ year_1_rate: '', year_2_3_rate: '3%' })).toBe(3);
  });
});

describe('feeWaiversToKeys', () => {
  it('maps Thai waiver labels to calculator fee keys', () => {
    expect(feeWaiversToKeys(['ประเมินราคา', 'จดจำนอง', 'อากรแสตมป์'])).toEqual(['appraisal', 'mortgageRegistration', 'dutyStamp']);
  });

  it('ignores unknown labels', () => {
    expect(feeWaiversToKeys(['ค่าโน่นค่านี่'])).toEqual([]);
  });
});

describe('occupationToCustomerType', () => {
  it('maps occupation keys to Thai customer types', () => {
    expect(occupationToCustomerType('salaried')).toBe('พนักงานประจำ');
    expect(occupationToCustomerType('business')).toBe('เจ้าของกิจการ');
    expect(occupationToCustomerType('government')).toBe('ข้าราชการ');
  });
});

describe('isPromoEligible (strict chain)', () => {
  it('passes a fully matching user', () => {
    expect(isPromoEligible(BASE_PROMO, BASE_USER)).toBe(true);
  });

  it('rejects when the property type is NOT in promo.property_types', () => {
    expect(isPromoEligible(BASE_PROMO, { ...BASE_USER, propertyType: 'อาคารพาณิชย์' })).toBe(false);
    expect(isPromoEligible(BASE_PROMO, { ...BASE_USER, propertyType: 'คอนโด' })).toBe(true);
  });

  it('accepts any property when the promo list is empty', () => {
    const anyProp = { ...BASE_PROMO, property_types: [] };
    expect(isPromoEligible(anyProp, { ...BASE_USER, propertyType: 'อาคารพาณิชย์' })).toBe(true);
  });

  it('rejects users below the income threshold', () => {
    expect(isPromoEligible(BASE_PROMO, { ...BASE_USER, monthlyIncome: 10000 })).toBe(false);
  });

  it('rejects customers not accepted by customer_type', () => {
    const salariedOnly = { ...BASE_PROMO, customer_type: 'พนักงานประจำ' };
    expect(isPromoEligible(salariedOnly, BASE_USER)).toBe(true);
    expect(isPromoEligible(salariedOnly, { ...BASE_USER, occupation: 'business' })).toBe(false);
  });

  it('rejects loans smaller than the promo loan tier (>=3M tables)', () => {
    const tiered = { ...BASE_PROMO, min_loan_tier: 3000000 };
    expect(isPromoEligible(tiered, BASE_USER)).toBe(false);
    expect(isPromoEligible(tiered, { ...BASE_USER, targetLoanAmount: 3500000 })).toBe(true);
  });

  it('enforces the strict loan range (min/max)', () => {
    const ranged = { ...BASE_PROMO, min_loan_amount: 3000000 };
    expect(isPromoEligible(ranged, BASE_USER)).toBe(false);
    const capped = { ...BASE_PROMO, max_loan_amount: 1000000 };
    expect(isPromoEligible(capped, BASE_USER)).toBe(false);
    const both = { ...BASE_PROMO, min_loan_amount: 1000000, max_loan_amount: 5000000 };
    expect(isPromoEligible(both, BASE_USER)).toBe(true);
  });

  it('enforces the LTV gate when property value is known', () => {
    const ltv85 = { ...BASE_PROMO, max_ltv_percent: 85 };
    // 2M loan on a 2M property = 100% LTV > 85% → rejected
    expect(isPromoEligible(ltv85, { ...BASE_USER, propertyValue: 2000000 })).toBe(false);
    // 2M loan on a 2.5M property = 80% LTV ≤ 85% → accepted
    expect(isPromoEligible(ltv85, { ...BASE_USER, propertyValue: 2500000 })).toBe(true);
    // Unknown property value → LTV gate skipped
    expect(isPromoEligible(ltv85, BASE_USER)).toBe(true);
  });

  it('requires an EXACT MRTA preference match', () => {
    const mrtaPromo = { ...BASE_PROMO, is_mrta: true };
    expect(isPromoEligible(mrtaPromo, { ...BASE_USER, wantMRTA: false })).toBe(false);
    expect(isPromoEligible(mrtaPromo, { ...BASE_USER, wantMRTA: true })).toBe(true);
    expect(isPromoEligible(BASE_PROMO, { ...BASE_USER, wantMRTA: true })).toBe(false);
  });
});

describe('pickVariant', () => {
  it('picks the cheapest variant matching the user MRTA choice', () => {
    const promo = {
      ...BASE_PROMO,
      variants: [
        { style: 1, is_mrta: true, year_1_rate: '1.49%', year_2_3_rate: '2.49%' },
        { style: 2, is_mrta: true, year_1_rate: '1.79%', year_2_3_rate: '2.59%' },
        { style: 3, is_mrta: false, year_1_rate: '2.29%', year_2_3_rate: '2.79%' },
        { style: 4, is_mrta: false, year_1_rate: '2.59%', year_2_3_rate: '2.99%' }
      ]
    };
    const noMrta = pickVariant(promo, false);
    expect(noMrta.variant.style).toBe(3);
    const withMrta = pickVariant(promo, true);
    expect(withMrta.variant.style).toBe(1);
  });

  it('falls back to promo-level avg_3yr_rate when no variants exist', () => {
    const picked = pickVariant(BASE_PROMO, true);
    expect(picked.rate3YAvg).toBe(2.5);
    expect(picked.variant).toBeNull();
  });
});

describe('findBestMatch (precision mode)', () => {
  const promotions = [
    BASE_PROMO,
    {
      ...BASE_PROMO,
      id: 'promo-cheapest',
      bank_name: 'ธนาคารถูกสุด',
      avg_3yr_rate: 1.99
    },
    {
      ...BASE_PROMO,
      id: 'promo-condo-only',
      bank_name: 'ธนาคารคอนโด',
      property_types: ['คอนโด'],
      avg_3yr_rate: 1.49
    },
    {
      ...BASE_PROMO,
      id: 'promo-mrta',
      bank_name: 'ธนาคารเอ็มอาร์ทีเอ',
      is_mrta: true,
      avg_3yr_rate: 1.29
    }
  ];

  const input = {
    promotions,
    propertyType: 'บ้านเดี่ยว',
    existingBalance: 2000000,
    topUpAmount: 500000,
    currentRate: 6.0,
    monthlyIncome: 40000,
    occupation: 'salaried',
    wantMRTA: false
  };

  it('computes target loan amount = balance + top-up', () => {
    const result = findBestMatch(input);
    expect(result.targetLoanAmount).toBe(2500000);
  });

  it('picks the LOWEST avg_3yr_rate among strictly eligible promos', () => {
    const result = findBestMatch(input);
    // condo-only excluded by property type, mrta excluded by MRTA mismatch
    expect(result.eligibleCount).toBe(2);
    expect(result.best.promo.id).toBe('promo-cheapest');
    expect(result.best.rate3YAvg).toBe(1.99);
  });

  it('excludes promos whose property_types miss the user property', () => {
    const result = findBestMatch(input);
    // promo-condo-only (1.49%) would have won if the property filter were loose;
    // its exclusion is proven by the cheaper-than-best rate never appearing.
    expect(result.best.promo.id).not.toBe('promo-condo-only');
    expect(result.best.rate3YAvg).toBeGreaterThan(1.49);
  });

  it('switches to the MRTA promo when the user opts into MRTA', () => {
    const result = findBestMatch({ ...input, wantMRTA: true });
    expect(result.best.promo.id).toBe('promo-mrta');
    expect(result.best.rate3YAvg).toBe(1.29);
  });

  it('returns null best with no eligible promos (drives the manual fallback UI)', () => {
    const result = findBestMatch({
      ...input,
      promotions: [{ ...BASE_PROMO, min_income: 999999 }]
    });
    expect(result.eligibleCount).toBe(0);
    expect(result.best).toBeNull();
    expect(hasUsableBestMatch(result)).toBe(false);
  });

  it('carries fee waivers through to the best result', () => {
    const result = findBestMatch({
      ...input,
      promotions: [{ ...BASE_PROMO, avg_3yr_rate: 2.0, fee_waivers: ['จดจำนอง', 'ประเมินราคา'] }]
    });
    expect(result.best.fee_waivers).toEqual(['จดจำนอง', 'ประเมินราคา']);
    expect(result.best.feesWaived.length).toBeGreaterThan(0);
  });
});
