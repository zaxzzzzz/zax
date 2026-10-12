/**
 * Walk-in Document Checklist Logic
 *
 * Returns the dynamic list of documents a user must prepare before walking
 * into a bank branch to submit a refinance application. The list depends on
 * the user's occupation type (salaried vs freelance vs business owner).
 *
 * Every item is a plain object:
 *   { id, label, description, category, required }
 * The UI renders a checkbox per item so the user can tick them off physically.
 */

/** Occupation keys — keep in sync with refinanceRates.json + RefinanceDashboard. */
export const OCCUPATIONS = ['salaried', 'government', 'freelance', 'business', 'pensioner', 'other'];

/** Thai labels for each occupation (used by UI + PDF cover sheet). */
export const OCCUPATION_LABELS = {
  salaried: 'พนักงานเงินเดือน (Salaried)',
  government: 'ข้าราชการ / พนักงานรัฐวิสาหกิจ (Government)',
  freelance: 'ฟรีแลนซ์ / อาชีพอิสระ (Freelance)',
  business: 'เจ้าของกิจการ / ธุรกิจ (Business Owner)',
  pensioner: 'ผู้รับบำนาญ / เกษียณอายุ (Pensioner)',
  other: 'อื่นๆ (ระบุ)'
};

/** Documents every applicant needs regardless of occupation. */
const COMMON_DOCS = [
  {
    id: 'id-card',
    label: 'บัตรประชาชนตัวจริง + สำเนา',
    description: 'บัตรประชาชนตัวจริงพร้อมสำเนาอย่างน้อย 2 ชุด เซ็นสำเนาถูกต้อง',
    category: 'identity',
    required: true
  },
  {
    id: 'house-registration',
    label: 'สำเนาทะเบียนบ้าน',
    description: 'สำเนาทะเบียนบ้านหน้าที่มีชื่อผู้ยื่นกู้ (และคู่สมรสถ้ามี)',
    category: 'identity',
    required: true
  },
  {
    id: 'title-deed',
    label: 'สำเนาโฉนด / เอกสารสิทธิ์ในทรัพย์',
    description: 'สำเนาโฉนดที่ดิน หรือเอกสารสิทธิ์ของหลักทรัพย์ที่นำมาค้ำประกัน',
    category: 'property',
    required: true
  },
  {
    id: 'marriage-consent',
    label: 'หนังสือยินยอมคู่สมรส (ถ้ามีคู่สมรส)',
    description: 'เฉพาะผู้มีคู่สมรสตามกฎหมาย ต้องมีลายเซ็นยินยอมให้กู้/จำนอง',
    category: 'property',
    required: false
  },
  {
    id: 'mrta-application',
    label: 'ใบสมัครประกัน MRTA (ถ้าทำประกัน)',
    description: 'กรอกข้อมูลสุขภาพและเลือกทุนประกันตามวงเงินกู้ หากต้องการใช้สิทธิ์ฟรีค่าจดจำนอง',
    category: 'insurance',
    required: false
  }
];

/** Extra documents for salaried employees. */
const SALARIED_DOCS = [
  {
    id: 'payslip-3m',
    label: 'สลิปเงินเดือนย้อนหลัง 3 เดือน',
    description: 'สลิปเงินเดือนล่าสุดติดต่อกัน 3 เดือน (ถ้าไม่มีสลิปใช้หนังสือรับรองเงินเดือนแทน)',
    category: 'income',
    required: true
  },
  {
    id: 'salary-certificate',
    label: 'หนังสือรับรองเงินเดือน / การจ้างงาน',
    description: 'ออกโดยฝ่ายบุคคลหรือนายจ้าง ระบุตำแหน่ง เงินเดือน และอายุงาน',
    category: 'income',
    required: true
  },
  {
    id: 'statement-6m',
    label: 'e-Statement ย้อนหลัง 6 เดือน',
    description: 'Statement บัญชีเงินเดือนย้อนหลัง 6 เดือน (ดาวน์โหลดจาก mobile banking ได้)',
    category: 'financial',
    required: true
  }
];

