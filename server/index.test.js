/**
 * Backend API integration tests (server/index.js)
 * Imports the real server module, listens on an ephemeral port with a temp
 * JSON DB, and exercises the full HTTP request/response cycle with fetch().
 * The Gemini API call is stubbed at the global fetch level so the analyze
 * pipeline is tested end-to-end without any network access.
 */

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';

// Test-isolated DB + deterministic Gemini key BEFORE importing the server
const TEST_DB_FILE = path.join(os.tmpdir(), `nee-noi-promotions-test-${process.pid}.json`);
process.env.PROMOTIONS_DB_FILE = TEST_DB_FILE;
process.env.GEMINI_API_KEY = process.env.GEMINI_API_KEY || 'test-key-for-vitest';
const TEST_UPLOADS_DIR = path.join(os.tmpdir(), `nee-noi-uploads-test-${process.pid}`);
process.env.PROMO_UPLOADS_DIR = TEST_UPLOADS_DIR;

const { default: server, PROMOTION_SEED } = await import('./index.js');

let baseUrl = '';

beforeAll(async () => {
  await new Promise((resolve) => {
    server.listen(0, () => {
      const { port } = server.address();
      baseUrl = `http://127.0.0.1:${port}`;
      resolve();
    });
  });
});

afterAll(async () => {
  // Drop keep-alive sockets so vitest can exit cleanly
  server.closeAllConnections?.();
  await new Promise((resolve) => server.close(resolve));    try { fs.unlinkSync(TEST_DB_FILE); } catch { /* ignore */ }
    try { fs.rmSync(TEST_UPLOADS_DIR, { recursive: true, force: true }); } catch { /* ignore */ }
});

describe('GET /api/health', () => {
  it('returns ok with geminiConfigured flag', async () => {
    const res = await fetch(`${baseUrl}/api/health`);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.ok).toBe(true);
    expect(data.geminiConfigured).toBe(true);
  });
});

