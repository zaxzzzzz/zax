/**
 * Nee-Noi Admin Backend API (zero-dependency Node server)
 * --------------------------------------------------------
 * Endpoints:
 *   GET    /api/admin/promotions            -> { ok, promotions }
 *   POST   /api/admin/promotions            -> Create/Update one promotion (upsert by id) -> { ok, promotion }
 *   DELETE /api/admin/promotions?id=<id>    -> { ok, deletedId }
 *   POST   /api/admin/promotions/analyze      -> { image_base64|image_url, mime_type } -> Gemini Vision JSON schema
 *   POST   /api/admin/promotions/extract-image -> alias of /analyze (API spec name)
 *   POST   /api/admin/promotions/upload-image  -> { image_base64, mime_type } -> { ok, url: "/uploads/xxx.png" } (stores file in server/data/uploads)
 *   GET    /api/admin/occupations            -> { ok, occupations }
 *   POST   /api/admin/occupations            -> Create/Update one occupation (upsert by id/key) -> { ok, occupation }
 *   DELETE /api/admin/occupations?id=<id>    -> { ok, deletedId }
 *
 * Database: JSON file at server/data/promotions.json (auto-seeded on first run).
 * Static: serves ../dist when built (single process deployment). Run: npm run server
 */

import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const PORT = Number(process.env.PORT || 8787);
const ROOT = path.join(__dirname, '..');
const DIST_DIR = path.join(ROOT, 'dist');
const DATA_DIR = path.join(__dirname, 'data');
// Banner image uploads live in server/data/uploads (overridable for tests)
const UPLOADS_DIR = process.env.PROMO_UPLOADS_DIR || path.join(DATA_DIR, 'uploads');
// Overridable for tests (PROMOTIONS_DB_FILE) — defaults to server/data/promotions.json
const DB_FILE = process.env.PROMOTIONS_DB_FILE || path.join(DATA_DIR, 'promotions.json');
const MAX_BODY_BYTES = 15 * 1024 * 1024; // 15MB (covers base64 banner images)

/* ---------------- .env loader (no dotenv dependency) ---------------- */
function loadEnvFile() {
  const envPath = path.join(ROOT, '.env');
  if (!fs.existsSync(envPath)) return;
  try {
    const lines = fs.readFileSync(envPath, 'utf8').split(/\r?\n/);
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith('[TEMPLATE]')) continue;
      const eq = trimmed.indexOf('=');
      if (eq === -1) continue;
      const key = trimmed.slice(0, eq).trim();
      const value = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, '');
      if (key && process.env[key] === undefined) process.env[key] = value;
    }
  } catch (err) {
    console.warn('[server] Unable to read .env file:', err.message);
  }
}
loadEnvFile();

/* ---------------- JSON-file "database" ---------------- */
// Seed data mirrors the client's INITIAL_PROMOTIONS baseline.
const PROMOTION_SEED = [
  {
    id: 'promo-krungsri-opt1',
    bank_name: 'ธนาคารกรุงศรีอยุธยา',
    product_name: 'กรุงศรี รีไฟแนนซ์ ทางเลือก 1',
    property_types: ['บ้านเดี่ยว', 'ทาวน์เฮาส์', 'คอนโด'],
    min_income: 15000,
    customer_type: 'พนักงานประจำ',
    target_loan_amount: 0,
    min_loan_tier: 0,
    min_loan_amount: 0,
    max_loan_amount: 0,
    max_ltv_percent: 90,
    avg_3yr_rate: 2.55,
    year_1_rate: '2.20%',
    year_2_3_rate: '2.20%',
    after_year_3_rate: 'MRR - 2.15%',
    is_mrta: true,
    is_free_mortgage_fee: false,
    fee_waivers: [],
    variants: [],
    promo_image_url: '',
    bank_ref_link: 'https://www.krungsri.com/th/personal/loans/home-loans/refinance',
    updated_at: 0
  },
  {
    id: 'promo-ghbank-1',
    bank_name: 'ธนาคารอาคารสงเคราะห์',
    product_name: 'โครงการสินเชื่อบ้านสุขสันต์ (Refinance In)',
    property_types: ['บ้านเดี่ยว', 'ทาวน์เฮาส์', 'ที่ดินพร้อมสิ่งปลูกสร้าง'],
    min_income: 15000,
    customer_type: 'พนักงานประจำ',
    target_loan_amount: 0,
    min_loan_tier: 0,
    min_loan_amount: 0,
    max_loan_amount: 20000000,
    max_ltv_percent: 95,
    avg_3yr_rate: 2.99,
    year_1_rate: '1.99%',
    year_2_3_rate: '3.49%',
    after_year_3_rate: 'MRR - 1.50%',
    is_mrta: true,
    is_free_mortgage_fee: true,
    fee_waivers: ['จดจำนอง'],
    variants: [],
    promo_image_url: '',
    bank_ref_link: 'https://www.ghbank.co.th/product/loan',
    updated_at: 0
  },
  {
    id: 'promo-kbank-1',
    bank_name: 'ธนาคารกสิกรไทย',
    product_name: 'K-Home Loan รีไฟแนนซ์ ปลดภาระหนี้บ้าน',
    property_types: ['บ้านเดี่ยว', 'คอนโด', 'อาคารพาณิชย์'],
    min_income: 30000,
    customer_type: 'พนักงานประจำ',
    target_loan_amount: 0,
    min_loan_tier: 0,
    min_loan_amount: 500000,
    max_loan_amount: 0,
    max_ltv_percent: 85,
    avg_3yr_rate: 2.99,
    year_1_rate: '2.50%',
    year_2_3_rate: '3.23%',
    after_year_3_rate: 'MRR - 1.80%',
    is_mrta: false,
    is_free_mortgage_fee: false,
    fee_waivers: ['ประเมินราคา'],
    variants: [],
    promo_image_url: '',
    bank_ref_link: 'https://www.kasikornbank.com/th/personal/loan/homeloan/pages/refinance.aspx',
    updated_at: 0
  },
  // ---- Krung Thai refinance tables (>=3M and <3M tiers, styles 1-4) ----
  {
    id: 'promo-krungthai-tier3m',
    bank_name: 'ธนาคารกรุงไทย',
    product_name: 'กรุงไทย รีไฟแนนซ์บ้าน วงเงิน 3 ล้านบาทขึ้นไป',
    property_types: ['บ้านเดี่ยว', 'ทาวน์เฮาส์', 'คอนโด', 'อาคารพาณิชย์'],
    min_income: 30000,
    customer_type: 'พนักงานประจำ',
    target_loan_amount: 0,
    min_loan_tier: 3000000,
    min_loan_amount: 3000000,
    max_loan_amount: 0,
    max_ltv_percent: 85,
    avg_3yr_rate: 2.49,
    year_1_rate: '1.49%',
    year_2_3_rate: '2.49%',
    after_year_3_rate: 'MRR - 2.00%',
    is_mrta: true,
    is_free_mortgage_fee: true,
    fee_waivers: ['จดจำนอง', 'ประเมินราคา'],
    variants: [
      { style: 1, style_name: 'ทางเลือกที่ 1 (MRTA)', is_mrta: true, year_1_rate: '1.49%', year_2_3_rate: '2.49%', after_year_3_rate: 'MRR - 2.00%', mrr_formula: 'MRR - 2.00%', eir: 2.61 },
      { style: 2, style_name: 'ทางเลือกที่ 2 (MRTA)', is_mrta: true, year_1_rate: '1.79%', year_2_3_rate: '2.59%', after_year_3_rate: 'MRR - 1.90%', mrr_formula: 'MRR - 1.90%', eir: 2.68 },
      { style: 3, style_name: 'ทางเลือกที่ 3 (ไม่มี MRTA)', is_mrta: false, year_1_rate: '2.29%', year_2_3_rate: '2.79%', after_year_3_rate: 'MRR - 1.75%', mrr_formula: 'MRR - 1.75%', eir: 2.79 },
      { style: 4, style_name: 'ทางเลือกที่ 4 (ไม่มี MRTA)', is_mrta: false, year_1_rate: '2.59%', year_2_3_rate: '2.99%', after_year_3_rate: 'MRR - 1.50%', mrr_formula: 'MRR - 1.50%', eir: 2.93 }
    ],
    promo_image_url: '',
    bank_ref_link: 'https://www.krungthai.com/th/personal/loan/home-loan-refinance',
    updated_at: 0
  },
  {
    id: 'promo-krungthai-under3m',
    bank_name: 'ธนาคารกรุงไทย',
    product_name: 'กรุงไทย รีไฟแนนซ์บ้าน วงเงินต่ำกว่า 3 ล้านบาท',
    property_types: ['บ้านเดี่ยว', 'ทาวน์เฮาส์', 'คอนโด'],
    min_income: 15000,
    customer_type: 'พนักงานประจำ',
    target_loan_amount: 0,
    min_loan_tier: 0,
    min_loan_amount: 0,
    max_loan_amount: 2999999,
    max_ltv_percent: 90,
    avg_3yr_rate: 2.69,
    year_1_rate: '1.79%',
    year_2_3_rate: '2.69%',
    after_year_3_rate: 'MRR - 1.85%',
    is_mrta: true,
    is_free_mortgage_fee: true,
    fee_waivers: ['จดจำนอง'],
    variants: [
      { style: 1, style_name: 'ทางเลือกที่ 1 (MRTA)', is_mrta: true, year_1_rate: '1.79%', year_2_3_rate: '2.69%', after_year_3_rate: 'MRR - 1.85%', mrr_formula: 'MRR - 1.85%', eir: 2.78 },
      { style: 2, style_name: 'ทางเลือกที่ 2 (MRTA)', is_mrta: true, year_1_rate: '2.09%', year_2_3_rate: '2.79%', after_year_3_rate: 'MRR - 1.75%', mrr_formula: 'MRR - 1.75%', eir: 2.83 },
      { style: 3, style_name: 'ทางเลือกที่ 3 (ไม่มี MRTA)', is_mrta: false, year_1_rate: '2.49%', year_2_3_rate: '2.99%', after_year_3_rate: 'MRR - 1.60%', mrr_formula: 'MRR - 1.60%', eir: 2.96 },
      { style: 4, style_name: 'ทางเลือกที่ 4 (ไม่มี MRTA)', is_mrta: false, year_1_rate: '2.79%', year_2_3_rate: '3.19%', after_year_3_rate: 'MRR - 1.40%', mrr_formula: 'MRR - 1.40%', eir: 3.12 }
    ],
    promo_image_url: '',
    bank_ref_link: 'https://www.krungthai.com/th/personal/loan/home-loan-refinance',
    updated_at: 0
  }
];