/** Extra documents for salaried workers in the government sector. */
const GOVERNMENT_DOCS = [
  {
    id: 'gov-payslip-3m',
    label: 'สลิปเงินเดือน / หนังสือรับรองเงินเดือน 3 เดือน',
    description: 'สลิปเงินเดือนย้อนหลัง 3 เดือน หรือหนังสือรับรองเงินเดือนจากหน่วยงานราชการ/รัฐวิสาหกิจ',
    category: 'income',
    required: true
  },
  {
    id: 'gov-id',
    label: 'บัตรประจำตัวข้าราชการ / พนักงานรัฐวิสาหกิจ',
    description: 'บัตรประจำตัวที่หน่วยงานออกให้ พร้อมสำเนา 1 ชุด (ถ้ามี)',
    category: 'identity',
    required: false
  },
  {
    id: 'gov-statement-6m',
    label: 'e-Statement ย้อนหลัง 6 เดือน',
    description: 'Statement บัญชีเงินเดือนย้อนหลัง 6 เดือน (ดาวน์โหลดจาก mobile banking ได้)',
    category: 'financial',
    required: true
  }
];

/** Extra documents for pensioners / retired. */
const PENSIONER_DOCS = [
  {
    id: 'pension-letter',
    label: 'หนังสือรับรองบำนาญ / Statement เงินบำนาญ',
    description: 'หนังสือรับรองการรับบำนาญจากหน่วยงาน หรือ Statement บัญชีที่เงินบำนาญเข้า ย้อนหลัง 12 เดือน',
    category: 'income',
    required: true
  },
  {
    id: 'pension-statement-12m',
    label: 'e-Statement ย้อนหลัง 12 เดือน',
    description: 'Statement บัญชีที่เงินบำนาญ/รายได้เข้าอย่างสม่ำเสมอ ย้อนหลัง 12 เดือน',
    category: 'financial',
    required: true
  },
  {
    id: 'pension-retirement-id',
    label: 'บัตรประจำตัวผู้เกษียณ / เอกสารยืนยันอายุ',
    description: 'บัตรประจำตัวผู้เกษียณหรือเอกสารยืนยันอายุ (ถ้ามี) เพื่อยืนยันสิทธิ์ตามเงื่อนไขธนาคาร',
    category: 'identity',
    required: false
  }
];

/** Extra documents for freelance / business owner. */
const FREELANCE_DOCS = [
  {
    id: 'tax-form-50',
    label: 'แบบ ภ.ง.ด. 50 / ใบรับรองการหักภาษี ณ ที่จ่าย',
    description: 'เอกสารแสดงรายได้ที่ผ่านการหักภาษี (ย้อนหลัง 1 ปี) หรือหนังสือรับรองการหักภาษี ณ ที่จ่าย',
    category: 'income',
    required: true
  },
  {
    id: 'statement-12m',
    label: 'e-Statement ย้อนหลัง 12 เดือน',
    description: 'Statement บัญชีที่เงินรายได้เข้า ย้อนหลัง 12 เดือนเพื่อพิสูจน์ความสม่ำเสมอ',
    category: 'financial',
    required: true
  },
  {
    id: 'business-registration',
    label: 'ทะเบียนพาณิชย์ / หนังสือรับรองบริษัท',
    description: 'เจ้าของกิจการ/บริษัท ต้องเตรียมทะเบียนพาณิชย์หรือหนังสือรับรองบริษัท (อายุไม่เกิน 6 เดือน)',
    category: 'income',
    required: false
  },
  {
    id: 'business-bank-statement',
    label: 'Statement บัญชีธุรกิจ (ถ้ามี)',
    description: 'บัญชีเดินสะพัดหรือบัญชีธุรกิจย้อนหลัง 6 เดือน เพื่อแสดงรายรับของกิจการ',
    category: 'financial',
    required: false
  }
];

/**
 * Build the document checklist for a given occupation.
 * Falls back to a generic list when the occupation is unknown.
 *
 * @param {string} occupationType 'salaried' | 'freelance' | 'business'
 * @returns {Array<{id,label,description,category,required}>}
 */
export function getRequiredDocChecklist(occupationType = 'salaried') {
  if (occupationType === 'salaried') {
    return [...COMMON_DOCS, ...SALARIED_DOCS];
  }
  if (occupationType === 'government') {
    return [...COMMON_DOCS, ...GOVERNMENT_DOCS];
  }
  if (occupationType === 'pensioner') {
    return [...COMMON_DOCS, ...PENSIONER_DOCS];
  }
  if (occupationType === 'freelance' || occupationType === 'business') {
    return [...COMMON_DOCS, ...FREELANCE_DOCS];
  }
  // Unknown occupation → safest generic list
  return [...COMMON_DOCS];
}