describe('Promotion CRUD', () => {
  it('GET seeds and returns the baseline promotions on a fresh DB', async () => {
    const res = await fetch(`${baseUrl}/api/admin/promotions`);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.ok).toBe(true);
    expect(data.promotions.length).toBe(PROMOTION_SEED.length);
    // sorted newest first
    for (let i = 1; i < data.promotions.length; i++) {
      expect(data.promotions[i].updated_at).toBeLessThanOrEqual(data.promotions[i - 1].updated_at);
    }
  });

  it('POST creates a promotion with normalized fields', async () => {
    const res = await fetch(`${baseUrl}/api/admin/promotions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        bank_name: 'ธนาคารกรุงไทย',
        product_name: 'Test Refi',
        min_income: '12000',       // string -> coerced to Number
        avg_3yr_rate: 2.45,
        is_mrta: 1,                // truthy -> Boolean true
        is_free_mortgage_fee: true
      })
    });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.ok).toBe(true);
    expect(data.promotion.id).toMatch(/^promo-/);
    expect(data.promotion.min_income).toBe(12000);
    expect(data.promotion.is_mrta).toBe(true);
    expect(typeof data.promotion.updated_at).toBe('number');

    const list = (await (await fetch(`${baseUrl}/api/admin/promotions`)).json()).promotions;
    expect(list.find(p => p.id === data.promotion.id)?.product_name).toBe('Test Refi');
  });

  it('POST with the same id updates in place (no duplicate)', async () => {
    const created = (await (
      await fetch(`${baseUrl}/api/admin/promotions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bank_name: 'ธนาคารกรุงไทย', product_name: 'Upsert v1', avg_3yr_rate: 2.5 })
      })
    ).json()).promotion;

    const updated = (await (
      await fetch(`${baseUrl}/api/admin/promotions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: created.id, bank_name: 'ธนาคารกรุงไทย', product_name: 'Upsert v2', avg_3yr_rate: 1.99 })
      })
    ).json()).promotion;

    expect(updated.id).toBe(created.id);
    expect(updated.product_name).toBe('Upsert v2');
    expect(updated.avg_3yr_rate).toBe(1.99);
    expect(updated.updated_at).toBeGreaterThanOrEqual(created.updated_at);

    const list = (await (await fetch(`${baseUrl}/api/admin/promotions`)).json()).promotions;
    expect(list.filter(p => p.id === created.id).length).toBe(1);
  });

  it('POST normalizes and persists a rate_matrix (schema contract)', async () => {
    const res = await fetch(`${baseUrl}/api/admin/promotions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        bank_name: 'ธนาคารออมสิน',
        product_name: 'GSB Refi Table',
        rate_matrix: [
          {
            customer_group: 'พนักงานประจำ',
            min_income: '20,000',            // string -> Number
            property_types: 'บ้านเดี่ยว, คอนโด', // comma string -> array
            is_mrta: 'ทำประกันชีวิต',          // Thai cell -> true
            is_free_mortgage: 'ฟรีค่าจดจำนอง', // Thai cell -> true
            year_1_rate: '1.49%',
            year_2_3_rate: '2.49%',
            avg_3yr_rate: 0                   // 0 -> derived (1.49 + 2.49×2)/3
          },
          {
            customer_group: 'ทุกประเภท',
            min_income: 15000,
            is_mrta: 'ไม่ทำ',                 // Thai cell -> false
            is_free_mortgage: false,
            year_1_rate: '2.49%',
            year_2_3_rate: '3.49%'
          }
        ]
      })
    });
    expect(res.status).toBe(200);
    const { promotion } = await res.json();
    expect(Array.isArray(promotion.rate_matrix)).toBe(true);
    expect(promotion.rate_matrix).toHaveLength(2);

    const [rowA, rowB] = promotion.rate_matrix;
    expect(rowA.min_income).toBe(20000);
    expect(rowA.property_types).toEqual(['บ้านเดี่ยว', 'คอนโด']);
    expect(rowA.is_mrta).toBe(true);
    expect(rowA.is_free_mortgage).toBe(true);
    expect(rowA.fee_waivers).toEqual(['จดจำนอง']);
    expect(rowA.avg_3yr_rate).toBeCloseTo(2.16, 2);
    expect(rowA.id).toBeTruthy();
    expect(rowB.is_mrta).toBe(false);

    // ...and it survives a re-read from the JSON DB
    const list = (await (await fetch(`${baseUrl}/api/admin/promotions`)).json()).promotions;
    expect(list.find(p => p.id === promotion.id)?.rate_matrix).toHaveLength(2);
  });

  it('POST rejects missing bank_name / product_name with 400', async () => {
    const noBank = await fetch(`${baseUrl}/api/admin/promotions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ product_name: 'x' })
    });
    expect(noBank.status).toBe(400);

    const noProduct = await fetch(`${baseUrl}/api/admin/promotions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ bank_name: 'x' })
    });
    expect(noProduct.status).toBe(400);
    expect((await noProduct.json()).error).toMatch(/product_name/);
  });

  it('POST with malformed JSON body returns 400', async () => {
    const res = await fetch(`${baseUrl}/api/admin/promotions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{not-json'
    });
    expect(res.status).toBe(400);
  });

  it('DELETE removes a promotion; unknown id returns 404', async () => {
    const created = (await (
      await fetch(`${baseUrl}/api/admin/promotions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bank_name: 'ธนาคารออมสิน', product_name: 'To be deleted' })
      })
    ).json()).promotion;

    const del = await fetch(`${baseUrl}/api/admin/promotions?id=${encodeURIComponent(created.id)}`, { method: 'DELETE' });
    expect(del.status).toBe(200);
    expect((await del.json()).deletedId).toBe(created.id);

    const missing = await fetch(`${baseUrl}/api/admin/promotions?id=${encodeURIComponent(created.id)}`, { method: 'DELETE' });
    expect(missing.status).toBe(404);

    const noId = await fetch(`${baseUrl}/api/admin/promotions`, { method: 'DELETE' });
    expect(noId.status).toBe(400);
  });
});

