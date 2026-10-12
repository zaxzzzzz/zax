/**
 * Rate Matrix — shared type contract + runtime normalizers
 * --------------------------------------------------------
 * One promotion may carry a `rate_matrix`: an array of condition rows lifted
 * straight from the bank banner table (GSB / CIMB style tables where each row
 * has its own income floor, MRTA condition, fee waivers and rate ladder).
 *
 * The ADMIN sees and edits the full grid; the USER-facing engine
 * (bestMatchEngine) filters the matrix down to ONE row (best match).
 *
 * Type contract (mirrored as JSDoc so plain-JS tooling can typecheck it):
 *
 * @typedef {Object} RateMatrixRow
 * @property {string}   [id]               Stable row id (auto-generated when absent).
 * @property {string}   customer_group     Customer group label (Thai) e.g. 'พนักงานประจำ', 'ทุกประเภท'.
 * @property {number}   min_income         Minimum monthly income for this row (฿, 0 = none).
 * @property {string[]} property_types     Eligible property types (canonical Thai labels, [] = any).
 * @property {boolean}  is_mrta            true when this row requires MRTA/MLTA ("ทำประกันชีวิต").
 * @property {boolean}  is_free_mortgage   true when this row waives the mortgage registration fee.
 * @property {string[]} [fee_waivers]      Optional finer-grained waiver labels (ประเมินราคา/จดจำนอง/อากรแสตมป์).
 * @property {string}   year_1_rate        Year-1 rate, e.g. "1.49%" or "MRR - 2.00%".
 * @property {string}   year_2_3_rate      Year 2-3 rate.
 * @property {string}   [after_year_3_rate] Floating rate after year 3.
 * @property {number}   avg_3yr_rate       Weighted 3-yr average (%, Number, 0 = derive from rates).
 * @property {number}   [eir]              Effective interest rate (%, 0 = unknown).
 * @property {number}   [style]            Source banner style number (ทางเลือกที่ N).
 */

/** Canonical customer-group labels accepted in matrix rows. */
export const RATE_MATRIX_CUSTOMER_GROUPS = [
  'พนักงานประจำ',
  'เจ้าของกิจการ',
  'ฟรีแลนซ์',
  'ข้าราชการ',
  'ผู้รับบำนาญ',
  'ทุกประเภท'
];

/** Map Thai banner phrases to the is_mrta boolean ("ทำประกันชีวิต" -> true). */
const MRTA_TRUE_TOKENS = ['ทำประกัน', 'mrta', 'mlta'];
const MRTA_FALSE_TOKENS = ['ไม่ทำ', 'ไม่มี', 'no mrta', 'without mrta'];

/** Parse a free-text MRTA cell ("ทำประกันชีวิต" / "ไม่ทำ") into a boolean. */
export function parseMrtaCell(value, fallback = false) {
  if (typeof value === 'boolean') return value;
  if (value === 1) return true;
  if (value === 0 || value === null || value === undefined) return fallback;
  const s = String(value).toLowerCase().trim();
  if (!s) return fallback;
  if (MRTA_FALSE_TOKENS.some(t => s.includes(t))) return false;
  if (MRTA_TRUE_TOKENS.some(t => s.includes(t))) return true;
  return fallback;
}

/** Parse a free-text fee cell ("ฟรีค่าจดจำนอง" / "-" / "") into a boolean. */
export function parseFreeMortgageCell(value, fallback = false) {
  if (typeof value === 'boolean') return value;
  if (value === null || value === undefined || value === '') return fallback;
  const s = String(value).toLowerCase().trim();
  if (!s || s === '-' || s === 'null') return fallback;
  if (/ไม่ฟรี|ไม่ยกเว้น|no free|not free|not waive/.test(s)) return false;
  if (/(ฟรี|free|waive|ยกเว้น)/.test(s)) return true;
  return fallback;
}

/** Extract the first numeric value from a rate-ish cell ("2.49%", "คงที่ 2.49"). */
function rateNumber(value) {
  if (value === null || value === undefined) return 0;
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  const m = String(value).replace(/,/g, '.').match(/(\d+(?:\.\d+)?)/);
  return m ? Number(m[1]) : 0;
}

/**
 * Compute the weighted 3-year average from the year-1 / year-2-3 cells
 * (year 1 counts once, years 2-3 count twice). Falls back per-cell.
 */
export function computeAvg3yr(row) {
  const y1 = rateNumber(row.year_1_rate);
  const y23 = rateNumber(row.year_2_3_rate) || y1;
  if (y1 > 0 && y23 > 0) return Number(((y1 + y23 * 2) / 3).toFixed(2));
  return y1 || y23 || 0;
}

const asString = (v) => (v === null || v === undefined ? '' : String(v).trim());
const asArray = (v) => (Array.isArray(v)
  ? v.map(x => asString(x)).filter(Boolean)
  : (asString(v) ? asString(v).split(/[,\n]/).map(s => s.trim()).filter(Boolean) : []));
const asNumber = (v) => {
  const n = Number(asString(v).replace(/[^\d.-]/g, ''));
  return Number.isFinite(n) ? n : 0;
};

/** Normalized row id generator (stable across re-saves when id is present). */
const rowId = (i) => `rm-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}-${i}`;

