import { describe, it, expect, vi } from 'vitest';
import { isHighDemandError } from './geminiService';

describe('Gemini Vision Extraction Service - Fallback & High Demand Helper', () => {
  it('correctly identifies 503 and 429 High Demand / Rate Limit errors', () => {
    expect(isHighDemandError({ status: 503 })).toBe(true);
    expect(isHighDemandError({ status: 429 })).toBe(true);
    expect(isHighDemandError({ message: '503 Service Unavailable High Demand' })).toBe(true);
    expect(isHighDemandError({ message: 'Rate limit exceeded 429' })).toBe(true);
    expect(isHighDemandError({ message: 'RESOURCE_EXHAUSTED: Model is overloaded' })).toBe(true);
    expect(isHighDemandError({ isHighDemand: true })).toBe(true);

    expect(isHighDemandError({ status: 400, message: 'Invalid API key' })).toBe(false);
    expect(isHighDemandError(null)).toBe(false);
  });
});
