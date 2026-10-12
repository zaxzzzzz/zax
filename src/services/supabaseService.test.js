import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  fetchUserDebtsFromCloud,
  saveUserDebtsToCloud,
  fetchRefinanceSettingsFromCloud,
  saveRefinanceSettingsToCloud,
  subscribeToUserDebts,
  subscribeToRefinanceSettings,
  subscribeToCashflow
} from './supabaseService';

// In-memory mock for localStorage in node unit test runner
const localStorageMock = (() => {
  let store = {};
  return {
    getItem: (key) => store[key] || null,
    setItem: (key, value) => { store[key] = String(value); },
    removeItem: (key) => { delete store[key]; },
    clear: () => { store = {}; }
  };
})();

if (typeof window === 'undefined') {
  global.window = { localStorage: localStorageMock };
  global.localStorage = localStorageMock;
} else if (!window.localStorage) {
  Object.defineProperty(window, 'localStorage', { value: localStorageMock });
}

describe('supabaseService fallback & unit behavior', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it('gracefully falls back when Supabase is unconfigured', async () => {
    const debts = await fetchUserDebtsFromCloud('user1');
    expect(debts).toBeNull();
  });

  it('saves debts locally when offline or unconfigured', async () => {
    const testData = {
      debts: [{ id: 'd1', name: 'Test Debt', balance: 5000 }],
      extraBudget: 3000,
      paymentLogs: [],
      savedPlans: [],
      strategy: 'avalanche'
    };

    await saveUserDebtsToCloud('test_user', testData);
    const cached = localStorage.getItem('nee_noi_user_v1_test_user');
    expect(cached).not.toBeNull();
    const parsed = JSON.parse(cached);
    expect(parsed.debts[0].name).toBe('Test Debt');
    expect(parsed.extraBudget).toBe(3000);
  });

  it('saves refinance settings locally when unconfigured', async () => {
    const formData = {
      existingBalance: 1200000,
      currentRate: 5.5,
      occupation: 'salaried'
    };

    await saveRefinanceSettingsToCloud('user_ref_test', formData);
    const cached = localStorage.getItem('nee_noi_refinance_form_v3_user_ref_test');
    expect(cached).not.toBeNull();
    expect(JSON.parse(cached).existingBalance).toBe(1200000);
  });

  it('returns clean unsubscribe function when subscribing unconfigured', () => {
    const unsub1 = subscribeToUserDebts('user1', vi.fn());
    const unsub2 = subscribeToRefinanceSettings('user1', vi.fn());
    const unsub3 = subscribeToCashflow('user1', vi.fn());

    expect(typeof unsub1).toBe('function');
    expect(typeof unsub2).toBe('function');
    expect(typeof unsub3).toBe('function');

    expect(() => {
      unsub1();
      unsub2();
      unsub3();
    }).not.toThrow();
  });
});
