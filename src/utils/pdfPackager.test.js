import { describe, it, expect, beforeAll } from 'vitest';
import { readFile } from 'node:fs/promises';
import { buildRefinancePdf } from './pdfPackager';
import { calculateRefinanceSavings } from './refinanceCalculator';
import { getRequiredDocChecklist } from './documentChecklist';

/**
 * End-to-end check that the PDF packager really produces a printable 2-page
 * PDF. In the browser the fonts are fetched from the bundled asset URL; here
 * we stub `fetch` to serve the same TTF files straight from disk so the full
 * pdf-lib pipeline (font embedding + Thai layout drawing) is exercised.
 */
beforeAll(() => {
  global.fetch = async (url) => {
    const name = String(url).includes('Bold') ? 'Sarabun-Bold.ttf' : 'Sarabun-Regular.ttf';
    const buf = await readFile(`src/assets/fonts/${name}`);
    return { arrayBuffer: async () => new Uint8Array(buf).buffer };
  };
});

describe('buildRefinancePdf', () => {
  it('generates a valid 2-page PDF with the expected content', async () => {
    const calculation = calculateRefinanceSavings({
      currentBalance: 1000000,
      currentRate: 6,
      monthlyIncome: 50000,
      occupation: 'salaried',
      wantMRTA: true
    });
    const selected = calculation.best;
    expect(selected).toBeTruthy();

    const bytes = await buildRefinancePdf({
      applicantName: 'ทดสอบ ผู้ใช้',
      occupationLabel: 'พนักงานเงินเดือน (Salaried)',
      monthlyIncome: 50000,
      wantMRTA: true,
      remainingMonths: 180,
      calculation,
      selected,
      checklist: getRequiredDocChecklist('salaried')
    });

    // Valid PDF signature
    expect(bytes[0]).toBe(0x25); // '%'
    expect(bytes[1]).toBe(0x50); // 'P'
    expect(bytes[2]).toBe(0x44); // 'D'
    expect(bytes[3]).toBe(0x46); // 'F'

    // Exactly 2 pages (count /Type /Page, not the /Pages tree node)
    const text = Buffer.from(bytes).toString('latin1');
    const pageCount = (text.match(/\/Type\s*\/Page[^s]/g) || []).length;
    expect(pageCount).toBe(2);

    // The Sarabun font is embedded as a font program (not just referenced)
    expect(text).toContain('Sarabun');
    expect(text).toContain('/FontFile2');

    // Reasonable file size (fonts embedded, so well above a trivial stub)
    expect(bytes.length).toBeGreaterThan(20000);
  });

  it('renders Thai text with the embedded Sarabun font', async () => {
    const calculation = calculateRefinanceSavings({
      currentBalance: 500000,
      currentRate: 5,
      monthlyIncome: 30000,
      occupation: 'freelance',
      wantMRTA: false
    });
    const bytes = await buildRefinancePdf({
      applicantName: 'สมชาย ใจดี',
      occupationLabel: 'ฟรีแลนซ์ / อาชีพอิสระ (Freelance)',
      monthlyIncome: 30000,
      wantMRTA: false,
      calculation,
      selected: calculation.best,
      checklist: getRequiredDocChecklist('freelance')
    });
    // The Sarabun subsetting must have worked for Thai glyphs (0x0E00-0x0E7F range);
    // a ToUnicode CMap proves the Thai text is mapped for copy/search.
    const text = Buffer.from(bytes).toString('latin1');
    expect(text).toContain('Sarabun');
    expect(text).toContain('/ToUnicode');
    expect(bytes.length).toBeGreaterThan(10000);
  });
});
