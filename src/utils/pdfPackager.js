/**
 * Refinance PDF Application Packager
 *
 * Generates a clean, printable 2-page A4 PDF ("Walk-in Application PDF Package")
 * that the user can download, print, and submit at any bank branch:
 *
 *   Page 1 — Refinance Application Cover Sheet:
 *            applicant details, existing debt vs new selected bank,
 *            calculated net savings, expected monthly payment.
 *   Page 2 — Bank Walk-in Submission Checklist:
 *            printable ☐ checkboxes for every required document.
 *
 * Built on `pdf-lib`. Thai text is rendered by embedding the Sarabun font that
 * ships inside the app bundle (src/assets/fonts/) — fully offline / standalone,
 * no third-party APIs, no runtime font downloads.
 */

import { PDFDocument, rgb } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit'; // required to embed custom (non-standard) fonts
import sarabunRegularUrl from '../assets/fonts/Sarabun-Regular.ttf';
import sarabunBoldUrl from '../assets/fonts/Sarabun-Bold.ttf';

// ---------- Palette (matches the app's indigo/slate theme) ----------
const C = {
  indigo: rgb(79 / 255, 70 / 255, 229 / 255),
  indigoDark: rgb(67 / 255, 56 / 255, 202 / 255),
  indigoLight: rgb(238 / 255, 242 / 255, 255 / 255),
  slate900: rgb(15 / 255, 23 / 255, 42 / 255),
  slate700: rgb(51 / 255, 65 / 255, 85 / 255),
  slate500: rgb(100 / 255, 116 / 255, 139 / 255),
  slate400: rgb(148 / 255, 163 / 255, 184 / 255),
  slate200: rgb(226 / 255, 232 / 255, 240 / 255),
  emerald: rgb(5 / 255, 150 / 255, 105 / 255),
  rose: rgb(225 / 255, 29 / 255, 72 / 255),
  white: rgb(1, 1, 1),
  black: rgb(0, 0, 0)
};

const PAGE_W = 595.28;
const PAGE_H = 841.89;
const MARGIN = 48;
const CONTENT_W = PAGE_W - MARGIN * 2;

/** Format a number with Thai thousands separators (e.g. 1,234,567). */
function fmt(n) {
  return new Intl.NumberFormat('th-TH', { maximumFractionDigits: 0 }).format(Math.round(Number(n) || 0));
}

/** Wrap text into lines that fit `maxWidth`, breaking long Thai words by char. */
function wrapText(text, font, size, maxWidth) {
  const words = String(text || '').split(' ');
  const lines = [];
  let line = '';
  words.forEach(word => {
    // A single word longer than the line → break it character by character
    if (font.widthOfTextAtSize(word, size) > maxWidth) {
      if (line) { lines.push(line); line = ''; }
      let chunk = '';
      for (const ch of word) {
        if (font.widthOfTextAtSize(chunk + ch, size) > maxWidth) {
          lines.push(chunk);
          chunk = ch;
        } else {
          chunk += ch;
        }
      }
      line = chunk;
      return;
    }
    const candidate = line ? `${line} ${word}` : word;
    if (font.widthOfTextAtSize(candidate, size) > maxWidth) {
      lines.push(line);
      line = word;
    } else {
      line = candidate;
    }
  });
  if (line) lines.push(line);
  return lines;
}

/** Load the bundled Sarabun fonts (regular + bold) and embed them into the doc. */
async function loadFonts(pdfDoc) {
  pdfDoc.registerFontkit(fontkit); // enables TTF embedding (Thai glyphs)
  const [regularBytes, boldBytes] = await Promise.all([
    fetch(sarabunRegularUrl).then(r => r.arrayBuffer()),
    fetch(sarabunBoldUrl).then(r => r.arrayBuffer())
  ]);
  return {
    regular: await pdfDoc.embedFont(regularBytes),
    bold: await pdfDoc.embedFont(boldBytes)
  };
}

/** Draw a filled section header bar (indigo label text on light indigo pill). */
function drawSectionTitle(page, font, text, x, y, size = 12) {
  const label = `▍ ${text}`;
  page.drawText(label, { x, y, size, font, color: C.indigo });
  return y - size - 6;
}

/** Draw one "label : value" row, wrapping long values. */
function drawKV(page, fonts, x, y, label, value, { labelW = 150, size = 10.5, valueColor = C.slate900 } = {}) {
  page.drawText(label, { x, y, size, font: fonts.regular, color: C.slate500 });
  const valueX = x + labelW;
  const lines = wrapText(value, fonts.regular, size, CONTENT_W - labelW);
  lines.forEach((line, i) => {
    page.drawText(line, { x: valueX, y: y - i * (size + 3), size, font: fonts.regular, color: valueColor });
  });
  return y - lines.length * (size + 3) - 4;
}

