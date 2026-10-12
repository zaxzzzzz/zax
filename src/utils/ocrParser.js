/**
 * OCR text parsing heuristics for Thai bank statements / bills.
 *
 * Tesseract OCR output is noisy, so instead of exact field extraction we look
 * for numbers near known keywords (ยอดหนี้ / ขั้นต่ำ / ดอกเบี้ย etc.) and let
 * the user review every field before importing. All functions are pure so the
 * parsing logic can be unit-tested without React or Tesseract.
 */

export const BALANCE_KEYWORDS = [
  'ยอดหนี้คงเหลือ', 'ยอดหนี้รวม', 'ยอดรวมหนี้', 'ยอดคงเหลือ',
  'ยอดเงินคงเหลือ', 'ยอดหนี้', 'ยอดเงิน', 'รวมทั้งสิ้น', 'ยอดชำระรวม',
  'ราคารวม', 'ยอดรวม', 'รวม', 'ชำระเงิน',
  'balance', 'total amount', 'total', 'outstanding', 'amount due'
];
export const MIN_PAYMENT_KEYWORDS = [
  'ยอดชำระขั้นต่ำ', 'ชำระขั้นต่ำ', 'ขั้นต่ำ', 'ยอดชำระ',
  'minimum payment', 'minimum', 'min payment', 'min pay'
];
export const INTEREST_KEYWORDS = ['อัตราดอกเบี้ย', 'ดอกเบี้ย', 'interest', 'apr'];

export function findLender(text) {
  if (!text) return '';
  const knowns = [
    'Salford & Co.', 'Salford', 'KBank', 'กสิกร', 'SCB', 'ไทยพาณิชย์', 'Krungsri', 'กรุงศรี',
    'TTB', 'ทีทีบี', 'Bangkok Bank', 'กรุงเทพ', 'GSB', 'ออมสิน', 'KTC', 'กรุงไทย',
    'AEON', 'อิออน', 'Lotus', 'โลตัส', 'First Choice', 'เฟิร์สช้อยส์', 'UOB', 'ยูโอบี'
  ];
  const lower = text.toLowerCase();
  for (const k of knowns) {
    if (lower.includes(k.toLowerCase())) return k;
  }
  const sellerMatch = text.match(/(?:ผู้ขาย|ชื่อบัญชี|ผู้ออกเอกสาร|ร้านค้า)\s*[:\s]\s*([^\n\r,]+)/i);
  if (sellerMatch && sellerMatch[1]) {
    return sellerMatch[1].trim();
  }
  return '';
}

const THAI_MONTHS = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];

const ENGLISH_MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];

const DUE_DATE_KEYWORDS = ['วันครบกำหนด', 'ครบกำหนด', 'กำหนดชำระ', 'ชำระเงินภายใน', 'ชำระภายใน', 'due date', 'due'];

// Thai combining marks (vowels/tone marks, U+0E31–U+0E3A and U+0E47–U+0E4E)
// inflate String#length, so count only base characters when measuring how long
// a label looks on screen. Otherwise the value right after a label is judged
// to start "before" the label and loses to a farther number.
function visibleLength(str) {
  let count = 0;
  for (const ch of str) {
    if (!/[ั-ฺ็-๎]/.test(ch)) count += 1;
  }
  return count;
}

const THAI_MONTH_ABBR_RE = /(ม\.ค\.|ก\.พ\.|มี\.ค\.|เม\.ย\.|พ\.ค\.|มิ\.ย\.|ก\.ค\.|ส\.ค\.|ก\.ย\.|ต\.ค\.|พ\.ย\.|ธ\.ค\.)/;

// A bare 4-digit number is treated as a YEAR (e.g. Buddhist 2569) only when it
// sits right after a month name or a numeric date ("05 ส.ค. 2569", "28/08/2569").
// Balances like 2,345.67 or 2,500 must NOT be discarded as years.
function isContextualYear(text, m) {
  const raw = m[1];
  if (m[2] !== undefined || raw.includes(',')) return false; // has fraction / thousands separator
  if (!/^\d{4}$/.test(raw)) return false;
  const val = parseFloat(raw);
  if (val < 1900 || val > 2699) return false;
  const before = text.slice(Math.max(0, m.index - 14), m.index);
  return THAI_MONTH_ABBR_RE.test(before)
    || /\d[/\-.]\d{1,2}[/\-.]\s*$/.test(before);
}

// Extract all numbers from the OCR text (skipping percentages).
export function extractNumbers(text) {
  const nums = [];
  const re = /(\d{1,3}(?:,\d{3})+|\d+)(?:\.(\d+))?/g;
  let m;
  while ((m = re.exec(text))) {
    const after = text.slice(m.index + m[0].length, m.index + m[0].length + 2);
    if (after.includes('%')) continue;
    let val = parseFloat(m[1].replace(/,/g, ''));
    if (m[2] !== undefined) val += parseFloat(`0.${m[2]}`);
    nums.push({ val, idx: m.index, isYear: isContextualYear(text, m) });
  }
  return nums;
}

