import { describe, it, expect } from 'vitest';
import RATE_MATRIX from '../data/refinanceRates.json';
import {
  monthlyPayment,
  totalInterestPaid,
  isPackageEligible,
  calculateTransferFees,
  calculateBreakEvenMonths,
  calculateRefinanceSavings
} from './refinanceCalculator';

const KBANK = RATE_MATRIX.packages.find(p => p.id === 'kbank-refinance');

describe('monthlyPayment / totalInterestPaid', () => {
  it('handles a 0% rate by simple division', () => {
    expect(monthlyPayment(120000, 0, 12)).toBeCloseTo(10000, 6);
    expect(totalInterestPaid(120000, 0, 12)).toBe(0);
  });

  it('returns 0 for zero balance', () => {
    expect(monthlyPayment(0, 5, 36)).toBe(0);
    expect(totalInterestPaid(0, 5, 36)).toBe(0);
  });

  it('produces a positive interest total for a positive rate', () => {
    const interest = totalInterestPaid(1000000, 5, 36);
    expect(interest).toBeGreaterThan(0);
    // total interest = (payment * months) - principal
    expect(interest).toBeCloseTo(monthlyPayment(1000000, 5, 36) * 36 - 1000000, 4);
  });

  it('charges more interest at a higher rate', () => {
    const low = totalInterestPaid(1000000, 3, 36);
    const high = totalInterestPaid(1000000, 6, 36);
    expect(high).toBeGreaterThan(low);
  });
});

describe('isPackageEligible', () => {
  it('requires income >= minIncome', () => {
    expect(isPackageEligible(KBANK, { monthlyIncome: 25000, occupation: 'salaried' })).toBe(false);
    expect(isPackageEligible(KBANK, { monthlyIncome: 30000, occupation: 'salaried' })).toBe(true);
  });

  it('requires the occupation to be allowed', () => {
    expect(isPackageEligible(KBANK, { monthlyIncome: 50000, occupation: 'freelance' })).toBe(false);
    expect(isPackageEligible(KBANK, { monthlyIncome: 50000, occupation: 'business' })).toBe(true);
  });
});

describe('calculateTransferFees', () => {
  const balance = 1000000;
  // A package with NO waivers so we can assert the raw fee math
  const NO_WAIVER_PKG = { fees: KBANK.fees, waiverPromos: [] };

  it('computes 1% registration + 3,000 appraisal + 0.05% duty stamp', () => {
    const fees = calculateTransferFees(NO_WAIVER_PKG, balance, { wantMRTA: false });
    expect(fees.total).toBe(13500); // 10,000 + 3,000 + 500
    expect(fees.breakdown.find(f => f.key === 'mortgageRegistration').amount).toBe(10000);
    expect(fees.breakdown.find(f => f.key === 'appraisal').amount).toBe(3000);
    expect(fees.breakdown.find(f => f.key === 'dutyStamp').amount).toBe(500);
    expect(fees.breakdown.every(f => !f.waived)).toBe(true);
  });

  it('applies always-on waivers regardless of MRTA, MRTA ones only when wantMRTA', () => {
    // KBank waives appraisal ALWAYS; mortgage registration only WITH MRTA
    const noMrta = calculateTransferFees(KBANK, balance, { wantMRTA: false });
    expect(noMrta.breakdown.find(f => f.key === 'appraisal').waived).toBe(true);
    expect(noMrta.breakdown.find(f => f.key === 'mortgageRegistration').waived).toBe(false);
    expect(noMrta.total).toBe(10500); // 10,000 + 0 + 500

    const withMrta = calculateTransferFees(KBANK, balance, { wantMRTA: true });
    expect(withMrta.breakdown.find(f => f.key === 'appraisal').waived).toBe(true);
    expect(withMrta.breakdown.find(f => f.key === 'mortgageRegistration').waived).toBe(true);
    expect(withMrta.breakdown.find(f => f.key === 'dutyStamp').waived).toBe(false);
    expect(withMrta.total).toBe(500);
  });
});

describe('calculateBreakEvenMonths', () => {
  it('rounds up to whole months', () => {
    expect(calculateBreakEvenMonths(13500, 20000, 19000)).toBe(14); // 13.5 -> 14
  });

  it('returns Infinity when the new installment is not cheaper', () => {
    expect(calculateBreakEvenMonths(5000, 10000, 10000)).toBe(Infinity);
    expect(calculateBreakEvenMonths(5000, 10000, 11000)).toBe(Infinity);
  });
});

describe('calculateRefinanceSavings', () => {
  it('filters out packages the user does not qualify for', () => {
    const res = calculateRefinanceSavings({
      currentBalance: 1000000,
      currentRate: 6,
      monthlyIncome: 50000,
      occupation: 'freelance'
    });
    const ids = res.results.map(r => r.package.id);
    // freelance is allowed on scb / ttb / ghbank only
    expect(ids).toContain('scb-refinance');
    expect(ids).toContain('ttb-refinance');
    expect(ids).toContain('ghbank-refinance');
    expect(ids).not.toContain('kbank-refinance');
    expect(ids).not.toContain('krungsri-refinance');
  });

  it('returns an empty result set when nothing is eligible', () => {
    const res = calculateRefinanceSavings({
      currentBalance: 1000000,
      currentRate: 6,
      monthlyIncome: 5000, // below every minIncome
      occupation: 'salaried'
    });
    expect(res.results).toHaveLength(0);
    expect(res.best).toBeNull();
  });

  it('sorts results from highest to lowest net savings', () => {
    const res = calculateRefinanceSavings({
      currentBalance: 1000000,
      currentRate: 6,
      monthlyIncome: 50000,
      occupation: 'salaried',
      wantMRTA: true
    });
    expect(res.results.length).toBeGreaterThan(0);
    res.results.forEach((r, i) => {
      if (i > 0) expect(res.results[i - 1].netSavings).toBeGreaterThanOrEqual(r.netSavings);
    });
    expect(res.best).toBe(res.results[0]);
  });

  it('computes net savings = gross interest saving - transfer fees', () => {
    const res = calculateRefinanceSavings({
      currentBalance: 1000000,
      currentRate: 6,
      monthlyIncome: 50000,
      occupation: 'salaried',
      wantMRTA: false
    });
    const best = res.best;
    expect(best.grossSavings).toBeCloseTo(res.current.totalInterest - best.newInterest, 4);
    expect(best.netSavings).toBeCloseTo(best.grossSavings - best.fees.total, 4);
  });

  it('reports Infinity break-even when the new bank is more expensive', () => {
    // currentRate 3% vs candidates >= 2.75% — only scb (2.75%) can be cheaper;
    // keep balance small so fees dominate and use an even lower current rate
    const res = calculateRefinanceSavings({
      currentBalance: 500000,
      currentRate: 1.5, // cheaper than every candidate
      monthlyIncome: 50000,
      occupation: 'salaried'
    });
    expect(res.results.length).toBeGreaterThan(0);
    expect(res.results.every(r => r.breakEvenMonths === Infinity)).toBe(true);
    expect(res.results.every(r => r.netSavings < 0)).toBe(true);
  });

  it('exposes meta (term, disclaimer) for the UI/PDF', () => {
    const res = calculateRefinanceSavings({
      currentBalance: 1000000,
      currentRate: 6,
      monthlyIncome: 50000,
      occupation: 'salaried',
      termMonths: 36
    });
    expect(res.meta.termYears).toBe(3);
    expect(res.meta.termMonths).toBe(36);
    expect(res.meta.disclaimer.length).toBeGreaterThan(10);
  });
});
