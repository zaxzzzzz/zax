/**
 * Bank logo assets (bundled locally — the refinance module stays 100% offline).
 *
 * Logos copied from the user's local folder (C:\Work\Startup\Image) into
 * src/assets/logos/ (keyed by `bankShort`, matching refinanceRates.json).
 * Vite bundles these images as static assets, so the app never calls out to
 * a logo CDN or bank API.
 */

import kbankLogo from '../assets/logos/kbank.jpg';
import scbLogo from '../assets/logos/scb.png';
import ttbLogo from '../assets/logos/ttb.jpg';
import ghbankLogo from '../assets/logos/ghbank.png';
import krungsriLogo from '../assets/logos/krungsri.png';
import cimbtLogo from '../assets/logos/cimbt.png';
import gsbLogo from '../assets/logos/gsb.png';
import krungthaiLogo from '../assets/logos/krungthai.png';
import bangkokbankLogo from '../assets/logos/bangkokbank.png';
import uobLogo from '../assets/logos/uob.png';

/** Map bankShort -> bundled logo URL. Add new banks here when expanding the matrix. */
export const BANK_LOGOS = {
  KBank: kbankLogo,
  SCB: scbLogo,
  ttb: ttbLogo,
  'GH Bank': ghbankLogo,
  Krungsri: krungsriLogo,
  'CIMB Thai': cimbtLogo,
  GSB: gsbLogo,
  Krungthai: krungthaiLogo,
  'Bangkok Bank': bangkokbankLogo,
  UOB: uobLogo
};
