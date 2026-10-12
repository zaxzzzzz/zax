/**
 * Bank Rate Fetcher Engine (Option 2: CORS Proxy API with Local Fallback)
 *
 * Fetches promotional refinance interest rates from public bank pages via
 * CORS proxies (e.g. allorigins.win). If network is offline, CORS proxy fails,
 * or rate parsing yields empty results, it seamlessly falls back to the curated
 * local rate matrices (refinanceRates.json & bankOffers.json).
 */

import BASELINE_MATRIX from '../data/refinanceRates.json';
import BASELINE_OFFERS from '../data/bankOffers.json';

const CACHE_KEY = 'nee_noi_live_bank_rates_cache';
const TIMEOUT_MS = 6000; // 6 second fetch timeout

/**
 * Bank source target URLs for promotional refinance interest rates.
 */
export const BANK_SOURCES = [
  {
    bankId: 'KRUNGSRI',
    packageId: 'krungsri-refinance-opt1',
    name: 'ธนาคารกรุงศรีอยุธยา',
    shortName: 'Krungsri',
    url: 'https://www.krungsri.com/th/personal/loans/home-loans/refinance',
    defaultRate: 2.55,
    regex: /(?:อัตราดอกเบี้ย|เฉลี่ย|ดอกเบี้ย)[^%]{0,30}?([1-9]\.[0-9]{1,3})%/i
  },
  {
    bankId: 'KBANK',
    packageId: 'kbank-refinance',
    name: 'ธนาคารกสิกรไทย',
    shortName: 'KBank',
    url: 'https://www.kasikornbank.com/th/personal/loan/homeloan/pages/refinance.aspx',
    defaultRate: 2.99,
    regex: /(?:อัตราดอกเบี้ย|เฉลี่ย|ดอกเบี้ย)[^%]{0,30}?([1-9]\.[0-9]{1,2})%/i
  },
  {
    bankId: 'TTB',
    packageId: 'ttb-refinance',
    name: 'ธนาคารทหารไทยธนชาต',
    shortName: 'ttb',
    url: 'https://www.ttbbank.com/th/personal/loans/home-loan/home-refinance',
    defaultRate: 3.25,
    regex: /(?:ดอกเบี้ย|เฉลี่ย)[^%]{0,30}?([1-9]\.[0-9]{1,2})%/i
  },
  {
    bankId: 'SCB',
    packageId: 'scb-refinance',
    name: 'ธนาคารไทยพาณิชย์',
    shortName: 'SCB',
    url: 'https://www.scb.co.th/th/personal-banking/loans/home-loans/refinance-loan.html',
    defaultRate: 2.99,
    regex: /(?:อัตราดอกเบี้ย|เฉลี่ย|เริ่มต้น)[^%]{0,30}?([1-9]\.[0-9]{1,2})%/i
  },
  {
    bankId: 'GHBANK',
    packageId: 'ghbank-refinance',
    name: 'ธนาคารอาคารสงเคราะห์',
    shortName: 'GH Bank',
    url: 'https://www.ghbank.co.th/product-services/credit/refinance',
    defaultRate: 2.99,
    regex: /(?:ดอกเบี้ย|เฉลี่ย|ปีแรก)[^%]{0,30}?([1-9]\.[0-9]{1,2})%/i
  }
];

/**
 * Parse HTML content to extract interest rate numbers.
 *
 * @param {string} html
 * @param {RegExp} customRegex
 * @param {number} fallbackRate
 * @returns {number} extracted rate (e.g. 3.45)
 */
export function parseRateFromHtml(html, customRegex, fallbackRate) {
  if (!html || typeof html !== 'string') return fallbackRate;

  // Try custom regex match
  if (customRegex) {
    const match = html.match(customRegex);
    if (match && match[1]) {
      const val = parseFloat(match[1]);
      if (val >= 1.5 && val <= 15.0) return val;
    }
  }

  // Fallback generic search for rate percentage patterns like "3.45%" or "3.50%"
  const matches = html.match(/(?:ดอกเบี้ย| rate |avg|เฉลี่ย)\D{0,20}([2-9]\.[0-9]{1,2})%/gi);
  if (matches && matches.length > 0) {
    for (const item of matches) {
      const numMatch = item.match(/([2-9]\.[0-9]{1,2})/);
      if (numMatch && numMatch[1]) {
        const val = parseFloat(numMatch[1]);
        if (val >= 1.5 && val <= 12.0) return val;
      }
    }
  }

  return fallbackRate;
}