describe('POST /api/admin/promotions/analyze', () => {
  it('rejects requests without an image (400)', async () => {
    const res = await fetch(`${baseUrl}/api/admin/promotions/analyze`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}'
    });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/No image provided/);
  });

  it('rejects malformed data URLs (400)', async () => {
    const res = await fetch(`${baseUrl}/api/admin/promotions/analyze`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ image_base64: 'data:broken' })
    });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/Invalid image data URL/);
  });

  it('parses a data URL, calls Gemini Vision, and returns the normalized promo JSON', async () => {
    // Stub the Gemini REST call at the network boundary
    const geminiJson = JSON.stringify({
      bank_name: 'ธนาคารกรุงไทย',
      product_name: 'รีไฟแนนซ์ KTB AI',
      min_income: '12000',
      avg_3yr_rate: '2.45',
      year_1_rate: '1.49%',
      year_2_3_rate: null,
      after_year_3_rate: 'MRR-1.50%',
      is_mrta: false,
      is_free_mortgage_fee: 'true',
      bank_ref_link: 'null'
    });
    let capturedRequest = null;
    const origFetch = globalThis.fetch; // capture BEFORE spying
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (url, init) => {
      if (String(url).includes('generativelanguage.googleapis.com')) {
        capturedRequest = { url: String(url), init };
        return new Response(JSON.stringify({
          candidates: [{ content: { parts: [{ text: geminiJson }] } }]
        }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      // passthrough for local API calls
      return origFetch(url, init);
    });

    try {
      const res = await fetch(`${baseUrl}/api/admin/promotions/analyze`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          image_base64: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='
        })
      });
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.ok).toBe(true);

      // Normalization of Gemini output
      expect(data.promotion.bank_name).toBe('ธนาคารกรุงไทย');
      expect(data.promotion.min_income).toBe(12000);   // string -> Number
      expect(data.promotion.avg_3yr_rate).toBe(2.45);  // string -> Number
      expect(data.promotion.is_free_mortgage_fee).toBe(true); // 'true' -> Boolean
      expect(data.promotion.year_2_3_rate).toBe('');   // null -> ''
      expect(data.promotion.bank_ref_link).toBe('');   // 'null' -> ''

      // Gemini request shape: key in URL + inline_data image part + primary Flash model
      expect(capturedRequest).toBeTruthy();
      expect(capturedRequest.url).toContain('models/gemini-3.6-flash');
      expect(capturedRequest.url).toContain('key=');
      const sentBody = JSON.parse(capturedRequest.init.body);
      const parts = sentBody.contents[0].parts;
      expect(parts[0].text).toContain('bank_name');
      expect(parts[1].inline_data.mime_type).toBe('image/png');
      expect(parts[1].inline_data.data).not.toContain('data:'); // raw base64 only
    } finally {
      fetchSpy.mockRestore();
      delete fetch.__orig;
    }
  });

  it('retries with gemini-3.6-flash when the first attempt returns 503 High Demand', async () => {
    const geminiJson = JSON.stringify({
      bank_name: 'ธนาคารกสิกรไทย',
      product_name: 'Fallback Success Promo',
      min_income: 15000,
      avg_3yr_rate: 2.99
    });
    const calledModels = [];
    const origFetch = globalThis.fetch;
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (url, init) => {
      const urlStr = String(url);
      if (urlStr.includes('generativelanguage.googleapis.com')) {
        // Primary and fallback are the same model string (gemini-3.6-flash),
        // so distinguish attempts by call order: 1st call 503, retry succeeds.
        const attempt = calledModels.length;
        calledModels.push('gemini-3.6-flash');
        if (attempt === 0) {
          return new Response(JSON.stringify({ error: { message: '503 Service Unavailable: High Demand' } }), { status: 503 });
        }
        return new Response(JSON.stringify({
          candidates: [{ content: { parts: [{ text: geminiJson }] } }]
        }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      return origFetch(url, init);
    });

    try {
      const res = await fetch(`${baseUrl}/api/admin/promotions/analyze`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image_base64: 'aGVsbG8=' })
      });
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.ok).toBe(true);
      expect(data.promotion.product_name).toBe('Fallback Success Promo');
      expect(calledModels).toEqual(['gemini-3.6-flash', 'gemini-3.6-flash']);
    } finally {
      fetchSpy.mockRestore();
    }
  });

  it('returns 503 status when both primary and fallback models experience 503 High Demand', async () => {
    const origFetch = globalThis.fetch;
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (url, init) => {
      if (String(url).includes('generativelanguage.googleapis.com')) {
        return new Response(JSON.stringify({ error: { message: '503 High Demand error' } }), { status: 503 });
      }
      return origFetch(url, init);
    });

    try {
      const res = await fetch(`${baseUrl}/api/admin/promotions/analyze`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image_base64: 'aGVsbG8=' })
      });
      expect(res.status).toBe(503);
      const data = await res.json();
      expect(data.error).toMatch(/Gemini Vision error/);
    } finally {
      fetchSpy.mockRestore();
    }
  });

  it('accepts the /extract-image alias and returns the same normalized payload', async () => {
    const geminiJson = JSON.stringify({
      bank_name: 'Krungsri',
      product_name: 'Alias Route Test',
      min_income: 20000,
      avg_3yr_rate: 2.55
    });
    const origFetch = globalThis.fetch;
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (url, init) => {
      if (String(url).includes('generativelanguage.googleapis.com')) {
        return new Response(JSON.stringify({
          candidates: [{ content: { parts: [{ text: geminiJson }] } }]
        }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      return origFetch(url, init);
    });

    try {
      const res = await fetch(`${baseUrl}/api/admin/promotions/extract-image`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image_base64: 'aGVsbG8=' })
      });
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.ok).toBe(true);
      // Bank-name alias mapping (e.g. "Krungsri" -> Thai canonical) is applied
      // client-side via normalizeBankName; the server only normalizes types.
      expect(data.promotion.bank_name).toBe('Krungsri');
      expect(data.promotion.product_name).toBe('Alias Route Test');
    } finally {
      fetchSpy.mockRestore();
    }
  });

  it('returns 502 when Gemini responds with an API error', async () => {
    const origFetch = globalThis.fetch; // capture BEFORE spying
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (url, init) => {
      if (String(url).includes('generativelanguage.googleapis.com')) {
        return new Response(JSON.stringify({ error: { message: 'API key invalid' } }), { status: 400 });
      }
      return origFetch(url, init); // forward full init (POST method/body)
    });

    try {
      const res = await fetch(`${baseUrl}/api/admin/promotions/analyze`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image_base64: 'aGVsbG8=' })
      });
      expect(res.status).toBe(502);
      expect((await res.json()).error).toMatch(/Gemini Vision error/);
    } finally {
      fetchSpy.mockRestore();
      delete fetch.__orig;
    }
  });
});

