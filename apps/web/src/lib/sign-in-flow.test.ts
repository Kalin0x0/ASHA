import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { ApiError } from '@/lib/api/client';
import { classifySignInError, isCompleteOtp, looksLikeEmail, normalizeOtp } from './sign-in-flow';

const api401 = (message: string, body?: unknown) => new ApiError(401, message, body ?? { message });

describe('classifySignInError', () => {
  it('asks for the code only when the API says a code is required', () => {
    expect(classifySignInError(api401('Two-factor code required'))).toBe('second-factor-required');
  });

  it('tells a wrong code from a spent one', () => {
    expect(classifySignInError(api401('Invalid two-factor code'))).toBe('second-factor-invalid');
    expect(classifySignInError(api401('Two-factor code already used — wait for the next code'))).toBe(
      'second-factor-reused',
    );
  });

  it('keeps every other 401 a plain credentials failure', () => {
    expect(classifySignInError(api401('Invalid credentials'))).toBe('invalid-credentials');
    expect(classifySignInError(api401('Something new the API says'))).toBe('invalid-credentials');
  });

  it('prefers a stable code over the sentence', () => {
    expect(classifySignInError(api401('Unauthorized', { code: 'TOTP_REQUIRED' }))).toBe('second-factor-required');
  });

  it('sorts throttling, timeouts and non-API errors', () => {
    expect(classifySignInError(new ApiError(429, 'Too Many Requests'))).toBe('rate-limited');
    expect(classifySignInError(new ApiError(408, 'The server did not respond in time.'))).toBe('timeout');
    expect(classifySignInError(new ApiError(500, 'boom'))).toBe('unknown');
    expect(classifySignInError(new TypeError('Failed to fetch'))).toBe('unknown');
  });
});

describe('the sentences the sign-in screen keys off', () => {
  // The screen decides "ask for the code" from the API's wording. If the API
  // rewords one of these, the second step silently never appears — so the
  // wording is pinned against the API source itself.
  it('are still the ones the API throws', () => {
    const service = readFileSync(
      fileURLToPath(new URL('../../../api/src/modules/auth/auth.service.ts', import.meta.url)),
      'utf8',
    );
    expect(service).toContain("'Two-factor code required'");
    expect(service).toContain("'Invalid two-factor code'");
    expect(service).toContain("'Two-factor code already used — wait for the next code'");
  });
});

describe('normalizeOtp', () => {
  it('keeps digits only, at most six', () => {
    expect(normalizeOtp('123 456')).toBe('123456');
    expect(normalizeOtp('12-34-56-78')).toBe('123456');
    expect(normalizeOtp('abc')).toBe('');
  });

  it('accepts Persian and Arabic-Indic digits', () => {
    expect(normalizeOtp('۱۲۳۴۵۶')).toBe('123456');
    expect(normalizeOtp('٠١٢٣٤٥')).toBe('012345');
  });

  it('marks only six digits as complete', () => {
    expect(isCompleteOtp('123456')).toBe(true);
    expect(isCompleteOtp('12345')).toBe(false);
  });
});

describe('looksLikeEmail', () => {
  it('seeds the demo form from an address, not a username', () => {
    expect(looksLikeEmail(' ana@firma.de ')).toBe(true);
    expect(looksLikeEmail('ana')).toBe(false);
  });
});