function readDb() {
  try {
    if (!fs.existsSync(DB_FILE)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
      fs.writeFileSync(DB_FILE, JSON.stringify(PROMOTION_SEED, null, 2), 'utf8');
      return [...PROMOTION_SEED];
    }
    const parsed = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
    return Array.isArray(parsed) ? parsed : [...PROMOTION_SEED];
  } catch (err) {
    console.error('[server] Failed to read promotions DB:', err.message);
    return [...PROMOTION_SEED];
  }
}

function writeDb(promotions) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const tmpFile = DB_FILE + '.tmp';
  fs.writeFileSync(tmpFile, JSON.stringify(promotions, null, 2), 'utf8');
  fs.renameSync(tmpFile, DB_FILE);
}

/* ---------------- Occupations master (admin-configurable config) ---------------- */
// Occupations master table. Stored as its own JSON config file so admins can
// add/edit/remove occupations without redeploying. Seeded with the canonical
// keys used across the app (refinanceCalculator / documentChecklist).
const OCCUPATIONS_FILE = process.env.OCCUPATIONS_DB_FILE || path.join(DATA_DIR, 'occupations.json');

const OCCUPATION_SEED = [
  { id: 'occ-salaried', key: 'salaried', label: 'พนักงานเงินเดือน', labelEn: 'Salaried Employee', allowed: true, updated_at: 0 },
  { id: 'occ-government', key: 'government', label: 'ข้าราชการ / พนักงานรัฐวิสาหกิจ', labelEn: 'Government Officer', allowed: true, updated_at: 0 },
  { id: 'occ-freelance', key: 'freelance', label: 'ฟรีแลนซ์ / อาชีพอิสระ', labelEn: 'Freelance', allowed: true, updated_at: 0 },
  { id: 'occ-business', key: 'business', label: 'เจ้าของกิจการ / ธุรกิจ', labelEn: 'Business Owner', allowed: true, updated_at: 0 },
  { id: 'occ-pensioner', key: 'pensioner', label: 'ผู้รับบำนาญ / เกษียณอายุ', labelEn: 'Pensioner', allowed: true, updated_at: 0 },
  { id: 'occ-other', key: 'other', label: 'อื่นๆ (ระบุเอง)', labelEn: 'Other', allowed: true, updated_at: 0 }
];

function readOccupations() {
  try {
    if (!fs.existsSync(OCCUPATIONS_FILE)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
      fs.writeFileSync(OCCUPATIONS_FILE, JSON.stringify(OCCUPATION_SEED, null, 2), 'utf8');
      return [...OCCUPATION_SEED];
    }
    const parsed = JSON.parse(fs.readFileSync(OCCUPATIONS_FILE, 'utf8'));
    return Array.isArray(parsed) ? parsed : [...OCCUPATION_SEED];
  } catch (err) {
    console.error('[server] Failed to read occupations DB:', err.message);
    return [...OCCUPATION_SEED];
  }
}

function writeOccupations(occupations) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const tmpFile = OCCUPATIONS_FILE + '.tmp';
  fs.writeFileSync(tmpFile, JSON.stringify(occupations, null, 2), 'utf8');
  fs.renameSync(tmpFile, OCCUPATIONS_FILE);
}

/** Normalize incoming occupation payload (typed record with stable key). */
function normalizeOccupation(input) {
  return {
    id: String(input.id || `occ-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`),
    key: String(input.key || '').trim() || String(input.id || `occ-${Date.now()}`).trim(),
    label: String(input.label || '').trim(),
    labelEn: String(input.labelEn || '').trim(),
    allowed: input.allowed === undefined ? true : Boolean(input.allowed),
    updated_at: Date.now()
  };
}

/* ---------------- Users & User Profiles DB ---------------- */
const USERS_FILE = process.env.USERS_DB_FILE || path.join(DATA_DIR, 'users.json');
const USER_PROFILES_FILE = process.env.USER_PROFILES_DB_FILE || path.join(DATA_DIR, 'user_profiles.json');

const USER_SEED = [
  { id: 'admin', username: 'admin', email: 'admin@neenoi.com', password: 'admin123', name: 'Admin User', role: 'admin', created_at: 0 },
  { id: 'user1', username: 'user1', email: 'user1@neenoi.com', password: 'user123', name: 'User 1', role: 'user', created_at: 0 },
  { id: 'user2', username: 'user2', email: 'user2@neenoi.com', password: 'user234', name: 'User 2', role: 'user', created_at: 0 },
  { id: 'user3', username: 'user3', email: 'user3@neenoi.com', password: 'user345', name: 'User 3', role: 'user', created_at: 0 }
];

const USER_PROFILE_SEED = [
  { id: 'admin', user_id: 'admin', gender: 'ชาย', age: 35, occupation: 'ผู้ดูแลระบบ', created_at: 0 },
  { id: 'user1', user_id: 'user1', gender: 'ชาย', age: 30, occupation: 'พนักงานเงินเดือน', created_at: 0 },
  { id: 'user2', user_id: 'user2', gender: 'หญิง', age: 28, occupation: 'เจ้าของกิจการ / ธุรกิจ', created_at: 0 },
  { id: 'user3', user_id: 'user3', gender: 'ชาย', age: 42, occupation: 'ข้าราชการ / พนักงานรัฐวิสาหกิจ', created_at: 0 }
];

function readUsers() {
  try {
    if (!fs.existsSync(USERS_FILE)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
      fs.writeFileSync(USERS_FILE, JSON.stringify(USER_SEED, null, 2), 'utf8');
      return [...USER_SEED];
    }
    const parsed = JSON.parse(fs.readFileSync(USERS_FILE, 'utf8'));
    return Array.isArray(parsed) ? parsed : [...USER_SEED];
  } catch (err) {
    console.error('[server] Failed to read users DB:', err.message);
    return [...USER_SEED];
  }
}

function writeUsers(users) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const tmpFile = USERS_FILE + '.tmp';
  fs.writeFileSync(tmpFile, JSON.stringify(users, null, 2), 'utf8');
  fs.renameSync(tmpFile, USERS_FILE);
}

function readUserProfiles() {
  try {
    if (!fs.existsSync(USER_PROFILES_FILE)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
      fs.writeFileSync(USER_PROFILES_FILE, JSON.stringify(USER_PROFILE_SEED, null, 2), 'utf8');
      return [...USER_PROFILE_SEED];
    }
    const parsed = JSON.parse(fs.readFileSync(USER_PROFILES_FILE, 'utf8'));
    return Array.isArray(parsed) ? parsed : [...USER_PROFILE_SEED];
  } catch (err) {
    console.error('[server] Failed to read user_profiles DB:', err.message);
    return [...USER_PROFILE_SEED];
  }
}

function writeUserProfiles(profiles) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const tmpFile = USER_PROFILES_FILE + '.tmp';
  fs.writeFileSync(tmpFile, JSON.stringify(profiles, null, 2), 'utf8');
  fs.renameSync(tmpFile, USER_PROFILES_FILE);
}

/* ---------------- Debts DB & Normalization ---------------- */
const DEBTS_FILE = process.env.DEBTS_DB_FILE || path.join(DATA_DIR, 'debts.json');

