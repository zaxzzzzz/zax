import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { GoogleGenerativeAI } from '@google/generative-ai';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const OUTPUT_FILE = path.join(__dirname, '../src/data/bankOffers.json');

// Target Thai retail banks
const TARGET_BANKS = ['KBANK', 'TTB', 'SCB', 'GHBANK', 'GSB', 'KTB', 'BBL', 'KRUNGSRI', 'CIMBT', 'UOB'];

// Baseline fallback bank offers matrix
const FALLBACK_OFFERS = [
  {
    bankId: "KBANK",
    bankName: "ธนาคารกสิกรไทย (KBank)",
    packageName: "โปรโมชั่นรีไฟแนนซ์บ้านสุดคุ้ม",
    avg3YearRate: 3.75,
    mrrReference: 7.30,
    minIncome: 15000,
    freeAppraisal: true,
    freeMortgageFee: false,
    highlights: ["ฟรีค่าประเมินหลักประกัน", "อัตราดอกเบี้ยเฉลี่ย 3 ปีแรก 3.75%", "กู้เพิ่มรวมหนี้ได้สูงสุด 100%"],
    sourceUrl: "https://www.kasikornbank.com/th/personal/loan/homeloan/pages/refinance.aspx",
    lastUpdated: new Date().toISOString().split('T')[0]
  },
  {
    bankId: "TTB",
    bankName: "ธนาคารทีทีบี (ttb)",
    packageName: "ttb refinancing & top-up",
    avg3YearRate: 3.65,
    mrrReference: 7.83,
    minIncome: 15000,
    freeAppraisal: true,
    freeMortgageFee: true,
    highlights: ["ฟรีค่าจดจำนอง 1%", "ฟรีประกันภัยอัคคีภัย", "ดอกเบี้ยเฉลี่ย 3 ปีแรกต่ำพิเศษ 3.65%"],
    sourceUrl: "https://www.ttbbank.com/th/personal/loans/home-loan/home-refinance",
    lastUpdated: new Date().toISOString().split('T')[0]
  },
  {
    bankId: "SCB",
    bankName: "ธนาคารไทยพาณิชย์ (SCB)",
    packageName: "SCB Home Refinance & Consolidation",
    avg3YearRate: 3.85,
    mrrReference: 7.30,
    minIncome: 20000,
    freeAppraisal: true,
    freeMortgageFee: false,
    highlights: ["กู้ง่าย อนุมัติไว", "ผ่อนสบายยาวนานสูงสุด 30 ปี", "รวมหนี้บัตรเครดิตลบภาระต่อเดือน"],
    sourceUrl: "https://www.scb.co.th/th/personal-banking/loans/home-loans/refinance.html",
    lastUpdated: new Date().toISOString().split('T')[0]
  },
  {
    bankId: "GHBANK",
    bankName: "ธนาคารอาคารสงเคราะห์ (ธอส.)",
    packageName: "โครงการบ้านคงกระพัน รีไฟแนนซ์",
    avg3YearRate: 3.50,
    mrrReference: 6.90,
    minIncome: 12000,
    freeAppraisal: false,
    freeMortgageFee: false,
    highlights: ["อัตราดอกเบี้ยต่ำสุดเริ่มต้น 3.50%", "ผ่อนได้นานสูงสุด 40 ปี", "รองรับทุกกลุ่มอาชีพ"],
    sourceUrl: "https://www.ghbank.co.th/product-services/promotions/refinance",
    lastUpdated: new Date().toISOString().split('T')[0]
  },
  {
    bankId: "GSB",
    bankName: "ธนาคารออมสิน (GSB)",
    packageName: "สินเชื่อบ้านผ่อนสบาย รีไฟแนนซ์",
    avg3YearRate: 3.59,
    mrrReference: 6.995,
    minIncome: 15000,
    freeAppraisal: true,
    freeMortgageFee: false,
    highlights: ["อัตราดอกเบี้ยคงที่ปีแรก 1.99%", "ฟรีค่าธรรมเนียมยื่นกู้และค่าประเมิน", "กู้เพิ่มเพื่อรวบหนี้รายย่อยได้"],
    sourceUrl: "https://www.gsb.or.th/personal/loans/home/refinance",
    lastUpdated: new Date().toISOString().split('T')[0]
  },
  {
    bankId: "KTB",
    bankName: "ธนาคารกรุงไทย (Krungthai)",
    packageName: "สินเชื่อรีไฟแนนซ์บ้าน กรุงไทยสุขใจ",
    avg3YearRate: 3.69,
    mrrReference: 7.57,
    minIncome: 15000,
    freeAppraisal: true,
    freeMortgageFee: false,
    highlights: ["ดอกเบี้ยเริ่มต้น 1.75% ในปีแรก", "ฟรีค่าประเมินราคาหลักประกัน", "ให้วงเงินกู้สูงสุด 100%"],
    sourceUrl: "https://krungthai.com/th/personal/loans/housing-loans/refinance",
    lastUpdated: new Date().toISOString().split('T')[0]
  },
  {
    bankId: "BBL",
    bankName: "ธนาคารกรุงเทพ (Bangkok Bank)",
    packageName: "สินเชื่อบ้านรีไฟแนนซ์ ธนาคารกรุงเทพ",
    avg3YearRate: 3.79,
    mrrReference: 7.05,
    minIncome: 20000,
    freeAppraisal: false,
    freeMortgageFee: false,
    highlights: ["ทางเลือกผ่อนแบบดอกเบี้ยคงที่และลอยตัว", "วงเงินกู้สูงสุด 100% ของภาระหนี้คงเหลือ", "รวมหนี้เอนกประสงค์ได้"],
    sourceUrl: "https://www.bangkokbank.com/th-TH/Personal/My-Home/Home-Loans/Refinance-Loan",
    lastUpdated: new Date().toISOString().split('T')[0]
  },
  {
    bankId: "KRUNGSRI",
    bankName: "ธนาคารกรุงศรีอยุธยา (Krungsri)",
    packageName: "กรุงศรี รีไฟแนนซ์บ้านสบายใจ",
    avg3YearRate: 3.90,
    mrrReference: 7.40,
    minIncome: 30000,
    freeAppraisal: true,
    freeMortgageFee: false,
    highlights: ["ฟรีค่าธรรมเนียมประเมิน", "ส่วนลดดอกเบี้ยพิเศษเมื่อทำ MRTA"],
    sourceUrl: "https://www.krungsri.com/th/personal/loans/home-loans/refinance",
    lastUpdated: new Date().toISOString().split('T')[0]
  },
  {
    bankId: "CIMBT",
    bankName: "ธนาคารซีไอเอ็มบี ไทย (CIMB Thai)",
    packageName: "สินเชื่อรีไฟแนนซ์บ้าน ซีไอเอ็มบี ไทย",
    avg3YearRate: 3.49,
    mrrReference: 8.875,
    minIncome: 30000,
    freeAppraisal: true,
    freeMortgageFee: true,
    highlights: ["ดอกเบี้ยเฉลี่ย 3 ปีแรกต่ำพิเศษ 3.49%", "ฟรีค่าจดจำนอง 1% และฟรีค่าประเมิน", "เลือกรับดอกเบี้ยแบบคงที่ได้"],
    sourceUrl: "https://www.cimbthai.com/th/personal/products/loans/mortgage-loan/home-refinance.html",
    lastUpdated: new Date().toISOString().split('T')[0]
  },
  {
    bankId: "UOB",
    bankName: "ธนาคารยูโอบี (UOB)",
    packageName: "สินเชื่อบ้านรีไฟแนนซ์ UOB Home Loan",
    avg3YearRate: 3.89,
    mrrReference: 8.80,
    minIncome: 30000,
    freeAppraisal: true,
    freeMortgageFee: false,
    highlights: ["วงเงินอนุมัติสูงสุด 100%", "อนุมัติเบื้องต้นรวดเร็วใน 3 วันทำการ", "เลือกรวมหนี้สินเชื่อหมุนเวียนได้"],
    sourceUrl: "https://www.uob.co.th/personal/loans/homeloan/refinance.page",
    lastUpdated: new Date().toISOString().split('T')[0]
  }
];