// Find the number closest to any of the given keywords.
export function findAmountNear(text, keywords, options = {}) {
  const { maxDist = 90, fallbackLargest = false, minVal = 0 } = options;
  const nums = extractNumbers(text).filter(n => n.val >= minVal && !n.isYear);
  if (nums.length === 0) return null;

  const haystack = text.toLowerCase();

  let best = null;
  let bestScore = Infinity;
  for (const kw of keywords) {
    let idx = -1;
    while ((idx = haystack.indexOf(kw, idx + 1)) !== -1) {
      const kwEnd = idx + visibleLength(kw);
      for (const n of nums) {
        // Thai bills use a label-then-value layout ("ยอดหนี้คงเหลือ 45,000 บาท"),
        // so prefer the number that FOLLOWS the keyword; distance is measured
        // from the keyword's end for after-numbers so long labels are not
        // penalized. Numbers before the label are only used as a fallback.
        const isAfter = n.idx >= kwEnd;
        const dist = isAfter ? n.idx - kwEnd : idx - n.idx;
        if (dist <= maxDist) {
          const score = (isAfter ? 0 : 1_000_000) + dist;
          if (score < bestScore) {
            best = n.val;
            bestScore = score;
          }
        }
      }
    }
  }
  if (best !== null) return best;
  if (fallbackLargest && nums.length) {
    return nums.reduce((mx, n) => Math.max(mx, n.val), -Infinity);
  }
  return null;
}

export function findInterestRate(text) {
  const matches = [...text.matchAll(/(\d+(?:\.\d+)?)\s*%/g)];
  for (const m of matches) {
    const rate = parseFloat(m[1]);
    if (rate >= 3 && rate <= 40) return rate;
  }
  const near = findAmountNear(text, INTEREST_KEYWORDS, { maxDist: 60 });
  if (near !== null && near > 0 && near <= 40) return near;
  return null;
}

export function findDueDate(text) {
  // Thai format: "15 ส.ค. 2569" / "15ส.ค.2026"
  const thaiRe = new RegExp(`\\b(\\d{1,2})\\s*(${THAI_MONTHS.join('|')})\\s*(\\d{2,4})?`, 'gi');
  // Numeric format: 15/08/2026, 15-08-69, 15.08.2026
  const numRe = /\b(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})\b/g;
  // English month formats: "August 12, 2026" and "12 August 2026"
  const engMonthsRe = ENGLISH_MONTHS.join('|');
  const engMonthFirstRe = new RegExp(`\\b(${engMonthsRe})\\s+(\\d{1,2})(?:st|nd|rd|th)?\\b`, 'gi');
  const engDayFirstRe = new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+(${engMonthsRe})\\b`, 'gi');

  const dateMatches = [];
  for (const m of text.matchAll(thaiRe)) dateMatches.push({ day: m[1], idx: m.index });
  for (const m of text.matchAll(numRe)) dateMatches.push({ day: m[1], idx: m.index });
  for (const m of text.matchAll(engMonthFirstRe)) dateMatches.push({ day: m[2], idx: m.index });
  for (const m of text.matchAll(engDayFirstRe)) dateMatches.push({ day: m[1], idx: m.index });
  if (dateMatches.length === 0) return '';

  const haystack = text.toLowerCase();

  // Statements list the statement/issue date before the due date, so prefer
  // the date closest to a due-date keyword (same label-then-value scoring as
  // findAmountNear); fall back to the first date found.
  let bestDay = null;
  let bestScore = Infinity;
  for (const kw of DUE_DATE_KEYWORDS) {
    let idx = -1;
    while ((idx = haystack.indexOf(kw, idx + 1)) !== -1) {
      const kwEnd = idx + visibleLength(kw);
      for (const dm of dateMatches) {
        const isAfter = dm.idx >= kwEnd;
        const dist = isAfter ? dm.idx - kwEnd : idx - dm.idx;
        if (dist <= 120) {
          const score = (isAfter ? 0 : 1_000_000) + dist;
          if (score < bestScore) {
            bestDay = dm.day;
            bestScore = score;
          }
        }
      }
    }
  }
  return `${bestDay !== null ? bestDay : dateMatches[0].day} ของทุกเดือน`;
}

/**
 * Parse raw OCR text into editable debt fields.
 *
 * Returns { hasText, data } where data = { name, lender, balance, interestRate,
 * minPayment, dueDate }. Values are strings ('' when not found) so they can be
 * bound directly to editable inputs; minPayment falls back to 5% of the
 * balance when the statement does not state it.
 */
export function parseOcrText(rawText) {
  const text = (rawText || '').replace(/\s+/g, ' ').trim();
  const emptyData = { name: '', lender: '', balance: '', interestRate: '', minPayment: '', dueDate: '' };
  if (!text) return { hasText: false, data: emptyData };

  const balance = findAmountNear(text, BALANCE_KEYWORDS, { fallbackLargest: true, minVal: 1000 });
  const minPayment = findAmountNear(text, MIN_PAYMENT_KEYWORDS, { minVal: 20 });
  const interestRate = findInterestRate(text);
  const dueDate = findDueDate(text);
  const lender = findLender(text);

  const isInvoice = text.includes('ใบแจ้งหนี้') || text.toLowerCase().includes('invoice');

  return {
    hasText: true,
    data: {
      name: isInvoice ? `ใบแจ้งหนี้ - ${lender || 'Salford & Co.'}` : (lender || ''),
      lender: lender || '',
      balance: balance !== null ? String(balance) : '',
      interestRate: interestRate !== null ? String(interestRate) : '',
      minPayment: minPayment !== null ? String(minPayment) : (balance !== null ? String(Math.round(balance * 0.05)) : ''),
      dueDate
    }
  };
}