describe('POST /api/admin/promotions/upload-image', () => {
  it('stores the file in uploads dir and returns a short /uploads/ URL', async () => {
    // 1x1 transparent PNG
    const PNG_BASE64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
    const res = await fetch(`${baseUrl}/api/admin/promotions/upload-image`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ image_base64: `data:image/png;base64,${PNG_BASE64}` })
    });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.ok).toBe(true);
    expect(data.url).toMatch(/^\/uploads\/promo-[\w-]+\.png$/);

    // File must exist on disk inside the isolated test uploads dir
    const savedPath = path.join(TEST_UPLOADS_DIR, path.basename(data.url));
    expect(fs.existsSync(savedPath)).toBe(true);
    expect(fs.readFileSync(savedPath).toString('base64')).toBe(PNG_BASE64);

    // And must be served back over HTTP with the right content type
    const imgRes = await fetch(`${baseUrl}${data.url}`);
    expect(imgRes.status).toBe(200);
    expect(imgRes.headers.get('content-type')).toBe('image/png');
  });

  it('rejects an empty payload with 400', async () => {
    const res = await fetch(`${baseUrl}/api/admin/promotions/upload-image`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({})
    });
    expect(res.status).toBe(400);
  });

  it('rejects a malformed data URL with 400', async () => {
    const res = await fetch(`${baseUrl}/api/admin/promotions/upload-image`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ image_base64: 'data:broken' })
    });
    expect(res.status).toBe(400);
  });
});