/**
 * Page 1 — Refinance Application Cover Sheet.
 */
function drawCoverSheet(page, fonts, { applicantName, occupationLabel, monthlyIncome, wantMRTA, remainingMonths, calculation, selected, dateStr }) {
  let y = PAGE_H;

  // ---- Header band ----
  page.drawRectangle({ x: 0, y: PAGE_H - 92, width: PAGE_W, height: 92, color: C.indigo });
  page.drawRectangle({ x: 0, y: PAGE_H - 98, width: PAGE_W, height: 6, color: C.indigoDark });
  page.drawText('Refinance Application Cover Sheet', {
    x: MARGIN, y: PAGE_H - 44, size: 20, font: fonts.bold, color: C.white
  });
  page.drawText('เอกสารสรุปการยื่นรีไฟแนนซ์ (Walk-in Application Package)', {
    x: MARGIN, y: PAGE_H - 64, size: 11, font: fonts.regular, color: C.indigoLight
  });
  page.drawText(`สร้างเมื่อ: ${dateStr}`, {
    x: PAGE_W - MARGIN - 120, y: PAGE_H - 44, size: 9, font: fonts.regular, color: C.indigoLight
  });

  y = PAGE_H - 118;

  // ---- 1. Applicant details ----
  y = drawSectionTitle(page, fonts.bold, '1. ข้อมูลผู้ยื่นกู้ (Applicant Details)', MARGIN, y);
  y = drawKV(page, fonts, MARGIN, y, 'ชื่อผู้ยื่นกู้:', applicantName || '-');
  y = drawKV(page, fonts, MARGIN, y, 'อาชีพ:', occupationLabel);
  y = drawKV(page, fonts, MARGIN, y, 'รายได้ต่อเดือน:', `${fmt(monthlyIncome)} บาท`);
  y = drawKV(page, fonts, MARGIN, y, 'ประกัน MRTA:', wantMRTA ? 'ต้องการทำ (ใช้สิทธิ์ฟรีค่าธรรมเนียมตามโปรโมชัน)' : 'ไม่ทำ');
  if (remainingMonths) {
    y = drawKV(page, fonts, MARGIN, y, 'ระยะเวลาผ่อนคงเหลือ:', `${remainingMonths} เดือน`);
  }
  y -= 8;

  // ---- 2. Existing debt vs new bank ----
  y = drawSectionTitle(page, fonts.bold, '2. หนี้ปัจจุบัน vs แพ็กเกจใหม่ (Existing Debt vs New Bank)', MARGIN, y);
  y = drawKV(page, fonts, MARGIN, y, 'ยอดหนี้คงเหลือ:', `${fmt(calculation.current.balance)} บาท`);
  y = drawKV(page, fonts, MARGIN, y, 'อัตราดอกเบี้ยปัจจุบัน:', `${calculation.current.rate}% ต่อปี`);
  y = drawKV(page, fonts, MARGIN, y, 'ค่างวดปัจจุบัน:', `${fmt(calculation.current.monthly)} บาท/เดือน`);
  y = drawKV(page, fonts, MARGIN, y, 'ธนาคารใหม่:', `${selected.bank} (${selected.bankShort})`);
  y = drawKV(page, fonts, MARGIN, y, 'แพ็กเกจ:', selected.packageTitle);
  y = drawKV(page, fonts, MARGIN, y, 'อัตราดอกเบี้ยใหม่ (เฉลี่ย 36 เดือน):', `${selected.rate3YAvg}% ต่อปี`);
  y = drawKV(page, fonts, MARGIN, y, 'ค่างวดใหม่:', `${fmt(selected.newMonthly)} บาท/เดือน`, { valueColor: C.emerald });
  y = drawKV(page, fonts, MARGIN, y, 'ค่างวดลดลงต่อเดือน:', `${fmt(calculation.current.monthly - selected.newMonthly)} บาท`, { valueColor: C.emerald });
  y -= 8;

  // ---- 3. Net savings summary ----
  y = drawSectionTitle(page, fonts.bold, '3. ผลการประหยัดสุทธิ (Net Savings)', MARGIN, y);
  y = drawKV(page, fonts, MARGIN, y, 'ดอกเบี้ย 36 เดือน (ปัจจุบัน):', `${fmt(calculation.current.totalInterest)} บาท`);
  y = drawKV(page, fonts, MARGIN, y, 'ดอกเบี้ย 36 เดือน (แพ็กเกจใหม่):', `${fmt(selected.newInterest)} บาท`);
  y = drawKV(page, fonts, MARGIN, y, 'ประหยัดดอกเบี้ยรวม:', `${fmt(selected.grossSavings)} บาท`, { valueColor: C.emerald });

  // Fee breakdown (one line per fee, strikethrough waived ones shown as " waived")
  const fees = selected.fees;
  y = drawKV(page, fonts, MARGIN, y, 'ค่าธรรมเนียมโอนหนี้:',
    fees.breakdown.map(f => `${f.label}${f.waived ? ' (ฟรี!)' : ` = ${fmt(f.amount)} บาท`}`).join('  •  '));
  y = drawKV(page, fonts, MARGIN, y, 'ค่าธรรมเนียมรวมที่ต้องจ่าย:', `${fmt(fees.total)} บาท`, { valueColor: C.rose });

  // Net savings highlight box
  const netBoxY = y - 4;
  page.drawRectangle({ x: MARGIN, y: netBoxY - 40, width: CONTENT_W, height: 40, color: C.indigoLight });
  page.drawText(`ประหยัดสุทธิ 36 เดือน: ${fmt(selected.netSavings)} บาท`, {
    x: MARGIN + 14, y: netBoxY - 20, size: 14, font: fonts.bold, color: C.indigoDark
  });
  page.drawText(`จุดคุ้มทุน (Break-even): ประมาณ ${selected.breakEvenMonths === Infinity ? 'ไม่คุ้มทุน' : `${selected.breakEvenMonths} เดือน`}`, {
    x: MARGIN + 14, y: netBoxY - 34, size: 10, font: fonts.regular, color: C.slate700
  });
  y = netBoxY - 48;

  // ---- Footer disclaimer ----
  page.drawLine({ start: { x: MARGIN, y: 86 }, end: { x: PAGE_W - MARGIN, y: 86 }, thickness: 0.8, color: C.slate200 });
  const disclaimerLines = wrapText(`หมายเหตุ: ${calculation.meta.disclaimer}`, fonts.regular, 7.5, CONTENT_W);
  disclaimerLines.forEach((line, i) => {
    page.drawText(line, { x: MARGIN, y: 76 - i * 11, size: 7.5, font: fonts.regular, color: C.slate400 });
  });
  page.drawText('Nee-Noi Debt Planner  •  หนี้น้อย', { x: MARGIN, y: 40, size: 8, font: fonts.regular, color: C.slate400 });
}