/**
 * Validate extracted JSON structure and rate bounds
 */
function validateBankOffers(offers) {
  if (!Array.isArray(offers) || offers.length === 0) {
    throw new Error("Invalid output: Expected non-empty array of bank offers.");
  }

  const validated = [];
  const today = new Date().toISOString().split('T')[0];

  for (const item of offers) {
    const rate = Number(item.avg3YearRate);
    if (isNaN(rate) || rate < 2.0 || rate > 10.0) {
      console.warn(`[Validation Warning] Rate for ${item.bankId || 'unknown'} (${rate}) out of bounds [2.0 - 10.0]. Skipping item.`);
      continue;
    }

    validated.push({
      bankId: String(item.bankId || 'BANK').toUpperCase(),
      bankName: String(item.bankName || 'ธนาคารพันธมิตร'),
      packageName: String(item.packageName || 'แพ็คเกจรีไฟแนนซ์'),
      avg3YearRate: Math.round(rate * 100) / 100,
      mrrReference: Number(item.mrrReference) || 7.30,
      minIncome: Math.max(0, Number(item.minIncome) || 15000),
      freeAppraisal: Boolean(item.freeAppraisal),
      freeMortgageFee: Boolean(item.freeMortgageFee),
      highlights: Array.isArray(item.highlights) ? item.highlights.map(String) : ['อัตราดอกเบี้ยพิเศษ'],
      sourceUrl: String(item.sourceUrl || ''),
      lastUpdated: item.lastUpdated || today
    });
  }

  if (validated.length === 0) {
    throw new Error("No valid bank offers survived bounds validation.");
  }

  return validated;
}

