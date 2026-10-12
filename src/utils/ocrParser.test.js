import { describe, it, expect } from 'vitest';
import {
  parseOcrText,
  extractNumbers,
  findAmountNear,
  findInterestRate,
  findDueDate,
  BALANCE_KEYWORDS
} from './ocrParser';

describe('parseOcrText — realistic Thai statements', () => {
  it('parses a KTC credit card statement', () => {
    const statement = [
      'บัตรเครดิต KTC Platinum',
      'งบ ณ วันที่ 05 ส.ค. 2569',
      'ยอดหนี้คงเหลือ 45,000.00 บาท',
      'อัตราดอกเบี้ย 16.0% ต่อปี',
      'ยอดชำระขั้นต่ำ 3,600.00 บาท',
      'ชำระเงินภายใน 15 ส.ค. 2569'
    ].join('\n');

    const { hasText, data } = parseOcrText(statement);
    expect(hasText).toBe(true);
    expect(data.balance).toBe('45000');
    expect(data.interestRate).toBe('16');
    expect(data.minPayment).toBe('3600');
    expect(data.dueDate).toBe('15 ของทุกเดือน');
  });

  it('parses a personal loan statement with numeric due date', () => {
    const statement = [
      'สินเชื่อส่วนบุคคล SCB Speedy',
      'ยอดหนี้รวม 85,000 บาท',
      'อัตราดอกเบี้ย 24.5% ต่อปี',
      'ยอดชำระขั้นต่ำ 3,800 บาท',
      'กำหนดชำระวันที่ 28/08/2569'
    ].join('\n');

    const { hasText, data } = parseOcrText(statement);
    expect(hasText).toBe(true);
    expect(data.balance).toBe('85000');
    expect(data.interestRate).toBe('24.5');
    expect(data.minPayment).toBe('3800');
    expect(data.dueDate).toBe('28 ของทุกเดือน');
  });

  it('falls back to the largest number when no balance keyword exists', () => {
    const { data } = parseOcrText('รวมยอดบิล 20,000 บาท\nวันครบกำหนด 20 ส.ค. 2569');
    expect(data.balance).toBe('20000');
    // min payment not stated on this bill -> 5% of balance fallback
    expect(data.minPayment).toBe('1000');
    expect(data.dueDate).toBe('20 ของทุกเดือน');
  });

  it('does not mistake the Buddhist year for a balance', () => {
    const { data } = parseOcrText('วันครบกำหนด 20 ส.ค. 2569 ยอดหนี้คงเหลือ 15,000 บาท');
    expect(data.balance).toBe('15000');
  });

  it('prefers the value after the label over a fee line right before it', () => {
    const statement = [
      'ค่าธรรมเนียมรายปี 150.00 บาท',
      'ยอดหนี้คงเหลือ 45,000.00 บาท',
      'อัตราดอกเบี้ย 16.0% ต่อปี'
    ].join('\n');
    const { data } = parseOcrText(statement);
    expect(data.balance).toBe('45000');
    expect(data.interestRate).toBe('16');
  });

  it('leaves fields empty when the text has no readable numbers', () => {
    const { hasText, data } = parseOcrText('Lorem ipsum dolor sit amet consectetur');
    expect(hasText).toBe(true);
    expect(data.balance).toBe('');
    expect(data.minPayment).toBe('');
    expect(data.interestRate).toBe('');
    expect(data.dueDate).toBe('');
  });
});

describe('parseOcrText — English statements', () => {
  it('parses an English credit card statement (case-insensitive keywords)', () => {
    const statement = [
      'CREDIT CARD STATEMENT',
      'New Balance: $2,345.67',
      'Minimum Payment Due: $75.00',
      'Payment Due Date: August 12, 2026',
      'APR: 24.99%'
    ].join('\n');

    const { hasText, data } = parseOcrText(statement);
    expect(hasText).toBe(true);
    expect(data.balance).toBe('2345.67');
    expect(data.minPayment).toBe('75');
    expect(data.interestRate).toBe('24.99');
    expect(data.dueDate).toBe('12 ของทุกเดือน');
  });

  it('parses an English bill with a day-first month date', () => {
    const { data } = parseOcrText('Total balance 1,500.00\nDue Date: 12 August 2026');
    expect(data.balance).toBe('1500');
    expect(data.dueDate).toBe('12 ของทุกเดือน');
  });

  it('reads an English balance label even with mixed casing', () => {
    const { data } = parseOcrText('Outstanding Bal: 3,000.00');
    expect(data.balance).toBe('3000');
  });
});