const DEBT_SEED = [
  {
    id: "debt-1",
    user_id: "user1",
    bank_name: "ธนาคารกรุงไทย (KTC)",
    creditor: "ธนาคารกรุงไทย (KTC)",
    lender: "ธนาคารกรุงไทย (KTC)",
    debt_name: "บัตรเครดิต KTC Visa",
    name: "บัตรเครดิต KTC Visa",
    debt_type: "บัตรเครดิต",
    category: "credit_card",
    current_balance: 32000,
    balance: 32000,
    interest_rate_percent: 16.0,
    interestRate: 16.0,
    min_monthly_payment: 2500,
    minPayment: 2500,
    due_day: 15,
    dueDate: "15 ของทุกเดือน",
    entry_method: "manual",
    isScanned: false,
    updated_at: 0
  },
  {
    id: "debt-2",
    user_id: "user1",
    bank_name: "ธนาคารไทยพาณิชย์ (SCB)",
    creditor: "ธนาคารไทยพาณิชย์ (SCB)",
    lender: "ธนาคารไทยพาณิชย์",
    debt_name: "สินเชื่อส่วนบุคคล SCB Speedy",
    name: "สินเชื่อส่วนบุคคล SCB Speedy",
    debt_type: "สินเชื่อส่วนบุคคล",
    category: "personal_loan",
    current_balance: 85000,
    balance: 85000,
    interest_rate_percent: 24.5,
    interestRate: 24.5,
    min_monthly_payment: 3800,
    minPayment: 3800,
    due_day: 28,
    dueDate: "28 ของทุกเดือน",
    entry_method: "manual",
    isScanned: false,
    updated_at: 0
  }
];

function readDebts() {
  try {
    if (!fs.existsSync(DEBTS_FILE)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
      fs.writeFileSync(DEBTS_FILE, JSON.stringify(DEBT_SEED, null, 2), 'utf8');
      return [...DEBT_SEED];
    }
    const parsed = JSON.parse(fs.readFileSync(DEBTS_FILE, 'utf8'));
    return Array.isArray(parsed) ? parsed : [...DEBT_SEED];
  } catch (err) {
    console.error('[server] Failed to read debts DB:', err.message);
    return [...DEBT_SEED];
  }
}

function writeDebts(debts) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const tmpFile = DEBTS_FILE + '.tmp';
  fs.writeFileSync(tmpFile, JSON.stringify(debts, null, 2), 'utf8');
  fs.renameSync(tmpFile, DEBTS_FILE);
}

function normalizeDebt(input) {
  const bank = String(input.bank_name || input.creditor || input.lender || 'อื่นๆ').trim();
  const name = String(input.debt_name || input.name || `รายการหนี้ ${bank}`).trim();
  const type = String(input.debt_type || input.category || 'บัตรเครดิต').trim();
  const balance = Number(input.current_balance ?? input.balance ?? 0);
  const rate = Number(input.interest_rate_percent ?? input.interestRate ?? 0);
  const minPay = Number(input.min_monthly_payment ?? input.minPayment ?? 0);
  const dueDay = parseInt(input.due_day || (input.dueDate ? (String(input.dueDate).match(/\d+/)||[15])[0] : 15), 10);

  return {
    id: String(input.id || `debt-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`),
    user_id: String(input.user_id || 'user1').trim(),
    bank_name: bank,
    creditor: bank,
    lender: bank,
    debt_name: name,
    name: name,
    debt_type: type,
    category: type === 'บัตรเครดิต' ? 'credit_card' : type === 'สินเชื่อส่วนบุคคล' ? 'personal_loan' : type === 'สินเชื่อบ้าน' ? 'mortgage' : type === 'สินเชื่อรถยนต์' ? 'auto_loan' : 'other',
    current_balance: balance,
    balance: balance,
    interest_rate_percent: rate,
    interestRate: rate,
    min_monthly_payment: minPay,
    minPayment: minPay,
    due_day: dueDay,
    dueDate: `${dueDay} ของทุกเดือน`,
    entry_method: String(input.entry_method || 'manual').trim(),
    isScanned: Boolean(input.isScanned),
    updated_at: Date.now()
  };
}

/* ---------------- Banner image upload (server-side file storage) ---------------- */
// Storing raw base64 data URLs inside promotions.json bloats the DB file and
// slows every read/write. Instead the admin form uploads the banner once and
// stores a short public URL (/uploads/promo-xxx.png) in promo_image_url.
const MIME_TO_EXT = {
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif'
};

/**
 * Persist a base64 (or data URL) image into server/data/uploads.
 * @param {string} base64Data - Raw base64 or "data:image/png;base64,..." string
 * @param {string} [mimeType] - Optional mime type hint (data URL takes precedence)
 * @returns {string} Public URL path e.g. "/uploads/promo-1712345-a1b2c.png"
 */