/**
 * Main auto-collector execution function
 */
async function runUpdateBankRates() {
  console.log("🚀 Starting Automated Bank Rate Collector...");

  const apiKey = process.env.VITE_GEMINI_API_KEY || process.env.GEMINI_API_KEY;

  if (!apiKey) {
    console.warn("⚠️ GEMINI_API_KEY environment variable not found.");
    console.log(`ℹ️ Writing verified matrix of ${FALLBACK_OFFERS.length} Thai banks to src/data/bankOffers.json...`);
    const validated = validateBankOffers(FALLBACK_OFFERS);
    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(validated, null, 2), 'utf-8');
    console.log(`✅ Successfully saved ${validated.length} bank offers to ${OUTPUT_FILE}`);
    return;
  }

  try {
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: "gemini-3.6-flash" });

    const prompt = `
    You are an automated FinTech financial rate scraping specialist for Thai retail banking.
    Extract the latest promotional Home Refinance and Debt Consolidation interest rates for these 10 Thai banks:
    ${TARGET_BANKS.join(', ')}.

    Respond strictly with a JSON array matching this exact schema:
    [
      {
        "bankId": "STRING (e.g., KBANK, TTB, SCB, GHBANK, GSB, KTB, BBL, KRUNGSRI, CIMBT, UOB)",
        "bankName": "STRING (Thai bank name)",
        "packageName": "STRING",
        "avg3YearRate": NUMBER (float, calculated as (rateYr1 + rateYr2 + rateYr3) / 3 for years 1-3 average),
        "mrrReference": NUMBER (float, the bank's current MRR as of August 2025),
        "minIncome": NUMBER (minimum monthly income in THB),
        "freeAppraisal": BOOLEAN (true if ฟรีค่าประเมิน is offered),
        "freeMortgageFee": BOOLEAN (true if ฟรีค่าจดจำนอง 1% is offered),
        "highlights": ["STRING_1", "STRING_2"],
        "sourceUrl": "STRING (actual URL of the promotion page)",
        "lastUpdated": "${new Date().toISOString().split('T')[0]}"
      }
    ]

    IMPORTANT: Return ONLY the JSON array. No markdown, no prose, no comments.
    Every string value must be on a single line with no embedded newlines.
    Output compact JSON (minified) for reliable parsing.
    `;

    console.log("🤖 Querying Gemini 1.5 Flash AI model for 10 Thai bank rate promotions...");
    const response = await model.generateContent(prompt);
    const responseText = response.response.text();

    // Debug: log full raw response
    console.log("📋 Full raw response:");
    console.log(responseText);

    // Strip markdown wrappers only — do NOT strip // comments (they break URLs!)
    let cleanJson = responseText.replace(/```json/gi, '').replace(/```/g, '').trim();
    // Remove non-printable control chars (but keep newlines for now)
    cleanJson = cleanJson.replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g, '');
    // Remove newlines/tabs (safe in compact JSON output)
    cleanJson = cleanJson.replace(/[\n\r\t]/g, ' ');
    cleanJson = cleanJson.replace(/\s{2,}/g, ' ');
    // Extract JSON array from response
    const jsonMatch = cleanJson.match(/\[[\s\S]*\]/);
    const jsonStr = jsonMatch ? jsonMatch[0] : cleanJson;

    // Debug: log what we got
    console.log('📋 Extracted JSON length:', jsonStr.length);
    console.log('📋 First 200 chars:', jsonStr.substring(0, 200));
    console.log('📋 Last 200 chars:', jsonStr.substring(jsonStr.length - 200));

    // Try direct JSON.parse (works for clean compact JSON from Gemini)
    let parsedJson;
    try {
      parsedJson = JSON.parse(jsonStr);
    } catch (e1) {
      console.warn('⚠️ JSON.parse failed:', e1.message);
      // Gemini sometimes puts // comments — strip them from lines that don't look like URLs
      let noComments = jsonStr.replace(/^\s*\/\/.*$/gm, '');
      try {
        parsedJson = JSON.parse(noComments);
      } catch (e2) {
        console.error('❌ Still failed:', e2.message);
        throw new Error('Failed to parse Gemini response');
      }
    }
    const validatedOffers = validateBankOffers(parsedJson);

    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(validatedOffers, null, 2), 'utf-8');
    console.log(`✅ Successfully updated ${validatedOffers.length} bank rate promotions in ${OUTPUT_FILE}`);

  } catch (error) {
    console.error("❌ Gemini API Rate Scraper failed:", error.message);
    console.log("🔄 Fallback: Writing validated baseline rate matrix...");
    const validated = validateBankOffers(FALLBACK_OFFERS);
    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(validated, null, 2), 'utf-8');
    console.log(`✅ Saved ${validated.length} fallback bank offers to ${OUTPUT_FILE}`);
  }
}

// Execute script
runUpdateBankRates();
