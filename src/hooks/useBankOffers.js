import { useState, useMemo, useEffect, useCallback } from 'react';
import INITIAL_OFFERS from '../data/bankOffers.json';
import INITIAL_MATRIX from '../data/refinanceRates.json';
import { fetchLiveBankRates, getBaselineBankRates } from '../utils/bankRateFetcher';
import { fetchAdminPromotions, mergeOffers, mergeRateMatrix } from '../utils/promotionSync';

/**
 * Custom hook for managing and synchronizing dynamic bank promotional offers.
 *
 * Data priority (highest first):
 *   1. Admin-managed promotions from the backend DB (/api/admin/promotions)
 *      — always fetched fresh, so admin updates appear immediately.
 *   2. Live bank rates scraped via CORS proxy (when reachable).
 *   3. Bundled baseline data (refinanceRates.json / bankOffers.json).
 *
 * Connects with CORS Proxy live rate fetcher with seamless local fallback.
 */
export function useBankOffers() {
  const [offers, setOffers] = useState(() => {
    return [...INITIAL_OFFERS].sort((a, b) => Number(a.avg3YearRate) - Number(b.avg3YearRate));
  });
  const [rateMatrix, setRateMatrix] = useState(INITIAL_MATRIX);
  const [isLive, setIsLive] = useState(false);
  const [isFetching, setIsFetching] = useState(false);
  const [lastSyncedAt, setLastSyncedAt] = useState('');

  // Fetch / Sync rates: live web scrape + admin DB promotions merged on top.
  const refreshRates = useCallback(async (force = false) => {
    setIsFetching(true);
    try {
      const data = await fetchLiveBankRates(force);
      // Admin promotions are always fetched fresh (never cached) so the
      // public website shows the latest admin save immediately.
      const adminPromos = await fetchAdminPromotions();

      const liveOffers = data.offers?.length > 0
        ? [...data.offers].sort((a, b) => Number(a.avg3YearRate) - Number(b.avg3YearRate))
        : getBaselineBankRates().offers;
      const liveMatrix = data.rateMatrix || getBaselineBankRates().rateMatrix;

      setOffers(mergeOffers(adminPromos, liveOffers));
      setRateMatrix(mergeRateMatrix(adminPromos, liveMatrix));

      setIsLive(!!data.isLive);
      setLastSyncedAt(data.fetchedAt || '');
    } catch (err) {
      // Offline fallback: baseline + admin promotions
      const baseline = getBaselineBankRates();
      const adminPromos = await fetchAdminPromotions();
      setOffers(mergeOffers(adminPromos, baseline.offers));
      setRateMatrix(mergeRateMatrix(adminPromos, baseline.rateMatrix));
      setIsLive(false);
    } finally {
      setIsFetching(false);
    }
  }, []);

  // Sync on mount
  useEffect(() => {
    refreshRates(false);
  }, [refreshRates]);

  // Best overall offer (lowest interest rate)
  const bestOffer = useMemo(() => {
    if (!offers || offers.length === 0) return null;
    return offers[0];
  }, [offers]);

  // Format timestamp badge text
  const lastUpdatedBadge = useMemo(() => {
    if (isLive && lastSyncedAt) {
      return `🟢 สดจากเว็บธนาคาร (อัปเดต ${lastSyncedAt} น.)`;
    }
    const rawDate = offers[0]?.lastUpdated || new Date().toISOString().split('T')[0];
    try {
      const [year, month, day] = rawDate.split('-');
      const monthNamesTH = [
        'ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.',
        'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'
      ];
      const mIdx = parseInt(month, 10) - 1;
      const thMonth = monthNamesTH[mIdx] || 'ส.ค.';
      return `🟡 ใช้อัตราออฟไลน์สำรอง (${parseInt(day, 10)} ${thMonth} ${year})`;
    } catch (e) {
      return `🟡 ใช้อัตราออฟไลน์สำรอง (${rawDate})`;
    }
  }, [offers, isLive, lastSyncedAt]);

  // Get offers filtered by income eligibility
  const getEligibleOffers = useCallback((monthlyIncome = 0) => {
    const income = Number(monthlyIncome) || 0;
    return offers
      .filter(offer => income >= Number(offer.minIncome || 0))
      .sort((a, b) => Number(a.avg3YearRate) - Number(b.avg3YearRate));
  }, [offers]);

  // Lowest target interest rate across current offers
  const lowestRate = useMemo(() => {
    return bestOffer ? Number(bestOffer.avg3YearRate) : 3.25;
  }, [bestOffer]);

  return {
    offers,
    rateMatrix,
    bestOffer,
    lowestRate,
    lastUpdatedBadge,
    isLive,
    isFetching,
    lastSyncedAt,
    refreshRates,
    getEligibleOffers,
    setOffers
  };
}

export default useBankOffers;