/**
 * Page 2 — Bank Walk-in Submission Checklist with printable checkboxes.
 */
function drawChecklistPage(page, fonts, { selected, applicantName, checklist, dateStr }) {
  let y = PAGE_H;

  // ---- Header ----
  page.drawRectangle({ x: 0, y: PAGE_H - 92, width: PAGE_W, height: 92, color: C.indigo });
  page.drawRectangle({ x: 0, y: PAGE_H - 98, width: PAGE_W, height: 6, color: C.indigoDark });
  page.drawText('Bank Walk-in Submission Checklist', {
    x: MARGIN, y: PAGE_H - 44, size: 20, font: fonts.bold, color: C.white
  });
  page.drawText('รายการเอกสารสำหรับยื่นที่สาขาธนาคาร (ทำเครื่องหมาย ☑ เมื่อเตรียมครบ)', {
    x: MARGIN, y: PAGE_H - 64, size: 11, font: fonts.regular, color: C.indigoLight
  });

  y = PAGE_H - 118;

  // ---- Context line ----
  page.drawText(`ธนาคาร: ${selected.bank} — ${selected.packageTitle}`, {
    x: MARGIN, y, size: 10.5, font: fonts.bold, color: C.slate900
  });
  y -= 16;
  page.drawText(`ผู้ยื่นกู้: ${applicantName || '-'}   •   วันที่เตรียมเอกสาร: ${dateStr}`, {
    x: MARGIN, y, size: 9.5, font: fonts.regular, color: C.slate500
  });
  y -= 22;

  // ---- Checklist grouped by category ----
  const CATEGORY_LABELS = {
    identity: 'เอกสารยืนยันตัวตน (Identity)',
    income: 'เอกสารแสดงรายได้ (Income)',
    financial: 'เอกสารทางการเงิน (Financial)',
    property: 'เอกสารหลักทรัพย์ / ทรัพย์สิน (Property)',
    insurance: 'เอกสารประกัน (Insurance)'
  };

  const groups = {};
  checklist.forEach(item => {
    (groups[item.category] = groups[item.category] || []).push(item);
  });

  Object.entries(groups).forEach(([category, items]) => {
    // Category header
    page.drawRectangle({ x: MARGIN, y: y - 3, width: CONTENT_W, height: 20, color: C.indigoLight });
    page.drawText(CATEGORY_LABELS[category] || category, {
      x: MARGIN + 10, y: y + 5, size: 10, font: fonts.bold, color: C.indigoDark
    });
    y -= 26;

    items.forEach(item => {
      // Draw an empty checkbox square
      page.drawRectangle({
        x: MARGIN + 2, y: y - 2, width: 11, height: 11,
        borderColor: C.slate500, borderWidth: 1.2
      });
      // Required badge
      page.drawText(item.required ? 'จำเป็น' : 'ถ้ามี', {
        x: MARGIN + 20, y, size: 8, font: fonts.bold,
        color: item.required ? C.rose : C.slate400
      });
      // Label
      const labelX = MARGIN + 58;
      page.drawText(item.label, { x: labelX, y, size: 10.5, font: fonts.bold, color: C.slate900 });
      y -= 14;
      // Description (wrapped, indented)
      const descLines = wrapText(item.description, fonts.regular, 8.5, CONTENT_W - 70);
      descLines.forEach((line, i) => {
        page.drawText(line, { x: MARGIN + 70, y: y - i * 12, size: 8.5, font: fonts.regular, color: C.slate500 });
      });
      y -= descLines.length * 12 + 8;
    });
    y -= 6;
  });

  // ---- Signature line ----
  page.drawText('ข้าพเจ้ายืนยันว่าได้เตรียมเอกสารครบถ้วนตามรายการข้างต้น เพื่อยื่นที่สาขา:', {
    x: MARGIN, y: 130, size: 9.5, font: fonts.regular, color: C.slate700
  });
  page.drawLine({ start: { x: MARGIN + 80, y: 108 }, end: { x: PAGE_W - MARGIN, y: 108 }, thickness: 0.8, color: C.slate500 });
  page.drawText('ลายเซ็น _______________________________  วันที่ ________________', {
    x: MARGIN, y: 94, size: 9.5, font: fonts.regular, color: C.slate700
  });
  page.drawText('หมายเหตุ: เอกสารที่ทำเครื่องหมาย "ถ้ามี" เตรียมเฉพาะกรณีที่เกี่ยวข้องกับผู้ยื่นกู้', {
    x: MARGIN, y: 70, size: 8, font: fonts.regular, color: C.slate400
  });
}