describe('/api/debts CRUD & Text Parser', () => {
  it('GET /api/debts returns seeded user debts', async () => {
    const res = await fetch(`${baseUrl}/api/debts?user_id=user1`);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.ok).toBe(true);
    expect(Array.isArray(data.debts)).toBe(true);
    expect(data.debts.length).toBeGreaterThan(0);
  });

  it('POST /api/debts creates and validates a manual debt entry', async () => {
    const payload = {
      user_id: 'user1',
      bank_name: 'ธนาคารกสิกรไทย (KBank)',
      debt_name: 'บัตรเครดิต KBank Quick',
      debt_type: 'บัตรเครดิต',
      current_balance: 45000,
      interest_rate_percent: 16.0,
      min_monthly_payment: 2250,
      due_day: 15,
      entry_method: 'manual'
    };

    const res = await fetch(`${baseUrl}/api/debts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.ok).toBe(true);
    expect(data.debt.debt_name).toBe('บัตรเครดิต KBank Quick');
    expect(data.debt.entry_method).toBe('manual');
    expect(data.debt.current_balance).toBe(45000);
    expect(data.debt.interest_rate_percent).toBe(16.0);
  });

  it('POST /api/debts rejects invalid balance <= 0 with 400', async () => {
    const res = await fetch(`${baseUrl}/api/debts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        bank_name: 'KBank',
        debt_name: 'Test',
        current_balance: -500,
        interest_rate_percent: 16,
        min_monthly_payment: 1000
      })
    });
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toMatch(/current_balance/);
  });

  it('POST /api/debts/parse-text extracts structured fields from raw text', async () => {
    const rawText = 'ธนาคารกสิกรไทย บัตรเครดิต ยอดคงเหลือ 35,000 บาท ดอกเบี้ย 16% ขั้นต่ำ 1,750 บาท ครบกำหนดวันที่ 20';
    const res = await fetch(`${baseUrl}/api/debts/parse-text`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: rawText })
    });

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.ok).toBe(true);
    expect(data.debt.bank_name).toBe('ธนาคารกสิกรไทย (KBank)');
    expect(data.debt.current_balance).toBe(35000);
    expect(data.debt.interest_rate_percent).toBe(16);
    expect(data.debt.min_monthly_payment).toBe(1750);
    expect(data.debt.due_day).toBe(20);
  });

  it('DELETE /api/debts removes a debt item', async () => {
    // Create one to delete
    const createRes = await fetch(`${baseUrl}/api/debts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: 'debt-to-delete-999',
        user_id: 'user1',
        bank_name: 'Test Bank',
        debt_name: 'Temporary Debt',
        current_balance: 10000,
        interest_rate_percent: 10,
        min_monthly_payment: 500
      })
    });
    expect(createRes.status).toBe(200);

    const deleteRes = await fetch(`${baseUrl}/api/debts?id=debt-to-delete-999`, {
      method: 'DELETE'
    });
    expect(deleteRes.status).toBe(200);
    const data = await deleteRes.json();
    expect(data.ok).toBe(true);
    expect(data.deletedId).toBe('debt-to-delete-999');
  });
});

describe('Authentication & User Profiles API', () => {
  it('POST /api/auth/signup registers credentials and creates user_profiles record', async () => {
    const uniqueUsername = `testuser_${Date.now()}`;
    const signupData = {
      username: uniqueUsername,
      password: 'password123',
      gender: 'ชาย',
      age: 26,
      occupation: 'พนักงานบริษัท'
    };

    const res = await fetch(`${baseUrl}/api/auth/signup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(signupData)
    });

    expect(res.status).toBe(201);
    const data = await res.json();
    expect(data.ok).toBe(true);
    expect(data.user.username).toBe(uniqueUsername);
    expect(data.user.profile).toBeDefined();
    expect(data.user.profile.gender).toBe('ชาย');
    expect(data.user.profile.age).toBe(26);
    expect(data.user.profile.occupation).toBe('พนักงานบริษัท');


    // Verify user profile fetch
    const profileRes = await fetch(`${baseUrl}/api/user-profiles?user_id=${data.user.id}`);
    expect(profileRes.status).toBe(200);
    const profileData = await profileRes.json();
    expect(profileData.ok).toBe(true);
    expect(profileData.profile.occupation).toBe('พนักงานบริษัท');
  });

  it('POST /api/auth/signup rejects duplicate username with 400', async () => {
    const res = await fetch(`${baseUrl}/api/auth/signup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: 'admin',
        password: 'password123',
        gender: 'หญิง',
        age: 30,
        occupation: 'ฟรีแลนซ์'
      })
    });

    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.ok).toBe(false);
    expect(data.error).toMatch(/ถูกใช้งานแล้ว/);
  });

  it('POST /api/auth/signup rejects invalid age <= 0 with 400', async () => {
    const res = await fetch(`${baseUrl}/api/auth/signup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: 'invalidage_user',
        password: 'password123',
        gender: 'หญิง',
        age: 0,
        occupation: 'ฟรีแลนซ์'
      })
    });

    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.ok).toBe(false);
    expect(data.error).toMatch(/อายุต้องมากกว่า 0/);
  });

  it('POST /api/auth/login authenticates valid user and returns profile data', async () => {
    const res = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: 'user1',
        password: 'user123'
      })
    });

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.ok).toBe(true);
    expect(data.user.username).toBe('user1');
    expect(data.user.profile).toBeDefined();
    expect(data.user.profile.gender).toBe('ชาย');
    expect(data.user.profile.age).toBe(30);
  });

  it('POST /api/auth/login returns 401 on incorrect password', async () => {
    const res = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: 'user1',
        password: 'wrongpassword'
      })
    });

    expect(res.status).toBe(401);
    const data = await res.json();
    expect(data.ok).toBe(false);
  });
});