describe('parseOcrText — edge cases', () => {
  it('returns hasText=false and empty data for empty text', () => {
    expect(parseOcrText('')).toEqual({
      hasText: false,
      data: { name: '', lender: '', balance: '', interestRate: '', minPayment: '', dueDate: '' }
    });
    expect(parseOcrText('   \n\t  ').hasText).toBe(false);
  });

  it('normalizes newlines before parsing (multi-line OCR output)', () => {
    const { data } = parseOcrText('ยอดหนี้คงเหลือ\n45,000\nบาท\nยอดชำระขั้นต่ำ\n3,600');
    expect(data.balance).toBe('45000');
    expect(data.minPayment).toBe('3600');
  });
});

describe('extractNumbers', () => {
  it('skips percentage numbers', () => {
    const nums = extractNumbers('ชำระแล้ว 5% ยอดหนี้คงเหลือ 12,000 บาท อัตราดอกเบี้ย 18%');
    expect(nums.map(n => n.val)).toEqual([12000]);
  });

  it('parses comma-separated and decimal amounts', () => {
    const vals = extractNumbers('45,000.00 และ 1,234,567').map(n => n.val);
    expect(vals).toEqual([45000, 1234567]);
  });
});

describe('findAmountNear', () => {
  it('returns null when only year-like numbers exist', () => {
    expect(
      findAmountNear('งบ ณ วันที่ 05 ส.ค. 2569', BALANCE_KEYWORDS, { fallbackLargest: true, minVal: 1000 })
    ).toBeNull();
  });

  it('prefers the number that follows the label, not the closest one before it', () => {
    expect(
      findAmountNear('ค่าธรรมเนียม 150 บาท ยอดหนี้คงเหลือ 12,000 บาท', BALANCE_KEYWORDS)
    ).toBe(12000);
  });
});

describe('findInterestRate', () => {
  it('parses Thai and English percent formats', () => {
    expect(findInterestRate('อัตราดอกเบี้ย 16.0% ต่อปี')).toBe(16);
    expect(findInterestRate('Interest rate 24.5% per year')).toBe(24.5);
  });

  it('rejects out-of-range rates', () => {
    expect(findInterestRate('อัตราดอกเบี้ย 1.5% ต่อปี')).toBeNull();
  });

  it('falls back to a number near the interest keyword when % is missing', () => {
    expect(findInterestRate('ดอกเบี้ย 18 ต่อปี ยอดหนี้ 50,000 บาท')).toBe(18);
  });
});

describe('findDueDate', () => {
  it('parses Thai month format with and without spaces', () => {
    expect(findDueDate('ชำระเงินภายใน 15 ส.ค. 2569')).toBe('15 ของทุกเดือน');
    expect(findDueDate('กำหนดชำระ 15ส.ค.2026')).toBe('15 ของทุกเดือน');
  });

  it('parses numeric formats', () => {
    expect(findDueDate('กำหนดชำระวันที่ 28/08/2569')).toBe('28 ของทุกเดือน');
    expect(findDueDate('due 03-08-69')).toBe('03 ของทุกเดือน');
  });

  it('prefers the due date over an earlier statement date', () => {
    const text = 'งบ ณ วันที่ 05 ส.ค. 2569\nชำระเงินภายใน 15 ส.ค. 2569';
    expect(findDueDate(text)).toBe('15 ของทุกเดือน');
  });

  it('returns empty when there is no date', () => {
    expect(findDueDate('ยอดหนี้คงเหลือ 12,000 บาท')).toBe('');
  });
});
