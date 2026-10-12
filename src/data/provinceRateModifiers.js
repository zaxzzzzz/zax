/**
 * Province-based interest rate modifiers for home loans.
 *
 * In Thailand, real estate lending rates vary by location:
 * - Bangkok & metro: Most competitive (base rate)
 * - Major cities & EEC: Slightly higher demand-driven rates
 * - Provincial cities: Moderate premium
 * - Rural/remote: Highest premium due to appraisal risk
 *
 * modifier = percentage points added to the base package rate.
 *   0.00 = base rate (กรุงเทพฯ)
 *   0.10 = +0.10% above base
 *  -0.05 = 0.05% discount (rare, for EEC industrial zones)
 */

export const PROVINCE_RATE_MODIFIERS = {
  // ═══════════ Tier 0: Bangkok Metropolitan ═══════════
  'กรุงเทพมหานคร':         { modifier: 0.00, tier: 0, label: 'โซนกรุงเทพฯ' },

  // ═══════════ Tier 0+: Bangkok Surrounding (พื้นที่ติดกรุงเทพฯ) ═══════════
  'นนทบุรี':               { modifier: 0.00, tier: 0, label: 'โซนกรุงเทพฯ' },
  'ปทุมธานี':              { modifier: 0.00, tier: 0, label: 'โซนกรุงเทพฯ' },
  'สมุทรปราการ':           { modifier: 0.00, tier: 0, label: 'โซนกรุงเทพฯ' },
  'สมุทรสาคร':             { modifier: 0.00, tier: 0, label: 'โซนกรุงเทพฯ' },
  'สมุทรสงคราม':           { modifier: 0.00, tier: 0, label: 'โซนกรุงเทพฯ' },
  'นครปฐม':               { modifier: 0.00, tier: 0, label: 'โซนกรุงเทพฯ' },
  'นครนายก':              { modifier: 0.00, tier: 0, label: 'โซนกรุงเทพฯ' },
  'ปทุมธานี':              { modifier: 0.00, tier: 0, label: 'โซนกรุงเทพฯ' },

  // ═══════════ Tier 1: Eastern Seaboard (EEC) ═══════════
  'ชลบุรี':               { modifier: 0.05, tier: 1, label: 'โซน EEC' },
  'ระยอง':                { modifier: 0.05, tier: 1, label: 'โซน EEC' },
  'ฉะเชิงเทรา':            { modifier: 0.05, tier: 1, label: 'โซน EEC' },
  'ปราจีนบุรี':            { modifier: 0.05, tier: 1, label: 'โซน EEC' },
  'สระแก้ว':              { modifier: 0.05, tier: 1, label: 'โซน EEC' },
  'จันทบุรี':              { modifier: 0.05, tier: 1, label: 'โซน EEC' },
  'ตราด':                 { modifier: 0.05, tier: 1, label: 'โซน EEC' },

  // ═══════════ Tier 2: Major Provincial Cities ═══════════
  'เชียงใหม่':             { modifier: 0.10, tier: 2, label: 'เมืองหลัก' },
  'เชียงราย':              { modifier: 0.10, tier: 2, label: 'เมืองหลัก' },
  'ภูเก็ต':               { modifier: 0.10, tier: 2, label: 'เมืองหลัก' },
  'สุราษฎร์ธานี':          { modifier: 0.10, tier: 2, label: 'เมืองหลัก' },
  'หาดใหญ่ (สงขลา)':       { modifier: 0.10, tier: 2, label: 'เมืองหลัก' },
  'สงขลา':                { modifier: 0.10, tier: 2, label: 'เมืองหลัก' },
  'ขอนแก่น':              { modifier: 0.10, tier: 2, label: 'เมืองหลัก' },
  'นครราชสีมา':            { modifier: 0.10, tier: 2, label: 'เมืองหลัก' },
  'อุบลราชธานี':           { modifier: 0.10, tier: 2, label: 'เมืองหลัก' },
  'อุดรธานี':              { modifier: 0.10, tier: 2, label: 'เมืองหลัก' },

  // ═══════════ Tier 2: Resort / Tourist Provinces ═══════════
  'พังงา':                { modifier: 0.10, tier: 2, label: 'เมืองท่องเที่ยว' },
  'กระบี่':               { modifier: 0.10, tier: 2, label: 'เมืองท่องเที่ยว' },
  'ระนอง':                { modifier: 0.10, tier: 2, label: 'เมืองท่องเที่ยว' },

  // ═══════════ Tier 3: Secondary Cities ═══════════
  'นครศรีธรรมราช':         { modifier: 0.15, tier: 3, label: 'เมืองรอง' },
  'พัทลุง':               { modifier: 0.15, tier: 3, label: 'เมืองรอง' },
  'สตูล':                 { modifier: 0.15, tier: 3, label: 'เมืองรอง' },
  'ปัตตานี':              { modifier: 0.15, tier: 3, label: 'เมืองรอง' },
  'ยะลา':                 { modifier: 0.15, tier: 3, label: 'เมืองรอง' },
  'นราธิวาส':              { modifier: 0.15, tier: 3, label: 'เมืองรอง' },
  'ชุมพร':               { modifier: 0.15, tier: 3, label: 'เมืองรอง' },
  'ประจวบคีรีขันธ์':        { modifier: 0.15, tier: 3, label: 'เมืองรอง' },
  'ราชบุรี':              { modifier: 0.15, tier: 3, label: 'เมืองรอง' },
  'กาญจนบุรี':             { modifier: 0.15, tier: 3, label: 'เมืองรอง' },
  'เพชรบุรี':              { modifier: 0.15, tier: 3, label: 'เมืองรอง' },
  'ลพบุรี':               { modifier: 0.15, tier: 3, label: 'เมืองรอง' },
  'สระบุรี':              { modifier: 0.15, tier: 3, label: 'เมืองรอง' },
  'สิงห์บุรี':              { modifier: 0.15, tier: 3, label: 'เมืองรอง' },
  'อ่างทอง':              { modifier: 0.15, tier: 3, label: 'เมืองรอง' },
  'ชัยนาท':               { modifier: 0.15, tier: 3, label: 'เมืองรอง' },
  'สุพรรณบุรี':             { modifier: 0.15, tier: 3, label: 'เมืองรอง' },
  'นครสวรรค์':             { modifier: 0.15, tier: 3, label: 'เมืองรอง' },
  'พิษณุโลก':              { modifier: 0.15, tier: 3, label: 'เมืองรอง' },
  'สุโขทัย':              { modifier: 0.15, tier: 3, label: 'เมืองรอง' },
  'กำแพงเพชร':             { modifier: 0.15, tier: 3, label: 'เมืองรอง' },
  'ตาก':                 { modifier: 0.15, tier: 3, label: 'เมืองรอง' },
  'ลำปาง':               { modifier: 0.15, tier: 3, label: 'เมืองรอง' },
  'ลำพูน':               { modifier: 0.15, tier: 3, label: 'เมืองรอง' },
  'พะเยา':               { modifier: 0.15, tier: 3, label: 'เมืองรอง' },
  'แพร่':                 { modifier: 0.15, tier: 3, label: 'เมืองรอง' },
  'น่าน':                 { modifier: 0.15, tier: 3, label: 'เมืองรอง' },
  'อุตรดิตถ์':              { modifier: 0.15, tier: 3, label: 'เมืองรอง' },
  'อุทัยธานี':              { modifier: 0.15, tier: 3, label: 'เมืองรอง' },
  'แม่ฮ่องสอน':             { modifier: 0.15, tier: 3, label: 'เมืองรอง' },

  // ═══════════ Tier 3: Isaan Secondary ═══════════
  'นครพนม':               { modifier: 0.15, tier: 3, label: 'เมืองรอง' },
  'สกลนคร':               { modifier: 0.15, tier: 3, label: 'เมืองรอง' },
  'กาฬสินธุ์':             { modifier: 0.15, tier: 3, label: 'เมืองรอง' },
  'มหาสารคาม':             { modifier: 0.15, tier: 3, label: 'เมืองรอง' },
  'ร้อยเอ็ด':              { modifier: 0.15, tier: 3, label: 'เมืองรอง' },
  'ยโสธร':               { modifier: 0.15, tier: 3, label: 'เมืองรอง' },
  'อำนาจเจริญ':             { modifier: 0.15, tier: 3, label: 'เมืองรอง' },
  'บุรีรัมย์':              { modifier: 0.15, tier: 3, label: 'เมืองรอง' },
  'สุรินทร์':              { modifier: 0.15, tier: 3, label: 'เมืองรอง' },
  'ศรีสะเกษ':              { modifier: 0.15, tier: 3, label: 'เมืองรอง' },
  'ชัยภูมิ':              { modifier: 0.15, tier: 3, label: 'เมืองรอง' },
  'เพชรบูรณ์':             { modifier: 0.15, tier: 3, label: 'เมืองรอง' },
  'พิจิตร':               { modifier: 0.15, tier: 3, label: 'เมืองรอง' },
  'นครราชสีมา':            { modifier: 0.15, tier: 3, label: 'เมืองรอง' },

  // ═══════════ Tier 3: Upper South ═══════════
  'สุราษฎร์ธานี':          { modifier: 0.15, tier: 3, label: 'เมืองรอง' },
  'นครศรีธรรมราช':         { modifier: 0.15, tier: 3, label: 'เมืองรอง' },
  'ชุมพร':               { modifier: 0.15, tier: 3, label: 'เมืองรอง' },

  // ═══════════ Tier 3: North-West ═══════════
  'หนองคาย':              { modifier: 0.15, tier: 3, label: 'เมืองรอง' },
  'บึงกาฬ':               { modifier: 0.15, tier: 3, label: 'เมืองรอง' },
  'หนองบัวลำภู':            { modifier: 0.15, tier: 3, label: 'เมืองรอง' },
  'เลย':                 { modifier: 0.15, tier: 3, label: 'เมืองรอง' },
  'มุกดาหาร':              { modifier: 0.15, tier: 3, label: 'เมืองรอง' },
};

