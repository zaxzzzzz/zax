/**
 * Submit-handler error mapping: raw JSON parser errors must never reach the
 * sign up / login form — they become a readable Thai message instead.
 */
import { describe, it, expect } from 'vitest';
import { toFriendlyAuthError } from './LoginPage';

const THAI_MESSAGE = 'ไม่สามารถอ่านข้อมูลจากเซิร์ฟเวอร์ได้';

describe('toFriendlyAuthError', () => {
  it('converts "Unexpected end of JSON input" into the Thai message', () => {
    const err = new SyntaxError('Unexpected end of JSON input');
    expect(toFriendlyAuthError(err, 'fallback')).toBe(THAI_MESSAGE);
  });

  it('converts other JSON body parse failures into the Thai message', () => {
    expect(toFriendlyAuthError(new SyntaxError('Unexpected token < in JSON at position 0'), 'fallback'))
      .toBe(THAI_MESSAGE);
    expect(toFriendlyAuthError(new SyntaxError('Unexpected end of JSON input'), 'fallback'))
      .toBe(THAI_MESSAGE);
  });

  it('keeps readable server errors untouched (e.g. Thai validation messages)', () => {
    expect(toFriendlyAuthError(new Error('ชื่อผู้ใช้นี้ถูกใช้งานแล้ว'), 'fallback'))
      .toBe('ชื่อผู้ใช้นี้ถูกใช้งานแล้ว');
    expect(toFriendlyAuthError(new Error(THAI_MESSAGE), 'fallback')).toBe(THAI_MESSAGE);
  });

  it('falls back to the provided Thai fallback when the error has no message', () => {
    expect(toFriendlyAuthError(null, 'เกิดข้อผิดพลาดในการลงทะเบียน')).toBe('เกิดข้อผิดพลาดในการลงทะเบียน');
    expect(toFriendlyAuthError(new Error(''), 'เกิดข้อผิดพลาดในการเข้าสู่ระบบ')).toBe('เกิดข้อผิดพลาดในการเข้าสู่ระบบ');
  });
});
