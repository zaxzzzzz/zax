import { describe, it, expect } from 'vitest';
import { 
  parseDebtTextLocal, 
  MAJOR_THAI_BANKS, 
  DEBT_TYPES,
  BROAD_BANK_TYPES,
  mapToBroadBankType
} from '../services/geminiService';
import { calculateDebtPayoff } from './debtEngine';

describe('Quick Manual Debt Form & Parser Logic', () => {

  it('exports canonical MAJOR_THAI_BANKS and DEBT_TYPES', () => {
    expect(MAJOR_THAI_BANKS).toBeDefined();
    expect(MAJOR_THAI_BANKS.length).toBeGreaterThan(5);
    expect(MAJOR_THAI_BANKS).toContain('ธนาคารกสิกรไทย (KBank)');

    expect(DEBT_TYPES).toBeDefined();
    expect(DEBT_TYPES).toEqual(['บัตรเครดิต', 'สินเชื่อส่วนบุคคล', 'สินเชื่อบ้าน', 'สินเชื่อรถยนต์', 'อื่นๆ']);
  });

  it('exports simplified BROAD_BANK_TYPES and maps specific bank names accurately', () => {
    expect(BROAD_BANK_TYPES).toEqual([
      'หนี้ธนาคารพาณิชย์',
      'หนี้สถาบันการเงินของรัฐ',
      'หนี้สถาบันการเงินที่ไม่ใช่ธนาคาร (Non-Bank)',
      'หนี้อื่นๆ'
    ]);

    expect(mapToBroadBankType('ธนาคารกสิกรไทย (KBank)')).toBe('หนี้ธนาคารพาณิชย์');
    expect(mapToBroadBankType('ธนาคารไทยพาณิชย์ (SCB)')).toBe('หนี้ธนาคารพาณิชย์');
    expect(mapToBroadBankType('ธนาคารออมสิน (GSB)')).toBe('หนี้สถาบันการเงินของรัฐ');
    expect(mapToBroadBankType('ธนาคารอาคารสงเคราะห์ (ธอส)')).toBe('หนี้สถาบันการเงินของรัฐ');
    expect(mapToBroadBankType('อิออน (AEON)')).toBe('หนี้สถาบันการเงินที่ไม่ใช่ธนาคาร (Non-Bank)');
    expect(mapToBroadBankType('เฟิร์สช้อยส์ (Krungsri First Choice)')).toBe('หนี้สถาบันการเงินที่ไม่ใช่ธนาคาร (Non-Bank)');
    expect(mapToBroadBankType('หนี้นอกระบบ เพื่อนบ้าน')).toBe('หนี้อื่นๆ');
  });

  it('parses raw Thai e-Statement text accurately into form fields', () => {
    const rawText = `
      เรียน คุณสรวิชญ์
      ธนาคารกสิกรไทย แจ้งยอดชำระประจำเดือน
      รายการ: บัตรเครดิต KBank
      ยอดคงเหลือทั้งสิ้น 45,000.00 บาท
      ยอดชำระขั้นต่ำ 2,250.00 บาท
      อัตราดอกเบี้ย 16.0% ต่อปี
      วันครบกำหนดชำระวันที่ 15 ของเดือน
    `;

    const parsed = parseDebtTextLocal(rawText);

    expect(parsed.bank_name).toBe('ธนาคารกสิกรไทย (KBank)');
    expect(parsed.debt_type).toBe('บัตรเครดิต');
    expect(parsed.current_balance).toBe(45000);
    expect(parsed.min_monthly_payment).toBe(2250);
    expect(parsed.interest_rate_percent).toBe(16.0);
    expect(parsed.due_day).toBe(15);
  });

  it('handles empty or unrecognized text with safe defaults', () => {
    const parsed = parseDebtTextLocal('');
    expect(parsed.bank_name).toBe('อื่นๆ');
    expect(parsed.debt_type).toBe('บัตรเครดิต');
    expect(parsed.current_balance).toBe(0);
    expect(parsed.interest_rate_percent).toBe(16.0);
  });

  it('triggers real-time recalculation when a new debt with entry_method: manual is added', () => {
    const initialDebts = [
      { id: 'd1', name: 'หนี้ 1', balance: 50000, interestRate: 16, minPayment: 2500, dueDate: '15' }
    ];

    const initialResult = calculateDebtPayoff(initialDebts, 2000, 'avalanche');

    // Add new manual debt
    const newManualDebt = {
      id: 'd2',
      bank_name: 'ธนาคารไทยพาณิชย์ (SCB)',
      debt_name: 'สินเชื่อส่วนบุคคล SCB',
      name: 'สินเชื่อส่วนบุคคล SCB',
      debt_type: 'สินเชื่อส่วนบุคคล',
      current_balance: 30000,
      balance: 30000,
      interest_rate_percent: 24.5,
      interestRate: 24.5,
      min_monthly_payment: 1500,
      minPayment: 1500,
      due_day: 28,
      dueDate: '28 ของทุกเดือน',
      entry_method: 'manual',
      isScanned: false
    };

    const updatedDebts = [...initialDebts, newManualDebt];
    const updatedResult = calculateDebtPayoff(updatedDebts, 2000, 'avalanche');

    // Payoff timeline and totals must re-calculate in real time
    expect(updatedResult.debtPayoffDetails.length).toBe(2);
    expect(updatedResult.baselineInterest).toBeGreaterThan(initialResult.baselineInterest);
  });

  it('supports updating and deleting a saved debt item cleanly', () => {
    let debtsList = [
      { id: 'd1', name: 'หนี้ 1', balance: 50000, interestRate: 16, minPayment: 2500, entry_method: 'manual' },
      { id: 'd2', name: 'หนี้ 2', balance: 20000, interestRate: 12, minPayment: 1000, entry_method: 'manual' }
    ];

    // Update d1
    debtsList = debtsList.map(d => d.id === 'd1' ? { ...d, balance: 40000, minPayment: 2000 } : d);
    expect(debtsList.find(d => d.id === 'd1').balance).toBe(40000);

    // Delete d2
    debtsList = debtsList.filter(d => d.id !== 'd2');
    expect(debtsList.length).toBe(1);

    const result = calculateDebtPayoff(debtsList, 1000, 'avalanche');
    expect(result.debtPayoffDetails.length).toBe(1);
    expect(result.debtPayoffDetails[0].originalBalance).toBe(40000);
  });

});