function saveUploadedImage(base64Data, mimeType = 'image/jpeg') {
  let raw = String(base64Data || '');
  let type = mimeType;
  if (raw.startsWith('data:')) {
    const m = raw.match(/^data:([^;,]+)[^,]*,(.*)$/);
    if (!m) throw Object.assign(new Error('Invalid image data URL'), { status: 400 });
    type = m[1] || type;
    raw = m[2];
  }
  if (!raw) throw Object.assign(new Error('No image data provided'), { status: 400 });

  const ext = MIME_TO_EXT[type] || (type && type.startsWith('image/') ? 'png' : 'jpg');
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
  const fileName = `promo-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  fs.writeFileSync(path.join(UPLOADS_DIR, fileName), Buffer.from(raw, 'base64'));
  return `/uploads/${fileName}`;
}

/** Serve an uploaded banner image from server/data/uploads (dev + prod single process). */
function serveUploadedImage(req, res, urlPath) {
  // Strip the /uploads/ prefix BEFORE normalizing (path.normalize converts
  // slashes to backslashes on Windows, which would break a prefix regex).
  const relative = decodeURIComponent(urlPath).replace(/^\/uploads\//, '');
  const safePath = path.normalize(relative).replace(/^(\.\.[/\\])+/, '');
  const filePath = path.join(UPLOADS_DIR, safePath);
  if (!filePath.startsWith(UPLOADS_DIR) || !fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Uploaded image not found');
    return;
  }
  const ext = path.extname(filePath).toLowerCase();
  res.writeHead(200, {
    'Content-Type': MIME_TYPES[ext] || 'application/octet-stream',
    'Cache-Control': 'public, max-age=86400'
  });
  fs.createReadStream(filePath).pipe(res);
}

const PROMO_FIELDS = [
  'bank_name', 'product_name', 'property_types', 'min_income', 'customer_type',
  'target_loan_amount', 'min_loan_tier', 'min_loan_amount', 'max_loan_amount', 'max_ltv_percent',
  'avg_3yr_rate', 'year_1_rate', 'year_2_3_rate', 'after_year_3_rate',
  'is_mrta', 'is_free_mortgage_fee', 'fee_waivers', 'variants', 'rate_matrix',
  'promo_image_url', 'bank_ref_link'
];

/**
 * Normalize one rate_matrix[] row (one condition set from the bank's table).
 * Mirrors src/types/rateMatrix.js — the server stays zero-dependency, so the
 * shape contract is duplicated here on purpose.
 * Fields: customer_group, min_income, property_types, is_mrta, is_free_mortgage,
 * fee_waivers, year_1_rate, year_2_3_rate, after_year_3_rate, avg_3yr_rate, eir, style.
 */
function normalizeRateMatrixRow(input, index = 0) {
  const raw = input && typeof input === 'object' ? input : {};
  const asString = (v) => (v === null || v === undefined ? '' : String(v).trim());
  const asArray = (v) => (Array.isArray(v)
    ? v.map(x => String(x || '').trim()).filter(Boolean)
    : (asString(v) ? asString(v).split(/[,\n]/).map(s => s.trim()).filter(Boolean) : []));
  const asNumber = (v) => {
    const n = Number(String(v ?? '').replace(/[^\d.-]/g, ''));
    return Number.isFinite(n) ? n : 0;
  };
  // "ทำประกันชีวิต" -> true, "ไม่ทำ" -> false
  const asMrta = (v) => {
    if (typeof v === 'boolean') return v;
    const s = asString(v).toLowerCase();
    if (!s) return false;
    if (/ไม่ทำ|ไม่มี|no mrta|without mrta/.test(s)) return false;
    if (/ทำประกัน|mrta|mlta/.test(s)) return true;
    return false;
  };
  const asFreeMortgage = (v) => {
    if (typeof v === 'boolean') return v;
    const s = asString(v).toLowerCase();
    if (!s || s === '-' || s === 'null') return false;
    if (/ไม่ฟรี|ไม่ยกเว้น|not free|no free/.test(s)) return false;
    return /(ฟรี|free|waive|ยกเว้น)/.test(s);
  };

  const row = {
    id: asString(raw.id) || undefined,
    customer_group: asString(raw.customer_group) || 'ทุกประเภท',
    min_income: asNumber(raw.min_income),
    property_types: asArray(raw.property_types),
    is_mrta: asMrta(raw.is_mrta ?? raw.mrta ?? raw.require_mrta),
    is_free_mortgage: asFreeMortgage(raw.is_free_mortgage ?? raw.is_free_mortgage_fee ?? raw.free_mortgage),
    fee_waivers: asArray(raw.fee_waivers),
    year_1_rate: asString(raw.year_1_rate),
    year_2_3_rate: asString(raw.year_2_3_rate),
    after_year_3_rate: asString(raw.after_year_3_rate),
    avg_3yr_rate: asNumber(raw.avg_3yr_rate),
    eir: asNumber(raw.eir),
    style: asNumber(raw.style) || (index + 1)
  };
  if (!row.fee_waivers.length && row.is_free_mortgage) row.fee_waivers = ['จดจำนอง'];
  if (!row.avg_3yr_rate) {
    const y1 = Number(String(row.year_1_rate).replace(/[^\d.]/g, '')) || 0;
    const y23 = Number(String(row.year_2_3_rate).replace(/[^\d.]/g, '')) || y1;
    row.avg_3yr_rate = (y1 > 0 && y23 > 0) ? Number(((y1 + y23 * 2) / 3).toFixed(2)) : (y1 || y23);
  }
  if (!row.id) row.id = `rm-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}-${index}`;
  return row;
}

/** Normalize a whole rate_matrix payload (array | single row | null) into rows. */
function normalizeRateMatrix(matrix) {
  if (!matrix) return [];
  const list = Array.isArray(matrix) ? matrix : [matrix];
  return list
    .filter(r => r && typeof r === 'object')
    .map((r, i) => normalizeRateMatrixRow(r, i));
}

/** Canonical property types (Thai) used by the matching engine + admin UI. */
export const PROPERTY_TYPES = ['บ้านเดี่ยว', 'ทาวน์เฮาส์', 'คอนโด', 'อาคารพาณิชย์', 'ที่ดินพร้อมสิ่งปลูกสร้าง'];

/** Canonical fee-waiver labels (Thai) matching the fee categories in the calculator. */
export const FEE_WAIVER_TYPES = ['ประเมินราคา', 'จดจำนอง', 'อากรแสตมป์'];

/** Canonical customer types for strict matching. */
export const CUSTOMER_TYPES = ['พนักงานประจำ', 'เจ้าของกิจการ', 'ฟรีแลนซ์', 'ข้าราชการ', 'ผู้รับบำนาญ', 'ทุกประเภท'];

/** Normalize one variants[] entry (style 1-4 with MRTA condition + rate ladder). */
function normalizeVariant(input, index) {
  const v = input || {};
  return {
    style: Number(v.style) || (index + 1),                  // 1-4
    style_name: String(v.style_name || `ทางเลือกที่ ${Number(v.style) || index + 1}`),
    is_mrta: Boolean(v.is_mrta),                            // MRTA condition for this variant
    year_1_rate: String(v.year_1_rate || ''),
    year_2_3_rate: String(v.year_2_3_rate || ''),
    after_year_3_rate: String(v.after_year_3_rate || ''),
    mrr_formula: String(v.mrr_formula || ''),               // e.g. "MRR - 2.15%"
    eir: Number(v.eir) || 0                                 // Effective Interest Rate (%)
  };
}

/** Coerce an incoming string/array field into a clean array of non-empty strings. */
function toArrayOfStrings(value) {
  if (Array.isArray(value)) return value.map(v => String(v || '').trim()).filter(Boolean);
  if (typeof value === 'string' && value.trim()) {
    // Accept comma/newline-separated input ("บ้านเดี่ยว, คอนโด")
    return value.split(/[,\n]/).map(s => s.trim()).filter(Boolean);
  }
  return [];
}

/** Normalize incoming promotion payload so the DB always stores a complete, typed record. */
function normalizePromotion(input, existingId) {
  const id = String(input.id || existingId || `promo-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`);
  const variants = Array.isArray(input.variants)
    ? input.variants.map((v, i) => normalizeVariant(v, i))
    : [];
  // rate_matrix: explicit condition rows (income / MRTA / fee waivers / rates)
  const rateMatrix = normalizeRateMatrix(input.rate_matrix);
  // fee_waivers: free-form Thai labels, seeded from the canonical list
  const feeWaivers = toArrayOfStrings(input.fee_waivers);
  // Derive is_free_mortgage_fee from fee_waivers when present (keeps both views consistent)
  const freeMortgageFee = feeWaivers.includes('จดจำนอง') || Boolean(input.is_free_mortgage_fee);
  return {
    id,
    bank_name: String(input.bank_name || '').trim(),
    product_name: String(input.product_name || '').trim(),
    property_types: toArrayOfStrings(input.property_types),   // ['บ้านเดี่ยว', 'คอนโด', ...]
    min_income: Number(input.min_income) || 0,
    customer_type: String(input.customer_type || 'ทุกประเภท').trim(),
    target_loan_amount: Number(input.target_loan_amount) || 0, // 0 = any loan amount
    min_loan_tier: Number(input.min_loan_tier) || 0,           // e.g. 3000000 vs 0 (tier >= 3M)
    min_loan_amount: Number(input.min_loan_amount) || 0,       // strict loan range floor (0 = none)
    max_loan_amount: Number(input.max_loan_amount) || 0,       // strict loan range cap (0 = none)
    max_ltv_percent: Number(input.max_ltv_percent) || 0,       // 0 = not specified
    avg_3yr_rate: Number(input.avg_3yr_rate) || 0,
    year_1_rate: String(input.year_1_rate || ''),
    year_2_3_rate: String(input.year_2_3_rate || ''),
    after_year_3_rate: String(input.after_year_3_rate || ''),
    is_mrta: Boolean(input.is_mrta),
    is_free_mortgage_fee: freeMortgageFee,
    fee_waivers: feeWaivers,                                   // ['ประเมินราคา', 'จดจำนอง', 'อากรแสตมป์']
    variants,                                                  // style 1-4, MRTA flags, MRR formula, EIR
    rate_matrix: rateMatrix,                                   // detailed condition rows (income/MRTA/fees per row)
    promo_image_url: String(input.promo_image_url || ''),
    bank_ref_link: String(input.bank_ref_link || ''),
    updated_at: Date.now()
  };
}

/* ---------------- Gemini Vision (server-side) ---------------- */
function getGeminiApiKey() {
  return process.env.GEMINI_API_KEY || process.env.VITE_GEMINI_API_KEY || '';
}

const PROMO_ANALYSIS_PROMPT = `
คุณคือ AI ผู้เชี่ยวชาญด้านการวิเคราะห์โปรโมชันสินเชื่อบ้านและดอกเบี้ยรีไฟแนนซ์ (Refinance Interest Rate Banner Analyzer)
Extract the interest rate table from the provided image into a strictly structured JSON array of rows (rate_matrix). Pay close attention to column headers and merged cells that indicate conditions. For every single rate option, you MUST explicitly extract its specific conditions: Does it require MRTA? Does it offer a free mortgage fee? What is the income range? Map these into is_mrta, is_free_mortgage, min_income, and the respective interest rate periods (Year 1, Year 2-3, Avg 3 Yr).
โปรดอ่านและสกัดข้อมูลจากรูปภาพแบนเนอร์โปรโมชันดอกเบี้ยนี้อย่างแม่นยำ แล้วตอบกลับเป็น JSON ภาษาไทยตามโครงสร้างนี้เท่านั้น:

แบนเนอร์อาจเป็น "ตารางหลายเงื่อนไข" แบ่งตามรายได้ ชนิดของหลักประกัน ประเภทลูกค้า การทำประกันชีวิต (MRTA/MLTA)
การยกเว้นค่าธรรมเนียม (ฟรีค่าจดจำนอง) และขนาดวงเงินกู้ — ทุกแถวของตารางต้องกลายเป็น 1 object ใน rate_matrix