/**
 * Build the complete 2-page Walk-in Application PDF Package.
 *
 * @param {object} opts
 * @param {string} [opts.applicantName]   user name printed on the cover sheet
 * @param {string} opts.occupationLabel   Thai occupation label
 * @param {number} opts.monthlyIncome     monthly income (฿)
 * @param {boolean} opts.wantMRTA         whether MRTA insurance is included
 * @param {object} opts.calculation       return value of calculateRefinanceSavings()
 * @param {object} opts.selected          one entry from calculation.results
 * @param {Array}  opts.checklist         getRequiredDocChecklist(occupation)
 *
 * @returns {Promise<Uint8Array>} PDF bytes ready to save as a .pdf file
 */
export async function buildRefinancePdf({
  applicantName = '',
  occupationLabel = '',
  monthlyIncome = 0,
  wantMRTA = false,
  remainingMonths = null,
  calculation,
  selected,
  checklist = []
}) {
  const pdfDoc = await PDFDocument.create();
  const fonts = await loadFonts(pdfDoc); // throws if the bundled font cannot load

  const dateStr = new Date().toLocaleDateString('th-TH', {
    day: 'numeric', month: 'long', year: 'numeric'
  });

  // Page 1 — Cover sheet
  const page1 = pdfDoc.addPage([PAGE_W, PAGE_H]);
  drawCoverSheet(page1, fonts, { applicantName, occupationLabel, monthlyIncome, wantMRTA, remainingMonths, calculation, selected, dateStr });

  // Page 2 — Walk-in checklist
  const page2 = pdfDoc.addPage([PAGE_W, PAGE_H]);
  drawChecklistPage(page2, fonts, { selected, applicantName, checklist, dateStr });

  // useObjectStreams: false keeps page objects readable in the raw file and
  // avoids any compression edge cases — the PDF stays 100% valid.
  return pdfDoc.save({ useObjectStreams: false });
}
