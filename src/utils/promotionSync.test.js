import { describe, it, expect } from 'vitest';
import {
  promoToOffer,
  promoToPackage,
  mergeOffers,
  mergeRateMatrix,
  getBankShort
} from './promotionSync';
import BASELINE_OFFERS from '../data/bankOffers.json';
import BASELINE_MATRIX from '../data/refinanceRates.json';
import { calculateRefinanceSavings } from './refinanceCalculator';

const adminPromo = {
  id: 'promo-test-1',
  bank_name: 'ธนาคารกรุงไทย',
  product_name: 'รีไฟแนนซ์บ้าน KTB AI',
  min_income: 12000,
  avg_3yr_rate: 2.45,
  year_1_rate: '1.49%',
  year_2_3_rate: '2.30%',
  after_year_3_rate: 'MRR-1.50%',
  is_mrta: false,
  is_free_mortgage_fee: true,
  promo_image_url: 'https://example.com/banner.jpg',
  bank_ref_link: 'https://www.ktb.co.th/refinance',
  updated_at: 1726900000000
};

describe('promotionSync', () => {
  it('maps canonical Thai bank names to bankShort keys', () => {
    expect(getBankShort('ธนาคารกรุงไทย')).toBe('Krungthai');
    expect(getBankShort('ธนาคารอาคารสงเคราะห์')).toBe('GH Bank');
    expect(getBankShort('ธนาคารไม่รู้จัก')).toBe('Krungsri'); // fallback
  });

  it('converts an admin promotion to the public offer shape', () => {
    const offer = promoToOffer(adminPromo);
    expect(offer.bankName).toBe('ธนาคารกรุงไทย');
    expect(offer.avg3YearRate).toBe(2.45);
    expect(offer.minIncome).toBe(12000);
    expect(offer.freeMortgageFee).toBe(true);
    expect(offer.sourceUrl).toBe('https://www.ktb.co.th/refinance');
    expect(offer.isAdminPromo).toBe(true);
    expect(offer.highlights.some(h => h.includes('1.49%'))).toBe(true);
  });

  it('converts an admin promotion to a calculator package shape', () => {
    const pkg = promoToPackage(adminPromo, BASELINE_MATRIX.packages);
    expect(pkg.id).toBe('admin-promo-test-1');
    expect(pkg.bankShort).toBe('Krungthai');
    expect(pkg.rate3YAvg).toBe(2.45);
    expect(pkg.minIncome).toBe(12000);
    expect(pkg.promoImageUrl).toBe('https://example.com/banner.jpg');
    expect(pkg.bankRefLink).toBe('https://www.ktb.co.th/refinance');
    // free mortgage fee -> waiver promo present
    expect(pkg.waiverPromos.some(w => w.waives.includes('mortgageRegistration'))).toBe(true);
  });

  it('produces a stable package id for the same promotion (idempotent merge)', () => {
    const p1 = promoToPackage(adminPromo, []);
    const p2 = promoToPackage({ ...adminPromo, updated_at: 999 }, []);
    expect(p1.id).toBe(p2.id);
  });

  it('mergeOffers puts admin promos first and keeps uncovered baseline banks', () => {
    const merged = mergeOffers([adminPromo], BASELINE_OFFERS);
    expect(merged[0].isAdminPromo).toBe(true);
    // กรุงไทย has no baseline offer, so all baseline banks must remain
    expect(merged.length).toBe(BASELINE_OFFERS.length + 1);
    // sorted ascending by rate
    for (let i = 1; i < merged.length; i++) {
      expect(Number(merged[i].avg3YearRate)).toBeGreaterThanOrEqual(Number(merged[i - 1].avg3YearRate));
    }
  });

  it('mergeOffers replaces the baseline offer of a bank covered by admin', () => {
    const krungsriPromo = { ...adminPromo, id: 'promo-krungsri-x', bank_name: 'ธนาคารกรุงศรีอยุธยา', avg_3yr_rate: 1.99 };
    const merged = mergeOffers([krungsriPromo], BASELINE_OFFERS);
    const krungsriEntries = merged.filter(o => o.bankName === 'ธนาคารกรุงศรีอยุธยา');
    expect(krungsriEntries.length).toBe(1);
    expect(krungsriEntries[0].avg3YearRate).toBe(1.99);
    expect(krungsriEntries[0].isAdminPromo).toBe(true);
  });

  it('mergeRateMatrix prepends admin packages and keeps baseline packages of other banks', () => {
    const merged = mergeRateMatrix([adminPromo], BASELINE_MATRIX);
    expect(merged.packages[0].id).toBe('admin-promo-test-1');
    expect(merged.packages.some(p => p.id === 'krungsri-refinance-opt1')).toBe(true);
    // baseline packages of a bank covered by admin are replaced
    const ktbBaselineCount = BASELINE_MATRIX.packages.filter(p => p.bank === 'ธนาคารกรุงไทย').length;
    const ktbMergedCount = merged.packages.filter(p => p.bank === 'ธนาคารกรุงไทย').length;
    expect(ktbMergedCount).toBe(ktbBaselineCount + 1);
  });

  // ---- Integration with the public refinance calculator ----
  describe('integration with refinanceCalculator (public website)', () => {
    const calcInput = {
      currentBalance: 1000000,
      currentRate: 6.0,
      monthlyIncome: 30000,
      occupation: 'salaried',
      wantMRTA: false,
      termYears: 3
    };

    it('admin package flows through the calculator with correct rate and default fees', () => {
      const pkg = promoToPackage(adminPromo, BASELINE_MATRIX.packages);
      const result = calculateRefinanceSavings({ ...calcInput, packages: [pkg] });
      expect(result.results.length).toBe(1);
      const r = result.results[0];
      expect(r.package.id).toBe('admin-promo-test-1');
      expect(r.rate3YAvg).toBe(2.45);
      // fees:null -> calculator falls back to RATE_MATRIX.defaultFees
      expect(r.fees.breakdown.length).toBe(3);
      expect(r.fees.total).toBeGreaterThan(0);
      expect(r.newMonthly).toBeGreaterThan(0);
    });

    it('is_free_mortgage_fee waives the 1% mortgage registration fee', () => {
      const withWaiver = promoToPackage({ ...adminPromo, is_free_mortgage_fee: true }, []);
      const withoutWaiver = promoToPackage({ ...adminPromo, is_free_mortgage_fee: false }, []);
      const withResult = calculateRefinanceSavings({ ...calcInput, packages: [withWaiver] });
      const withoutResult = calculateRefinanceSavings({ ...calcInput, packages: [withoutWaiver] });
      const regisWaived = withResult.results[0].fees.breakdown.find(f => f.key === 'mortgageRegistration');
      const regisCharged = withoutResult.results[0].fees.breakdown.find(f => f.key === 'mortgageRegistration');
      // waived items keep their raw amount but are excluded from fees.total
      expect(regisWaived.waived).toBe(true);
      expect(regisWaived.amount).toBe(10000); // 1% of 1,000,000
      expect(regisCharged.waived).toBe(false);
      expect(regisCharged.amount).toBeGreaterThan(0);
      expect(withResult.results[0].fees.total).toBeLessThan(withoutResult.results[0].fees.total);
    });

    it('min_income from admin filters ineligible users out', () => {
      const pkg = promoToPackage(adminPromo, []); // min_income 12000
      const below = calculateRefinanceSavings({ ...calcInput, monthlyIncome: 10000, packages: [pkg] });
      const above = calculateRefinanceSavings({ ...calcInput, monthlyIncome: 15000, packages: [pkg] });
      expect(below.results.length).toBe(0);
      expect(above.results.length).toBe(1);
    });

    it('merged matrix (admin + baseline) calculates end-to-end like the public page does', () => {
      const merged = mergeRateMatrix([adminPromo], BASELINE_MATRIX);
      const result = calculateRefinanceSavings({ ...calcInput, packages: merged.packages });
      // the admin package must appear among the ranked results
      expect(result.results.some(r => r.package.id === 'admin-promo-test-1')).toBe(true);
      // ranked by net savings descending
      for (let i = 1; i < result.results.length; i++) {
        expect(result.results[i].netSavings).toBeLessThanOrEqual(result.results[i - 1].netSavings);
      }
    });
  });
});
