import { ApiError } from '@/lib/api/client';

/**
 * The sign-in screen is a short conversation, not one form. It asks for the
 * account first and only then — and only when that account has an authenticator
 * enrolled — for the code. The API already works this way round: it checks the
 * password before it ever mentions a second factor, so asking "has 2FA?" leaks
 * nothing to someone who does not hold the password.
 */
export type SignInStep = 'credentials' | 'second-factor' | 'demo';

export type SignInFailure =
  | 'second-factor-required'
  | 'second-factor-invalid'
  | 'second-factor-reused'
  | 'invalid-credentials'
  | 'rate-limited'
  | 'timeout'
  | 'unknown';

/** Stable codes the API may attach to a failure; preferred over its sentence. */
const CODES: Record<string, SignInFailure> = {
  TOTP_REQUIRED: 'second-factor-required',
  TOTP_INVALID: 'second-factor-invalid',
  TOTP_REUSED: 'second-factor-reused',
};

/**
 * Sort a failed `POST /auth/login` into what the screen should do next.
 *
 * Every rejection is a 401 with a fixed English sentence (see the login in the
 * API's auth service, which pins them in a test). The sentence decides between
 * "ask for the code", "the code was wrong" and "the account or password was
 * wrong"; anything unrecognised stays a generic credentials failure so nothing
 * about the account is ever echoed back.
 */
export function classifySignInError(err: unknown): SignInFailure {
  if (!(err instanceof ApiError)) return 'unknown';
  if (err.status === 429) return 'rate-limited';
  if (err.status === 408) return 'timeout';
  if (err.status !== 401) return 'unknown';

  const code = (err.body as { code?: unknown } | undefined)?.code;
  if (typeof code === 'string' && CODES[code]) return CODES[code];

  const message = err.message.toLowerCase();
  if (message.includes('two-factor code required')) return 'second-factor-required';
  if (message.includes('two-factor code already used')) return 'second-factor-reused';
  if (message.includes('invalid two-factor code')) return 'second-factor-invalid';
  return 'invalid-credentials';
}

const PERSIAN_ZERO = 0x06f0;
const ARABIC_INDIC_ZERO = 0x0660;

/**
 * Keep only the digits of a typed or pasted code, at most six. Persian and
 * Arabic-Indic digits count: a phone set to Persian types ۱۲۳۴۵۶, and an
 * authenticator code is still that code.
 */
export function normalizeOtp(raw: string): string {
  let out = '';
  for (const ch of raw) {
    const c = ch.charCodeAt(0);
    if (c >= 0x30 && c <= 0x39) out += ch;
    else if (c >= PERSIAN_ZERO && c <= PERSIAN_ZERO + 9) out += String(c - PERSIAN_ZERO);
    else if (c >= ARABIC_INDIC_ZERO && c <= ARABIC_INDIC_ZERO + 9) out += String(c - ARABIC_INDIC_ZERO);
    if (out.length === 6) break;
  }
  return out;
}

export function isCompleteOtp(code: string): boolean {
  return /^\d{6}$/.test(code);
}

/** An e-mail-shaped identifier can seed the demo form; a bare username cannot. */
export function looksLikeEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}
