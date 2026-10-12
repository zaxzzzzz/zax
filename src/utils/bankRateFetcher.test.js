import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  parseRateFromHtml,
  fetchLiveBankRates,
  getBaselineBankRates,
  BANK_SOURCES
} from './bankRateFetcher';

describe('parseRateFromHtml', () => {
  it('extracts percentage using custom regex pattern', () => {
    const html = '<div>โปรโมชันดอกเบี้ยเฉลี่ย 3 ปีเริ่มต้น 3.25% ฟรีค่าจดจำนอง</div>';
    const regex = /(?:ดอกเบี้ย|เฉลี่ย)[^%]{0,30}?([0-9]\.[0-9]{1,2})%/i;
    const rate = parseRateFromHtml(html, regex, 3.99);
    expect(rate).toBe(3.25);
  });

  it('falls back to defaultRate when html is empty or invalid', () => {
    expect(parseRateFromHtml('', null, 3.45)).toBe(3.45);
    expect(parseRateFromHtml(null, null, 3.45)).toBe(3.45);
    expect(parseRateFromHtml('<div>ข้อความไม่มีตัวเลขดอกเบี้ย</div>', null, 3.45)).toBe(3.45);
  });

  it('rejects unrealistic rates outside range 1.5% - 15.0%', () => {
    const html = '<div>ดอกเบี้ย 99.9% หรือ 0.1%</div>';
    const regex = /([0-9]+\.[0-9]+)%/;
    expect(parseRateFromHtml(html, regex, 3.50)).toBe(3.50);
  });
});

describe('getBaselineBankRates', () => {
  it('returns baseline matrix and offers with isLive = false', () => {
    const res = getBaselineBankRates();
    expect(res.isLive).toBe(false);
    expect(res.offers.length).toBeGreaterThan(0);
    expect(res.rateMatrix.packages.length).toBeGreaterThan(0);
  });
});

describe('fetchLiveBankRates', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    if (typeof window !== 'undefined') {
      localStorage.clear();
    }
  });

  it('falls back seamlessly to baseline when fetch throws error', async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error('Network error'));
    const res = await fetchLiveBankRates(true);
    expect(res.isLive).toBe(false);
    expect(res.offers.length).toBeGreaterThan(0);
  });

  it('updates offers and rateMatrix when proxy returns html with valid rates', async () => {
    global.fetch = vi.fn().mockImplementation((url) => {
      return Promise.resolve({
        ok: true,
        json: async () => ({
          contents: '<html><body>โปรโมชันอัตราดอกเบี้ย 3.15% ต่อปี เฉลี่ย 3 ปี</body></html>'
        })
      });
    });

    const res = await fetchLiveBankRates(true);
    expect(res.isLive).toBe(true);
    expect(res.offers.some(o => o.avg3YearRate === 3.15)).toBe(true);
    expect(res.rateMatrix.packages.some(p => p.rate3YAvg === 3.15)).toBe(true);
  });
});
