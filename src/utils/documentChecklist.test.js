import { describe, it, expect } from 'vitest';
import { getRequiredDocChecklist, OCCUPATIONS, OCCUPATION_LABELS } from './documentChecklist';

const ids = (list) => list.map(d => d.id);

describe('getRequiredDocChecklist', () => {
  it('returns salaried documents for salaried workers', () => {
    const list = getRequiredDocChecklist('salaried');
    expect(ids(list)).toEqual(expect.arrayContaining([
      'id-card', 'payslip-3m', 'salary-certificate', 'statement-6m'
    ]));
    expect(ids(list)).not.toContain('tax-form-50');
  });

  it('returns freelance documents for freelancers', () => {
    const list = getRequiredDocChecklist('freelance');
    expect(ids(list)).toEqual(expect.arrayContaining([
      'id-card', 'tax-form-50', 'statement-12m'
    ]));
    expect(ids(list)).not.toContain('payslip-3m');
  });

  it('adds business registration for business owners', () => {
    const list = getRequiredDocChecklist('business');
    expect(ids(list)).toContain('business-registration');
    expect(ids(list)).toContain('tax-form-50');
  });

  it('returns government documents for government officers', () => {
    const list = getRequiredDocChecklist('government');
    expect(ids(list)).toEqual(expect.arrayContaining([
      'id-card', 'gov-payslip-3m', 'gov-statement-6m'
    ]));
    expect(ids(list)).not.toContain('tax-form-50');
  });

  it('returns pensioner documents for pensioners', () => {
    const list = getRequiredDocChecklist('pensioner');
    expect(ids(list)).toEqual(expect.arrayContaining([
      'id-card', 'pension-letter', 'pension-statement-12m'
    ]));
    expect(ids(list)).not.toContain('payslip-3m');
  });

  it('falls back to a generic list for unknown occupations', () => {
    const list = getRequiredDocChecklist('unknown-job');
    expect(ids(list)).toContain('id-card');
    expect(ids(list)).not.toContain('payslip-3m');
    expect(ids(list)).not.toContain('tax-form-50');
  });

  it('every item is well-formed with a required flag', () => {
    for (const occ of OCCUPATIONS) {
      const list = getRequiredDocChecklist(occ);
      expect(list.length).toBeGreaterThan(0);
      list.forEach(doc => {
        expect(typeof doc.id).toBe('string');
        expect(typeof doc.label).toBe('string');
        expect(typeof doc.description).toBe('string');
        expect(typeof doc.required).toBe('boolean');
      });
      expect(list.some(doc => doc.required)).toBe(true);
    }
  });

  it('exports Thai occupation labels for all keys', () => {
    OCCUPATIONS.forEach(occ => {
      expect(typeof OCCUPATION_LABELS[occ]).toBe('string');
      expect(OCCUPATION_LABELS[occ].length).toBeGreaterThan(3);
    });
  });
});
