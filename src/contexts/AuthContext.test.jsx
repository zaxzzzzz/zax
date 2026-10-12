/**
 * Safe JSON parsing used by the auth API calls (AuthContext).
 * Guards against "Unexpected end of JSON input" when the server or the dev
 * proxy answers with an empty body, an HTML error page, or no content-type.
 */
import { describe, it, expect } from 'vitest';
import { readJsonResponse, UNREADABLE_RESPONSE_MESSAGE } from './AuthContext';

describe('readJsonResponse', () => {
  it('parses a valid application/json body', async () => {
    const response = new Response(JSON.stringify({ ok: true, user: { id: 'u1' } }), {
      status: 201,
      headers: { 'content-type': 'application/json; charset=utf-8' }
    });
    const { readable, data } = await readJsonResponse(response);
    expect(readable).toBe(true);
    expect(data.ok).toBe(true);
    expect(data.user.id).toBe('u1');
  });

  it('never throws on an empty JSON body — reports it as unreadable', async () => {
    const response = new Response('', {
      status: 200,
      headers: { 'content-type': 'application/json' }
    });
    const { readable, data } = await readJsonResponse(response);
    expect(readable).toBe(false);
    expect(data).toBeNull();
  });

  it('matches the real-world repro: empty 500 from the dev proxy (text/plain)', async () => {
    // Vite's proxy answers HTTP 500 with an empty body when the backend is down.
    // response.json() on that body throws "Unexpected end of JSON input".
    const response = new Response('', {
      status: 500,
      headers: { 'content-type': 'text/plain' }
    });
    const { readable, data } = await readJsonResponse(response);
    expect(readable).toBe(false);
    expect(data).toBeNull();
  });

  it('skips parsing when the content-type is not JSON (HTML error page)', async () => {
    const response = new Response('<!doctype html><html>502 Bad Gateway</html>', {
      status: 502,
      headers: { 'content-type': 'text/html; charset=utf-8' }
    });
    const { readable, data } = await readJsonResponse(response);
    expect(readable).toBe(false);
    expect(data).toBeNull();
  });

  it('treats a missing content-type header as unreadable before parsing', async () => {
    const response = new Response(null);
    expect(response.headers.get('content-type')).toBeNull();
    const { readable, data } = await readJsonResponse(response);
    expect(readable).toBe(false);
    expect(data).toBeNull();
  });

  it('tolerates a missing/undefined response instead of throwing', async () => {
    const { readable, data } = await readJsonResponse(undefined);
    expect(readable).toBe(false);
    expect(data).toBeNull();
  });
});

describe('UNREADABLE_RESPONSE_MESSAGE', () => {
  it('is the readable Thai message shown in the UI', () => {
    expect(UNREADABLE_RESPONSE_MESSAGE).toBe('ไม่สามารถอ่านข้อมูลจากเซิร์ฟเวอร์ได้');
  });
});