โครงสร้าง JSON ที่ต้องการ:
{
  "bank_name": "ชื่อธนาคารเต็มภาษาไทย (เช่น ธนาคารกรุงไทย, ธนาคารกรุงศรีอยุธยา, ธนาคารกสิกรไทย)",
  "product_name": "ชื่อแพ็กเกจ/โปรโมชันสินเชื่อบ้านรีไฟแนนซ์ที่ปรากฏในรูป",
  "property_types": ["บ้านเดี่ยว", "คอนโด"],  // ประเภทหลักประกันที่รับ: เลือกจาก บ้านเดี่ยว / ทาวน์เฮาส์ / คอนโด / อาคารพาณิชย์ / ที่ดินพร้อมสิ่งปลูกสร้าง (array ว่าง [] หากไม่ระบุ)
  "min_income": 15000,            // รายได้ขั้นต่ำ/เดือน (Number) — 0 หากไม่พบ
  "customer_type": "พนักงานประจำ",  // ประเภทลูกค้าที่รับ: พนักงานประจำ / เจ้าของกิจการ / ฟรีแลนซ์ / ข้าราชการ / ผู้รับบำนาญ / ทุกประเภท
  "target_loan_amount": 3000000,  // วงเงินกู้ที่ตารางนี้ใช้ (Number, บาท) — 0 หากระบุไม่ชัดเจน
  "min_loan_tier": 3000000,       // ขั้นต่ำวงเงินของเงื่อนไขนี้ (Number, บาท): 3000000 สำหรับ "3 ล้านขึ้นไป", 0 สำหรับ "ต่ำกว่า 3 ล้าน"
  "min_loan_amount": 3000000,     // วงเงินกู้ขั้นต่ำ (Number, บาท) — 0 หากไม่กำหนด
  "max_loan_amount": 0,           // วงเงินกู้สูงสุด (Number, บาท) — 0 หากไม่กำหนด (ไม่จำกัด)
  "max_ltv_percent": 85,          // LTV สูงสุด (Number, %) เช่น 85, 90, 95 — 0 หากไม่พบ
  "avg_3yr_rate": 2.49,           // ดอกเบี้ยเฉลี่ย 3 ปีแรกของ "แถวที่ดีที่สุด" ใน rate_matrix (Number, %) — 0 หากไม่พบ
  "year_1_rate": "1.49%",         // ของแถวที่ดีที่สุด
  "year_2_3_rate": "2.49%",       // ของแถวที่ดีที่สุด
  "after_year_3_rate": "MRR - 2.00%",
  "is_mrta": true,                // แถวที่ดีที่สุดต้องทำ MRTA หรือไม่ (boolean)
  "fee_waivers": ["จดจำนอง", "ประเมินราคา"],  // ค่าธรรมเนียมที่ธนาคารฟรีให้: เลือกจาก ประเมินราคา / จดจำนอง / อากรแสตมป์ (array ว่าง [] หากไม่มี)
  "rate_matrix": [                // แต่ละ object = 1 แถว/เงื่อนไขจากตารางของธนาคาร (บังคับ: อย่างน้อย 1 แถว)
    {
      "customer_group": "พนักงานประจำ",      // กลุ่มลูกค้าของแถวนี้: พนักงานประจำ / เจ้าของกิจการ / ฟรีแลนซ์ / ข้าราชการ / ผู้รับบำนาญ / ทุกประเภท
      "min_income": 15000,                  // รายได้ขั้นต่ำของแถวนี้ (Number, บาท/เดือน) — 0 หากแถวนี้ไม่กำหนดรายได้
      "property_types": ["บ้านเดี่ยว"],      // ประเภทหลักประกันเฉพาะแถวนี้ ([] หากรับทุกประเภท)
      "is_mrta": true,                      // แถวนี้ต้องทำประกันชีวิต MRTA/MLTA หรือไม่ (boolean): เซลล์ "ทำประกันชีวิต/มี MRTA" = true, "ไม่ทำ" = false
      "is_free_mortgage": true,             // แถวนี้ฟรีค่าจดจำนองหรือไม่ (boolean): เซลล์ "ฟรีค่าจดจำนอง/Free mortgage fee" = true, "ไม่ฟรี/-" = false
      "fee_waivers": ["จดจำนอง"],           // ค่าธรรมเนียมที่แถวนี้ฟรี: ประเมินราคา / จดจำนอง / อากรแสตมป์ ([] หากไม่มี)
      "year_1_rate": "1.49%",               // ดอกเบี้ยปีที่ 1 ของแถวนี้ (คงสูตรเดิม เช่น "MRR - 2.00%" หากลอยตัว)
      "year_2_3_rate": "2.49%",             // ดอกเบี้ยปีที่ 2-3 ของแถวนี้
      "after_year_3_rate": "MRR - 2.00%",   // ดอกเบี้ยหลังปีที่ 3 ของแถวนี้ (ถ้ามี)
      "avg_3yr_rate": 2.16,                 // ดอกเบี้ยเฉลี่ย 3 ปีของแถวนี้ (Number, %) — 0 หากไม่พบ (ระบบจะคำนวณ (ปี1 + ปี2-3×2)/3 ให้เอง)
      "eir": 2.61                           // EIR ของแถวนี้ (Number, %) — 0 หากไม่พบ
    }
  ],
  "variants": [                   // (เสริม) ทางเลือกแบบสไตล์ 1-4 หากแบนเนอร์จัดกลุ่มเป็น "ทางเลือกที่ 1-4" — ระบุเฉพาะเมื่อพบ
    {
      "style": 1,
      "style_name": "ทางเลือกที่ 1 (MRTA)",
      "is_mrta": true,
      "year_1_rate": "1.49%",
      "year_2_3_rate": "2.49%",
      "after_year_3_rate": "MRR - 2.00%",
      "mrr_formula": "MRR - 2.00%",
      "eir": 2.61
    }
  ],
  "bank_ref_link": "URL เว็บไซต์ธนาคารในแบนเนอร์ (หากไม่มีให้ระบุ null หรือ string ว่าง)"
}

