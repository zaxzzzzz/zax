import React from 'react';
import { BANK_LOGOS } from '../data/bankLogos';

/**
 * BankLogo — real bank logo image (bundled locally, no external APIs / CDNs).
 *
 * Priority:
 *   1. `logoUrl` prop (explicit override, e.g. from refinanceRates.json)
 *   2. bundled real logo from `src/data/bankLogos.js` (matched by bankShort)
 *   3. fallback: locally-drawn SVG monogram tile in the bank's brand color
 *
 * Brand colors below are approximate public brand colors (illustrative only).
 */

// bankShort -> approximate brand color
const BRAND_COLORS = {
  KBank: '#007864',       // กสิกรไทย (teal green)
  SCB: '#6B2FA0',         // ไทยพาณิชย์ (purple)
  ttb: '#005CA9',         // ทหารไทยธนชาต (blue)
  'GH Bank': '#007A3D',   // ธนาคารอาคารสงเคราะห์ (green)
  Krungsri: '#F5A800',    // กรุงศรีอยุธยา (yellow)
  'CIMB Thai': '#E31837', // ซีไอเอ็มบี ไทย (red)
  GSB: '#00A651',         // ออมสิน (green)
  Krungthai: '#003DA5',   // กรุงไทย (blue)
  'Bangkok Bank': '#004B87', // กรุงเทพ (blue)
  UOB: '#E31837'          // ยูโอบี (red)
};

// Short monogram shown inside the tile (1–3 chars)
const MONOGRAMS = {
  KBank: 'K',
  SCB: 'SCB',
  ttb: 'ttb',
  'GH Bank': 'GH',
  Krungsri: 'Kr',
  'CIMB Thai': 'CIMB',
  GSB: 'GSB',
  Krungthai: 'KTB',
  'Bangkok Bank': 'BBL',
  UOB: 'UOB'
};

// Brand colors that need dark text on top (light backgrounds)
const DARK_TEXT_COLORS = new Set(['#F5A800']);

/** Derive a short monogram from a bank short name when not predefined. */
function deriveMonogram(bankShort) {
  const clean = String(bankShort || '').replace(/[^a-zA-Z]/g, '');
  if (!clean) return 'B';
  return clean.length <= 3 ? clean : clean.slice(0, 2);
}

export default function BankLogo({
  bankShort = '',
  logoUrl = null,
  size = 40,
  color = null,
  className = '',
  rounded = 'rounded-full'
}) {
  // Prefer an explicit logoUrl, then the bundled real logo for this bank
  const resolvedLogo = logoUrl || BANK_LOGOS[bankShort] || null;
  if (resolvedLogo) {
    return (
      <img
        src={resolvedLogo}
        alt={`โลโก้ ${bankShort}`}
        width={size}
        height={size}
        className={`object-cover bg-white border border-slate-200 ${rounded} ${className}`}
        style={{ width: size, height: size }}
      />
    );
  }

  const bg = color || BRAND_COLORS[bankShort] || '#64748b';
  const text = MONOGRAMS[bankShort] || deriveMonogram(bankShort);
  const textColor = DARK_TEXT_COLORS.has(bg) ? '#5b3d00' : '#ffffff';
  const fontSize = text.length >= 3 ? size * 0.30 : size * 0.42;

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      role="img"
      aria-label={`โลโก้ ${bankShort}`}
      className={`flex-shrink-0 ${className}`}
    >
      {/* Brand-colored rounded tile */}
      <rect x="1" y="1" width="46" height="46" rx="23" fill={bg} />
      {/* Soft top highlight for a modern gloss effect */}
      <rect x="1" y="1" width="46" height="22" rx="23" fill="#ffffff" opacity="0.12" />
      {/* Bank monogram */}
      <text
        x="24"
        y="26"
        textAnchor="middle"
        dominantBaseline="middle"
        fontSize={fontSize}
        fontWeight="800"
        fill={textColor}
        fontFamily="'Prompt', 'Plus Jakarta Sans', system-ui, sans-serif"
      >
        {text}
      </text>
    </svg>
  );
}