/**
 * Coerce any raw row (Gemini output, admin form input, DB record) into a fully
 * typed RateMatrixRow. Never throws — bad cells degrade to safe defaults.
 * @param {any} input
 * @param {number} index
 * @returns {RateMatrixRow}
 */
export function normalizeRateMatrixRow(input, index = 0) {
  const raw = input && typeof input === 'object' ? input : {};
  const row = {
    id: asString(raw.id) || undefined,
    customer_group: asString(raw.customer_group) || 'ทุกประเภท',
    min_income: asNumber(raw.min_income),
    property_types: asArray(raw.property_types),
    is_mrta: parseMrtaCell(raw.is_mrta ?? raw.mrta ?? raw.require_mrta, false),
    is_free_mortgage: parseFreeMortgageCell(raw.is_free_mortgage ?? raw.is_free_mortgage_fee ?? raw.free_mortgage, false),
    fee_waivers: asArray(raw.fee_waivers),
    year_1_rate: asString(raw.year_1_rate),
    year_2_3_rate: asString(raw.year_2_3_rate),
    after_year_3_rate: asString(raw.after_year_3_rate),
    avg_3yr_rate: asNumber(raw.avg_3yr_rate),
    eir: asNumber(raw.eir),
    style: asNumber(raw.style) || (index + 1)
  };
  if (!row.fee_waivers.length && row.is_free_mortgage) row.fee_waivers = ['จดจำนอง'];
  if (!row.avg_3yr_rate) row.avg_3yr_rate = computeAvg3yr(row);
  if (!row.id) row.id = rowId(index);
  return row;
}

/**
 * Normalize a whole rate_matrix payload into RateMatrixRow[].
 * Accepts a single object (treated as a one-row matrix) or null.
 * @param {any} matrix
 * @returns {RateMatrixRow[]}
 */
export function normalizeRateMatrix(matrix) {
  if (!matrix) return [];
  const list = Array.isArray(matrix) ? matrix : [matrix];
  return list
    .filter(r => r && typeof r === 'object')
    .map((r, i) => normalizeRateMatrixRow(r, i));
}

/**
 * Derive the promo-level summary fields from a rate matrix (used to fill the
 * simple form fields and the user-facing engine when a matrix exists).
 * Picks the row with the lowest avg_3yr_rate (the "best" row).
 * @param {RateMatrixRow[]} matrix
 * @returns {Partial<RateMatrixRow> & { rowCount: number } | null}
 */
export function bestMatrixRow(matrix) {
  const rows = normalizeRateMatrix(matrix);
  if (rows.length === 0) return null;
  const best = [...rows].sort((a, b) => (a.avg_3yr_rate || 99) - (b.avg_3yr_rate || 99))[0];
  return { ...best, rowCount: rows.length };
}

/**
 * Filter a rate matrix by the user's conditions and return the single best
 * (lowest avg_3yr_rate) matching row — the row the user-facing card shows.
 * Rows that do not specify a condition (0 income, empty property list,
 * 'ทุกประเภท') act as wildcards.
 * @param {RateMatrixRow[]} matrix
 * @param {{ monthlyIncome?: number, wantMRTA?: boolean, propertyType?: string, customerType?: string }} user
 * @returns {RateMatrixRow | null}
 */
export function pickBestMatrixRow(matrix, user = {}) {
  const rows = normalizeRateMatrix(matrix);
  if (rows.length === 0) return null;
  const income = Number(user.monthlyIncome) || 0;
  const wantMRTA = Boolean(user.wantMRTA);

  const eligible = rows.filter(row => {
    if (income > 0 && row.min_income > income) return false;
    if (row.is_mrta !== wantMRTA) return false;
    if (user.propertyType && row.property_types.length > 0 && !row.property_types.includes(user.propertyType)) return false;
    if (user.customerType && row.customer_group !== 'ทุกประเภท' && row.customer_group !== user.customerType) return false;
    return true;
  });

  // Graceful degradation: relax customer group, then property type, then income
  // (mirrors pickVariant's "no exact match → banner order" behaviour).
  const pool = eligible.length > 0 ? eligible : rows.filter(r => r.is_mrta === wantMRTA);
  const finalPool = pool.length > 0 ? pool : rows;
  return [...finalPool].sort((a, b) => (a.avg_3yr_rate || 99) - (b.avg_3yr_rate || 99))[0] || null;
}

/** Empty editable row for the admin grid ("เพิ่มแถว" button). */
export function emptyMatrixRow(style = 1) {
  return normalizeRateMatrixRow({
    customer_group: 'ทุกประเภท',
    min_income: 0,
    property_types: [],
    is_mrta: false,
    is_free_mortgage: false,
    fee_waivers: [],
    year_1_rate: '',
    year_2_3_rate: '',
    after_year_3_rate: '',
    avg_3yr_rate: 0,
    eir: 0,
    style
  });
}

export default {
  RATE_MATRIX_CUSTOMER_GROUPS,
  parseMrtaCell,
  parseFreeMortgageCell,
  computeAvg3yr,
  normalizeRateMatrixRow,
  normalizeRateMatrix,
  bestMatrixRow,
  pickBestMatrixRow,
  emptyMatrixRow
};