/**
 * Fetch a single bank's page via CORS proxy with timeout.
 */
async function fetchBankPage(source) {
  const proxyUrl = `https://api.allorigins.win/get?url=${encodeURIComponent(source.url)}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const res = await fetch(proxyUrl, { signal: controller.signal });
    clearTimeout(timer);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    const contents = data?.contents || '';
    const rate = parseRateFromHtml(contents, source.regex, source.defaultRate);
    return { bankId: source.bankId, packageId: source.packageId, rate, success: true };
  } catch (err) {
    clearTimeout(timer);
    return { bankId: source.bankId, packageId: source.packageId, rate: source.defaultRate, success: false };
  }
}

/**
 * Fetch live bank rates from web pages via CORS proxy.
 * Falls back seamlessly to local baseline matrix if network/proxy fails.
 *
 * @param {boolean} forceRefresh - skip localStorage cache if true
 * @returns {Promise<{ isLive: boolean, fetchedAt: string, offers: Array, rateMatrix: object }>}
 */
export async function fetchLiveBankRates(forceRefresh = false) {
  // Check localStorage cache unless forceRefresh is true
  if (!forceRefresh && typeof window !== 'undefined' && window.localStorage) {
    try {
      const cached = localStorage.getItem(CACHE_KEY);
      if (cached) {
        const parsed = JSON.parse(cached);
        // Cache valid for 6 hours
        if (parsed.timestamp && Date.now() - parsed.timestamp < 6 * 60 * 60 * 1000) {
          return parsed.data;
        }
      }
    } catch (e) {
      /* ignore storage errors */
    }
  }

  // Attempt live fetch across sources concurrently
  try {
    const results = await Promise.all(BANK_SOURCES.map(s => fetchBankPage(s)));
    const anySuccess = results.some(r => r.success);
    const rateMap = {};
    results.forEach(r => {
      rateMap[r.bankId] = r.rate;
      rateMap[r.packageId] = r.rate;
    });

    const nowStr = new Date().toISOString().split('T')[0];

    // Build updated offers list
    const updatedOffers = BASELINE_OFFERS.map(offer => {
      const fetchedRate = rateMap[offer.bankId];
      return {
        ...offer,
        avg3YearRate: fetchedRate || offer.avg3YearRate,
        isLiveSynced: anySuccess && !!fetchedRate,
        lastUpdated: anySuccess ? nowStr : offer.lastUpdated
      };
    });

    // Build updated refinance package matrix
    const updatedPackages = BASELINE_MATRIX.packages.map(pkg => {
      const fetchedRate = rateMap[pkg.id];
      return {
        ...pkg,
        rate3YAvg: fetchedRate || pkg.rate3YAvg,
        isLiveSynced: anySuccess && !!fetchedRate
      };
    });

    const result = {
      isLive: anySuccess,
      fetchedAt: new Date().toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' }),
      lastUpdatedDate: nowStr,
      offers: updatedOffers,
      rateMatrix: {
        ...BASELINE_MATRIX,
        updatedAt: nowStr,
        packages: updatedPackages
      }
    };

    // Cache in localStorage
    if (typeof window !== 'undefined' && window.localStorage) {
      try {
        localStorage.setItem(CACHE_KEY, JSON.stringify({ timestamp: Date.now(), data: result }));
      } catch (e) {
        /* ignore */
      }
    }

    return result;
  } catch (err) {
    // Fallback baseline
    return getBaselineBankRates();
  }
}

/**
 * Synchronous local baseline fallback return.
 */
export function getBaselineBankRates() {
  const nowStr = BASELINE_MATRIX.updatedAt || new Date().toISOString().split('T')[0];
  return {
    isLive: false,
    fetchedAt: 'ออฟไลน์',
    lastUpdatedDate: nowStr,
    offers: BASELINE_OFFERS,
    rateMatrix: BASELINE_MATRIX
  };
}