describe('Auth API always answers with a valid JSON body', () => {
  const signupPayload = (overrides = {}) => ({
    username: `json_body_${Date.now()}_${Math.floor(Math.random() * 100000)}`,
    password: 'password123',
    gender: 'หญิง',
    age: 25,
    occupation: 'ฟรีแลนซ์',
    ...overrides
  });

  const postJson = (route, body) =>
    fetch(`${baseUrl}${route}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: typeof body === 'string' ? body : JSON.stringify(body)
    });

  it('POST /api/auth/signup success -> application/json + parseable object', async () => {
    const res = await postJson('/api/auth/signup', signupPayload());
    expect(res.status).toBe(201);
    expect(res.headers.get('content-type')).toContain('application/json');
    // res.json() would throw "Unexpected end of JSON input" on an empty body
    const data = await res.json();
    expect(data.ok).toBe(true);
    expect(data.user.username).toBeTruthy();
    expect(data.user.profile.age).toBe(25);
  });

  it('POST /api/auth/signup validation failure -> JSON error object (never empty)', async () => {
    const res = await postJson('/api/auth/signup', signupPayload({ age: -3 }));
    expect(res.status).toBe(400);
    expect(res.headers.get('content-type')).toContain('application/json');
    const data = await res.json();
    expect(data.ok).toBe(false);
    expect(typeof data.error).toBe('string');
    expect(data.error.length).toBeGreaterThan(0);
  });

  it('POST /api/auth/signup with a malformed JSON body -> JSON 400', async () => {
    const res = await postJson('/api/auth/signup', '{ this is not json');
    expect(res.status).toBe(400);
    expect(res.headers.get('content-type')).toContain('application/json');
    const data = await res.json();
    expect(data.ok).toBe(false);
    expect(typeof data.error).toBe('string');
  });

  it('POST /api/auth/login success and failure -> both parseable JSON', async () => {
    const okRes = await postJson('/api/auth/login', { username: 'user1', password: 'user123' });
    expect(okRes.status).toBe(200);
    expect(okRes.headers.get('content-type')).toContain('application/json');
    expect((await okRes.json()).ok).toBe(true);

    const badRes = await postJson('/api/auth/login', { username: 'user1', password: 'wrong' });
    expect(badRes.status).toBe(401);
    expect(badRes.headers.get('content-type')).toContain('application/json');
    expect((await badRes.json()).ok).toBe(false);
  });

  it('unknown /api route -> JSON 404 instead of an empty response body', async () => {
    const res = await postJson('/api/definitely-not-a-route', { anything: true });
    expect(res.status).toBe(404);
    expect(res.headers.get('content-type')).toContain('application/json');
    const data = await res.json();
    expect(data.ok).toBe(false);
    expect(typeof data.error).toBe('string');
  });
});