/** Tier metadata for UI display */
export const RATE_TIERS = [
  { tier: 0, label: 'โซนกรุงเทพฯ', color: 'emerald', emoji: '🏙️', desc: 'ดอกเบี้ยต่ำสุด — พื้นที่มีความต้องการสินเชื่อสูง สถาบันการเงินแข่งขันกันมาก' },
  { tier: 1, label: 'โซน EEC', color: 'blue', emoji: '🏭', desc: 'อัตราพิเศษโซนเศรษฐกิจตะวันออก — ใกล้เคียงกรุงเทพฯ' },
  { tier: 2, label: 'เมืองหลัก', color: 'amber', emoji: '🌆', desc: 'เมืองท่องเที่ยวและศูนย์กลางภูมิภาค — อัตราปรับเล็กน้อย' },
  { tier: 3, label: 'เมืองรอง', color: 'orange', emoji: '🏘️', desc: 'พื้นที่ห่างไกล — อัตราปรับสูงขึ้นเล็กน้อยตามความเสี่ยงหลักประกัน' },
];

/**
 * Get rate modifier info for a province.
 * @param {string} province - Thai province name
 * @returns {{ modifier: number, tier: number, label: string } | null}
 */
export function getProvinceRateInfo(province) {
  if (!province) return null;
  return PROVINCE_RATE_MODIFIERS[province] || null;
}

/**
 * Get the effective interest rate for a package given a province.
 * @param {number} baseRate - package base rate (%)
 * @param {string} province - Thai province name
 * @returns {{ effectiveRate: number, modifier: number, tier: number, label: string }}
 */
export function getEffectiveRate(baseRate, province) {
  const info = getProvinceRateInfo(province);
  if (!info) {
    // Unknown province → assume tier 3
    return { effectiveRate: baseRate + 0.15, modifier: 0.15, tier: 3, label: 'พื้นที่ห่างไกล' };
  }
  return {
    effectiveRate: Math.round((baseRate + info.modifier) * 100) / 100,
    modifier: info.modifier,
    tier: info.tier,
    label: info.label
  };
}