หมายเหตุ:
- rate_matrix คือหัวใจของการสกัด: ทุกแถว/ทุกช่องดอกเบี้ยในตารางของแบนเนอร์ต้องกลายเป็น 1 object พร้อมเงื่อนไขครบ (รายได้, MRTA, ค่าจดจำนอง, ดอกเบี้ยแต่ละช่วงปี) — ห้ามยุบหลายแถวเป็นแถวเดียว
- เซลล์เงื่อนไขที่เขียน "ทำประกันชีวิต / มี MRTA" → is_mrta: true, เขียน "ไม่ทำ / ไม่มี" → is_mrta: false
- เซลล์ "ฟรีค่าจดจำนอง / Free mortgage fee" → is_free_mortgage: true, "-" หรือไม่ระบุ → is_free_mortgage: false
- ถ้าแบนเนอร์มีทั้งเงื่อนไข ">=3M" และ "<3M" ในรูปเดียว: ให้เลือกเงื่อนไขที่ "โดดเด่นที่สุด/เป็นหลักของรูป" มาเติมในฟิลด์หลัก (min_loan_tier, min_loan_amount, max_loan_amount, rate_matrix)
- rate_matrix ต้องครอบคลุมทุกแถวที่อ่านได้ในเงื่อนไขนั้น (มักเป็น 4 แถว: 2 แถวมี MRTA, 2 แถวไม่มี MRTA)
- ฟิลด์ min_income, target_loan_amount, min_loan_tier, min_loan_amount, max_loan_amount, max_ltv_percent, avg_3yr_rate, eir ต้องเป็น Number หากไม่พบข้อมูลให้ใช้ 0
- property_types และ fee_waivers ต้องเป็น array ของ string ตามรายการที่กำหนดเท่านั้น ห้ามแต่งคำใหม่
- ถ้าแบนเนอร์ไม่ใช่ตารางหลายเงื่อนไข (มีดอกเบี้ยเดียว) ให้ใส่ rate_matrix เป็น array ที่มี 1 แถวเดียวสรุปเงื่อนไขนั้น
`.trim();

/** Strip markdown fences / inline comments then parse the first JSON object found. */
function parseGeminiJson(text) {
  let clean = String(text || '')
    .replace(/```json/gi, '')
    .replace(/```/g, '')
    .trim();
  clean = clean.replace(/^\s*\/\/.*$/gm, '');
  const match = clean.match(/\{[\s\S]*\}/);
  const raw = match ? match[0] : clean;
  return JSON.parse(raw);
}

function normalizeAnalyzedData(parsed) {
  const str = (v) => (v && v !== 'null' ? String(v).trim() : '');
  const variants = Array.isArray(parsed.variants)
    ? parsed.variants.map((v, i) => ({
        style: Number(v?.style) || (i + 1),
        style_name: str(v?.style_name) || `ทางเลือกที่ ${Number(v?.style) || i + 1}`,
        is_mrta: Boolean(v?.is_mrta),
        year_1_rate: str(v?.year_1_rate),
        year_2_3_rate: str(v?.year_2_3_rate),
        after_year_3_rate: str(v?.after_year_3_rate),
        mrr_formula: str(v?.mrr_formula),
        eir: Number(v?.eir) || 0
      }))
    : [];
  // Normalize property_types / fee_waivers against the canonical Thai lists so
  // AI output like "home" or "home loan" still lands on exact DB values.
  const PROPERTY_CANON = ['บ้านเดี่ยว', 'ทาวน์เฮาส์', 'คอนโด', 'อาคารพาณิชย์', 'ที่ดินพร้อมสิ่งปลูกสร้าง'];
  const FEE_CANON = ['ประเมินราคา', 'จดจำนอง', 'อากรแสตมป์'];
  const PROPERTY_ALIASES = {
    'บ้านเดี่ยว': ['บ้านเดี่ยว', 'single house', 'single-house', 'house', 'detached'],
    'ทาวน์เฮาส์': ['ทาวน์เฮาส์', 'ทาวน์โฮม', 'townhouse', 'town home'],
    'คอนโด': ['คอนโด', 'คอนโดมิเนียม', 'condo', 'condominium'],
    'อาคารพาณิชย์': ['อาคารพาณิชย์', 'ตึกแถว', 'commercial building', 'shophouse'],
    'ที่ดินพร้อมสิ่งปลูกสร้าง': ['ที่ดินพร้อมสิ่งปลูกสร้าง', 'land and building', 'land with house']
  };
  const FEE_ALIASES = {
    'ประเมินราคา': ['ประเมินราคา', 'ค่าประเมิน', 'appraisal', 'valuation'],
    'จดจำนอง': ['จดจำนอง', 'ค่าจดจำนอง', 'mortgage registration', 'mortgage'],
    'อากรแสตมป์': ['อากรแสตมป์', 'อากรณ์แสตมป์', 'stamp duty', 'duty stamp']
  };
  const canonMatch = (raw, canonMap) => {
    const lower = String(raw || '').toLowerCase().trim();
    if (!lower) return null;
    for (const [canonical, aliases] of Object.entries(canonMap)) {
      if (aliases.some(a => lower === a || lower.includes(a))) return canonical;
    }
    return null;
  };
  const rawProps = Array.isArray(parsed.property_types)
    ? parsed.property_types
    : String(parsed.property_types || '').split(/[,\n]/);
  const propertyTypes = [...new Set(rawProps.map(p => canonMatch(p, PROPERTY_ALIASES)).filter(Boolean))];
  const rawFees = Array.isArray(parsed.fee_waivers)
    ? parsed.fee_waivers
    : String(parsed.fee_waivers || '').split(/[,\n]/);
  const feeWaivers = [...new Set(rawFees.map(f => canonMatch(f, FEE_ALIASES)).filter(Boolean))];

  return {
    rate_matrix: normalizeRateMatrix(parsed.rate_matrix),
    bank_name: str(parsed.bank_name) || 'ไม่ระบุธนาคาร',
    product_name: str(parsed.product_name) || 'โปรโมชันสินเชื่อบ้านรีไฟแนนซ์',
    property_types: propertyTypes,
    min_income: Number(parsed.min_income) || 0,
    customer_type: str(parsed.customer_type) || 'ทุกประเภท',
    target_loan_amount: Number(parsed.target_loan_amount) || 0,
    min_loan_tier: Number(parsed.min_loan_tier) || 0,
    min_loan_amount: Number(parsed.min_loan_amount) || 0,
    max_loan_amount: Number(parsed.max_loan_amount) || 0,
    max_ltv_percent: Number(parsed.max_ltv_percent) || 0,
    avg_3yr_rate: Number(parsed.avg_3yr_rate) || 0,
    year_1_rate: str(parsed.year_1_rate),
    year_2_3_rate: str(parsed.year_2_3_rate),
    after_year_3_rate: str(parsed.after_year_3_rate),
    is_mrta: Boolean(parsed.is_mrta),
    is_free_mortgage_fee: feeWaivers.includes('จดจำนอง') || Boolean(parsed.is_free_mortgage_fee),
    fee_waivers: feeWaivers,
    variants,
    bank_ref_link: str(parsed.bank_ref_link)
  };
}

async function downloadImageAsBase64(imageUrl) {
  const res = await fetch(imageUrl);
  if (!res.ok) throw new Error(`Cannot download image from URL (HTTP ${res.status})`);
  const buffer = Buffer.from(await res.arrayBuffer());
  const contentType = res.headers.get('content-type') || 'image/jpeg';
  return { base64: buffer.toString('base64'), mime_type: contentType.split(';')[0] };
}

async function analyzeWithGeminiVision(body) {
  const apiKey = getGeminiApiKey();
  if (!apiKey) {
    throw Object.assign(new Error('GEMINI_API_KEY is not configured on the server. Set it in the .env file.'), { status: 503 });
  }

  // Accept both { image_base64 } (frontend) and { base64 } shapes
  let { image_base64: base64, image_url: imageUrl, mime_type: mimeType } = body || {};
  if (!base64 && imageUrl) {
    ({ base64, mime_type: mimeType } = await downloadImageAsBase64(imageUrl));
  }
  if (!base64) throw Object.assign(new Error('No image provided (send image_base64 or image_url)'), { status: 400 });
  // Data URL support: accept "data:image/png;base64,...."
  if (typeof base64 === 'string' && base64.startsWith('data:')) {
    const m = base64.match(/^data:([^;,]+)[^,]*,(.*)$/);
    if (!m) throw Object.assign(new Error('Invalid image data URL'), { status: 400 });
    mimeType = mimeType || m[1] || 'image/jpeg';
    base64 = m[2];
  }

  // Use gemini-3.6-flash (Flash) as the primary model. The 1.5 series is
  // deprecated and returns 404 — gemini-3.6-flash is the current active endpoint.
  const primaryModel = process.env.GEMINI_MODEL || 'gemini-3.6-flash';
  const fallbackModel = 'gemini-3.6-flash';

  const makePayload = () => JSON.stringify({
    contents: [{
      parts: [
        { text: PROMO_ANALYSIS_PROMPT },
        { inline_data: { mime_type: mimeType || 'image/jpeg', data: base64 } }
      ]
    }],
    generationConfig: { temperature: 0.1, responseMimeType: 'application/json' }
  });

  const sendRequest = async (modelName) => {
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${encodeURIComponent(apiKey)}`;
    return await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: makePayload(),
      signal: AbortSignal.timeout(90000)
    });
  };

  const isHighDemandOrRateLimit = (status, text) => {
    if (status === 503 || status === 429) return true;
    if (text && /503|429|high demand|rate limit|resource_exhausted|overloaded|unavailable|too many requests/i.test(text)) return true;
    return false;
  };

  let res;
  let lastError = null;

  try {
    res = await sendRequest(primaryModel);
  } catch (err) {
    lastError = err;
  }

  let data = res ? await res.json().catch(() => null) : null;
  let textContent = data ? JSON.stringify(data) : (lastError ? lastError.message : '');

  // If primary model returned 503 / 429 High Demand / Rate limit or failed, retry once with the Flash model
  if (!res || !res.ok || isHighDemandOrRateLimit(res?.status, textContent)) {
    if (!res || isHighDemandOrRateLimit(res?.status, textContent) || (lastError && isHighDemandOrRateLimit(0, lastError.message))) {
      console.warn(`[server] Primary model (${primaryModel}) high demand/error (${res?.status || lastError?.message}). Falling back to ${fallbackModel}...`);
      try {
        const fallbackRes = await sendRequest(fallbackModel);
        const fallbackData = await fallbackRes.json().catch(() => null);
        if (fallbackRes.ok && fallbackData) {
          res = fallbackRes;
          data = fallbackData;
          lastError = null;
        } else if (fallbackRes) {
          res = fallbackRes;
          data = fallbackData;
        }
      } catch (fallbackErr) {
        console.warn(`[server] Fallback model (${fallbackModel}) error:`, fallbackErr.message);
        if (!res) lastError = fallbackErr;
      }
    }
  }

  if (lastError && !res) {
    const message = lastError.name === 'TimeoutError' || lastError.name === 'AbortError'
      ? 'Gemini Vision request timed out after 90s'
      : `Gemini Vision network error: ${lastError.message}`;
    throw Object.assign(new Error(message), { status: 504 });
  }

  if (!res.ok) {
    const message = data?.error?.message || `Gemini API HTTP ${res.status}`;
    const highDemand = isHighDemandOrRateLimit(res.status, message);
    const statusCode = highDemand ? 503 : 502;
    throw Object.assign(new Error(`Gemini Vision error: ${message}`), { status: statusCode });
  }

  const text = data?.candidates?.[0]?.content?.parts?.map(p => p.text).filter(Boolean).join('') || '';
  if (!text) throw new Error('Gemini Vision returned an empty response');
  return normalizeAnalyzedData(parseGeminiJson(text));
}

/* ---------------- HTTP plumbing ---------------- */
function setCors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

/**
 * Write a JSON response. Every API route answers through this helper so the
 * client can always call response.json() safely: never an empty body and never
 * a bare res.end(). Serialisation failures are downgraded to a JSON 500 instead
 * of producing a broken/empty response.
 */
function sendJson(res, status, payload) {
  let body;
  try {
    body = JSON.stringify(payload);
  } catch (err) {
    console.error('[server] Failed to serialise JSON response:', err.message);
    status = 500;
    body = JSON.stringify({ ok: false, error: 'Response could not be serialised to JSON' });
  }

  setCors(res);
  if (res.writableEnded || res.destroyed) return; // socket already finished/closed
  if (!res.headersSent) {
    res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  }
  res.end(body);
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        reject(Object.assign(new Error('Request body too large'), { status: 413 }));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      if (chunks.length === 0) return resolve({});
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
      } catch (err) {
        reject(Object.assign(new Error('Invalid JSON body'), { status: 400 }));
      }
    });
    req.on('error', reject);
  });
}

/* ---------------- Static file serving (dist/) ---------------- */
const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.webp': 'image/webp',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2'
};

function serveStatic(req, res, urlPath) {
  const safePath = path.normalize(decodeURIComponent(urlPath)).replace(/^(\.\.[/\\])+/, '');
  let filePath = path.join(DIST_DIR, safePath === '/' ? 'index.html' : safePath);
  if (!filePath.startsWith(DIST_DIR)) {
    res.writeHead(403); res.end('Forbidden'); return;
  }
  if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    filePath = path.join(DIST_DIR, 'index.html'); // SPA fallback
  }
  if (!fs.existsSync(filePath)) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('dist/ not found — run `npm run build` first, or use the Vite dev server.');
    return;
  }
  const ext = path.extname(filePath).toLowerCase();
  res.writeHead(200, { 'Content-Type': MIME_TYPES[ext] || 'application/octet-stream' });
  fs.createReadStream(filePath).pipe(res);
}

/* ---------------- Router ---------------- */
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const route = url.pathname;

  if (req.method === 'OPTIONS') {
    setCors(res);
    res.writeHead(204);
    res.end();
    return;
  }

  try {
    /* ---- Promotion CRUD ---- */
    if (route === '/api/admin/promotions' && req.method === 'GET') {
      const promotions = readDb()
        .slice()
        .sort((a, b) => (b.updated_at || 0) - (a.updated_at || 0));
      return sendJson(res, 200, { ok: true, promotions });
    }

    if (route === '/api/admin/promotions' && req.method === 'POST') {
      const body = await readJsonBody(req);
      if (!body.bank_name || !body.bank_name.trim()) {
        return sendJson(res, 400, { ok: false, error: 'bank_name is required' });
      }
      if (!body.product_name || !body.product_name.trim()) {
        return sendJson(res, 400, { ok: false, error: 'product_name is required' });
      }
      if (body.variants !== undefined && !Array.isArray(body.variants)) {
        return sendJson(res, 400, { ok: false, error: 'variants must be an array' });
      }
      if (body.property_types !== undefined && !Array.isArray(body.property_types) && typeof body.property_types !== 'string') {
        return sendJson(res, 400, { ok: false, error: 'property_types must be an array or comma-separated string' });
      }
      if (body.fee_waivers !== undefined && !Array.isArray(body.fee_waivers) && typeof body.fee_waivers !== 'string') {
        return sendJson(res, 400, { ok: false, error: 'fee_waivers must be an array or comma-separated string' });
      }

      const promotions = readDb();
      const normalized = normalizePromotion(body);
      const idx = promotions.findIndex(p => p.id === normalized.id);
      if (idx >= 0) {
        promotions[idx] = { ...promotions[idx], ...normalized }; // Update
      } else {
        promotions.unshift(normalized); // Create
      }
      writeDb(promotions);
      return sendJson(res, 200, { ok: true, promotion: normalized });
    }

    if (route === '/api/admin/promotions' && req.method === 'DELETE') {
      const id = url.searchParams.get('id');
      if (!id) return sendJson(res, 400, { ok: false, error: 'Missing ?id= parameter' });
      const promotions = readDb();
      const filtered = promotions.filter(p => p.id !== id);
      if (filtered.length === promotions.length) {
        return sendJson(res, 404, { ok: false, error: `Promotion ${id} not found` });
      }
      writeDb(filtered);
      return sendJson(res, 200, { ok: true, deletedId: id });
    }

    /* ---- Occupations master CRUD (admin-configurable master list) ---- */
    if (route === '/api/admin/occupations' && req.method === 'GET') {
      const occupations = readOccupations()
        .slice()
        .sort((a, b) => (a.label || '').localeCompare(b.label || '', 'th'));
      return sendJson(res, 200, { ok: true, occupations });
    }

    if (route === '/api/admin/occupations' && req.method === 'POST') {
      const body = await readJsonBody(req);
      if (!body.label || !String(body.label).trim()) {
        return sendJson(res, 400, { ok: false, error: 'label is required' });
      }
      const occupations = readOccupations();
      const normalized = normalizeOccupation(body);
      const idx = occupations.findIndex(o => o.id === normalized.id || (body.key && o.key === normalized.key && !body.id));
      if (idx >= 0) {
        occupations[idx] = { ...occupations[idx], ...normalized, id: occupations[idx].id };
      } else {
        occupations.push(normalized);
      }
      writeOccupations(occupations);
      return sendJson(res, 200, { ok: true, occupation: normalized });
    }

    if (route === '/api/admin/occupations' && req.method === 'DELETE') {
      const id = url.searchParams.get('id');
      if (!id) return sendJson(res, 400, { ok: false, error: 'Missing ?id= parameter' });
      const occupations = readOccupations();
      const filtered = occupations.filter(o => o.id !== id);
      if (filtered.length === occupations.length) {
        return sendJson(res, 404, { ok: false, error: `Occupation ${id} not found` });
      }
      writeOccupations(filtered);
      return sendJson(res, 200, { ok: true, deletedId: id });
    }

    /* ---- Auth & User Profiles Endpoints ---- */
    if (route === '/api/auth/signup' && req.method === 'POST') {
      const body = await readJsonBody(req);
      const username = String(body.username || '').trim();
      const password = String(body.password || '');
      const gender = String(body.gender || '').trim();
      const ageNum = Number(body.age);
      const occupation = String(body.occupation || '').trim();

      if (!username) {
        return sendJson(res, 400, { ok: false, error: 'กรุณากรอกชื่อผู้ใช้ (Username)' });
      }
      if (!password) {
        return sendJson(res, 400, { ok: false, error: 'กรุณากรอกรหัสผ่าน (Password)' });
      }
      if (!gender) {
        return sendJson(res, 400, { ok: false, error: 'กรุณาเลือกเพศ' });
      }
      if (isNaN(ageNum) || ageNum <= 0) {
        return sendJson(res, 400, { ok: false, error: 'อายุต้องมากกว่า 0' });
      }
      if (!occupation) {
        return sendJson(res, 400, { ok: false, error: 'กรุณาระบุอาชีพ' });
      }

      const users = readUsers();
      const existingUser = users.find(u => u.username.toLowerCase() === username.toLowerCase());
      if (existingUser) {
        return sendJson(res, 400, { ok: false, error: 'ชื่อผู้ใช้นี้ถูกใช้งานแล้ว' });
      }

      const newUserId = `usr_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
      const newUser = {
        id: newUserId,
        username,
        password,
        name: username,
        email: `${username}@neenoi.com`,
        role: 'user',
        created_at: Date.now()
      };

      const newProfile = {
        id: newUserId,
        user_id: newUserId,
        gender,
        age: ageNum,
        occupation,
        created_at: Date.now()
      };

      users.push(newUser);
      writeUsers(users);

      const profiles = readUserProfiles();
      profiles.push(newProfile);
      writeUserProfiles(profiles);

      return sendJson(res, 201, {
        ok: true,
        user: {
          id: newUser.id,
          username: newUser.username,
          name: newUser.name,
          email: newUser.email,
          role: newUser.role,
          profile: newProfile
        }
      });
    }

    if (route === '/api/auth/login' && req.method === 'POST') {
      const body = await readJsonBody(req);
      const username = String(body.username || '').trim();
      const password = String(body.password || '');

      if (!username || !password) {
        return sendJson(res, 400, { ok: false, error: 'กรุณากรอกชื่อผู้ใช้และรหัสผ่าน' });
      }

      const users = readUsers();
      const matchedUser = users.find(
        u => (u.username.toLowerCase() === username.toLowerCase() || (u.email && u.email.toLowerCase() === username.toLowerCase()))
          && u.password === password
      );

      if (!matchedUser) {
        return sendJson(res, 401, { ok: false, error: 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง' });
      }

      const profiles = readUserProfiles();
      const userProfile = profiles.find(p => p.user_id === matchedUser.id || p.id === matchedUser.id) || null;

      return sendJson(res, 200, {
        ok: true,
        user: {
          id: matchedUser.id,
          username: matchedUser.username,
          name: matchedUser.name || matchedUser.username,
          email: matchedUser.email || `${matchedUser.username}@neenoi.com`,
          role: matchedUser.role || 'user',
          profile: userProfile
        }
      });
    }

    if (route === '/api/user-profiles' && req.method === 'GET') {
      const userId = url.searchParams.get('user_id') || url.searchParams.get('id');
      const profiles = readUserProfiles();
      if (userId) {
        const found = profiles.find(p => p.user_id === userId || p.id === userId);
        if (!found) {
          return sendJson(res, 404, { ok: false, error: 'User profile not found' });
        }
        return sendJson(res, 200, { ok: true, profile: found });
      }
      return sendJson(res, 200, { ok: true, profiles });
    }

    /* ---- Debts CRUD & Text Parser ---- */
    if (route === '/api/debts' && req.method === 'GET') {
      const userId = url.searchParams.get('user_id');
      const allDebts = readDebts();
      const userDebts = (userId && userId !== 'all') ? allDebts.filter(d => d.user_id === userId) : allDebts;
      return sendJson(res, 200, { ok: true, debts: userDebts });
    }

    if (route === '/api/debts' && req.method === 'POST') {
      const body = await readJsonBody(req);
      const balanceNum = Number(body.current_balance ?? body.balance);
      const rateNum = Number(body.interest_rate_percent ?? body.interestRate);
      const minPayNum = Number(body.min_monthly_payment ?? body.minPayment);

      if (isNaN(balanceNum) || balanceNum <= 0) {
        return sendJson(res, 400, { ok: false, error: 'current_balance must be greater than 0' });
      }
      if (isNaN(rateNum) || rateNum < 0) {
        return sendJson(res, 400, { ok: false, error: 'interest_rate_percent cannot be negative' });
      }
      if (isNaN(minPayNum) || minPayNum <= 0) {
        return sendJson(res, 400, { ok: false, error: 'min_monthly_payment must be greater than 0' });
      }

      const debts = readDebts();
      const normalized = normalizeDebt(body);
      const idx = debts.findIndex(d => d.id === normalized.id);
      if (idx >= 0) {
        debts[idx] = { ...debts[idx], ...normalized };
      } else {
        debts.unshift(normalized);
      }
      writeDebts(debts);
      return sendJson(res, 200, { ok: true, debt: normalized });
    }

    if (route === '/api/debts' && req.method === 'DELETE') {
      const id = url.searchParams.get('id');
      if (!id) return sendJson(res, 400, { ok: false, error: 'Missing ?id= parameter' });
      const debts = readDebts();
      const filtered = debts.filter(d => d.id !== id);
      if (filtered.length === debts.length) {
        return sendJson(res, 404, { ok: false, error: `Debt ${id} not found` });
      }
      writeDebts(filtered);
      return sendJson(res, 200, { ok: true, deletedId: id });
    }

    if (route === '/api/debts/parse-text' && req.method === 'POST') {
      const body = await readJsonBody(req);
      const text = String(body.text || '').trim();
      if (!text) {
        return sendJson(res, 400, { ok: false, error: 'text is required' });
      }

      // Simple regex parser fallback for server
      let bank_name = 'อื่นๆ';
      if (/กสิกร|kbank/i.test(text)) bank_name = 'ธนาคารกสิกรไทย (KBank)';
      else if (/ไทยพาณิชย์|scb/i.test(text)) bank_name = 'ธนาคารไทยพาณิชย์ (SCB)';
      else if (/ktc|กรุงไทย/i.test(text)) bank_name = 'บัตรเครดิต KTC';
      else if (/กรุงศรี|krungsri/i.test(text)) bank_name = 'ธนาคารกรุงศรีอยุธยา (Krungsri)';
      else if (/กรุงเทพ|bbl/i.test(text)) bank_name = 'ธนาคารกรุงเทพ (BBL)';
      else if (/ทหารไทย|ธนชาต|ttb/i.test(text)) bank_name = 'ธนาคารทหารไทยธนชาต (ttb)';
      else if (/ออมสิน|gsb/i.test(text)) bank_name = 'ธนาคารออมสิน (GSB)';
      else if (/ธอส|อาคารสงเคราะห์|ghb/i.test(text)) bank_name = 'ธนาคารอาคารสงเคราะห์ (ธอส)';
      else if (/cimb/i.test(text)) bank_name = 'ธนาคารซีไอเอ็มบี ไทย (CIMBT)';
      else if (/ยูโอบี|uob/i.test(text)) bank_name = 'ธนาคารยูโอบี (UOB)';
      else if (/aeon|อิออน/i.test(text)) bank_name = 'อิออน (AEON)';
      else if (/first choice|เฟิร์สช้อยส์/i.test(text)) bank_name = 'เฟิร์สช้อยส์ (Krungsri First Choice)';
      else if (/central/i.test(text)) bank_name = 'เซ็นทรัล เดอะวัน (Central The 1)';

      let debt_type = 'บัตรเครดิต';
      if (/บ้าน|mortgage|home loan/i.test(text)) debt_type = 'สินเชื่อบ้าน';
      else if (/รถยนต์|รถ|auto loan|car loan/i.test(text)) debt_type = 'สินเชื่อรถยนต์';
      else if (/ส่วนบุคคล|personal loan|xpress loan|speedy/i.test(text)) debt_type = 'สินเชื่อส่วนบุคคล';

      let current_balance = 0;
      const bMatch = text.match(/(?:ยอดคงเหลือ|ยอดรวม|ยอดหนี้|ยอดชำระทั้งสิ้น|total balance|balance|amount due)[^\d]*([\d,]+(?:\.\d+)?)/i)
        || text.match(/([\d,]+(?:\.\d+)?)\s*(?:บาท|thb)/i);
      if (bMatch) current_balance = parseFloat(bMatch[1].replace(/,/g, '')) || 0;

      let min_monthly_payment = 0;
      const mMatch = text.match(/(?:ขั้นต่ำ|ยอดชำระขั้นต่ำ|ค่างวด|minimum|min payment)[^\d]*([\d,]+(?:\.\d+)?)/i);
      if (mMatch) min_monthly_payment = parseFloat(mMatch[1].replace(/,/g, '')) || 0;
      else if (current_balance > 0) min_monthly_payment = Math.round(current_balance * 0.05);

      let interest_rate_percent = 16.0;
      const rMatch = text.match(/(?:ดอกเบี้ย|อัตราดอกเบี้ย|interest rate)[^\d]*([\d]+(?:\.\d+)?)\s*%/i)
        || text.match(/([\d]+(?:\.\d+)?)\s*%\s*(?:ต่อปี|p\.a\.)?/i);
      if (rMatch) interest_rate_percent = parseFloat(rMatch[1]) || 16.0;

      let due_day = 15;
      const dMatch = text.match(/(?:ครบกำหนด|วันชำระ|due date|วันที่)[^\d]*(\d{1,2})/i);
      if (dMatch) {
        const day = parseInt(dMatch[1], 10);
        if (day >= 1 && day <= 31) due_day = day;
      }

      const shortBank = bank_name.split(' ')[0].replace('ธนาคาร', '');
      const debt_name = `${debt_type} ${shortBank}`;

      return sendJson(res, 200, {
        ok: true,
        debt: {
          bank_name,
          debt_name,
          debt_type,
          current_balance,
          interest_rate_percent,
          min_monthly_payment,
          due_day
        }
      });
    }

    /* ---- Gemini Vision analyze (alias: /extract-image per API spec) ---- */
    if ((route === '/api/admin/promotions/analyze' || route === '/api/admin/promotions/extract-image') && req.method === 'POST') {
      const body = await readJsonBody(req);
      const extracted = await analyzeWithGeminiVision(body);
      return sendJson(res, 200, { ok: true, promotion: extracted });
    }

    /* ---- Banner image upload: stores the file server-side and returns a short public URL ---- */
    if (route === '/api/admin/promotions/upload-image' && req.method === 'POST') {
      const body = await readJsonBody(req);
      const publicUrl = saveUploadedImage(body.image_base64 || body.image || body.base64, body.mime_type);
      return sendJson(res, 200, { ok: true, url: publicUrl });
    }

    /* ---- Uploaded banner images (server/data/uploads) ---- */
    if (req.method === 'GET' && route.startsWith('/uploads/')) {
      return serveUploadedImage(req, res, route);
    }

    /* ---- Health check ---- */
    if (route === '/api/health') {
      const hasKey = Boolean(getGeminiApiKey());
      return sendJson(res, 200, { ok: true, service: 'nee-noi-admin-api', geminiConfigured: hasKey });
    }

    /* ---- Static SPA ---- */
    if (req.method === 'GET' && !route.startsWith('/api/')) {
      return serveStatic(req, res, route);
    }

    return sendJson(res, 404, { ok: false, error: `No route: ${req.method} ${route}` });
  } catch (err) {
    console.error(`[server] ${req.method} ${route} failed:`, err.message);
    return sendJson(res, err.status || 500, { ok: false, error: err.message });
  } finally {
    // Safety net: an /api handler that returns without writing a body would
    // otherwise leave an empty response (clients then crash with
    // "Unexpected end of JSON input"). Always answer with JSON instead.
    if (route.startsWith('/api/') && !res.writableEnded && !res.headersSent) {
      sendJson(res, 500, { ok: false, error: `Empty response for ${req.method} ${route}` });
    }
  }
});

// Only auto-listen when executed directly (`npm run server` / `node server/index.js`).
// When imported (e.g. by tests) the module exports the server for manual control.
const isDirectRun = Boolean(process.argv[1]) &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;

if (isDirectRun) {
  server.listen(PORT, () => {
    console.log(`✅ Nee-Noi Admin API server running at http://localhost:${PORT}`);
    console.log(`   DB file: ${DB_FILE}`);
    console.log(`   Gemini Vision: ${getGeminiApiKey() ? 'configured ✅' : 'NOT configured (set GEMINI_API_KEY in .env) ⚠️'}`);
  });
}

export default server;
export { server, PROMOTION_SEED };
