import {
  createCipheriv,
  createDecipheriv,
  createHash,
  generateKeyPairSync,
  randomBytes,
  timingSafeEqual,
} from 'node:crypto';
import bcrypt from 'bcryptjs';

// ── WireGuard (reverse-tunnel reachability) ──────────────────────────────────
/**
 * Generate a Curve25519 keypair in WireGuard's wire format (raw 32-byte keys,
 * base64). Uses Node's x25519 keygen and extracts the raw key from the DER tail.
 */
export function generateWireguardKeypair(): { privateKey: string; publicKey: string } {
  const { publicKey, privateKey } = generateKeyPairSync('x25519', {
    publicKeyEncoding: { type: 'spki', format: 'der' },
    privateKeyEncoding: { type: 'pkcs8', format: 'der' },
  });
  return {
    privateKey: privateKey.subarray(-32).toString('base64'),
    publicKey: publicKey.subarray(-32).toString('base64'),
  };
}

// ── Passwords ────────────────────────────────────────────────────────────────
export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, 12);
}

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

// ── Random tokens / API keys ─────────────────────────────────────────────────
export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString('hex');
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

function deriveKey(secret: string): Buffer {
  return createHash('sha256').update(secret).digest(); // 32 bytes
}

// ── Sealing provider secrets at rest (AES-256-GCM) ───────────────────────────
export function seal(plaintext: string, secret: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', deriveKey(secret), iv);
  const enc = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv.toString('base64'), tag.toString('base64'), enc.toString('base64')].join('.');
}

export function unseal(token: string, secret: string): string {
  const [ivB, tagB, encB] = token.split('.');
  if (!ivB || !tagB || !encB) throw new Error('Malformed sealed token');
  const decipher = createDecipheriv('aes-256-gcm', deriveKey(secret), Buffer.from(ivB, 'base64'));
  decipher.setAuthTag(Buffer.from(tagB, 'base64'));
  return Buffer.concat([decipher.update(Buffer.from(encB, 'base64')), decipher.final()]).toString('utf8');
}

// ── guacamole-lite connection token (AES-256-CBC) ────────────────────────────
// The browser opens `wss://proxy/?token=<this>`; guacamole-lite decrypts it to
// reach the RDP/VNC/SSH target. Secret must be exactly 32 chars (AES-256).
export function encryptGuacToken(connection: unknown, secret: string): string {
  const iv = randomBytes(16);
  const key = secret.length === 32 ? Buffer.from(secret) : deriveKey(secret);
  const cipher = createCipheriv('aes-256-cbc', key, iv);
  const data = Buffer.concat([
    cipher.update(JSON.stringify(connection), 'utf8'),
    cipher.final(),
  ]);
  const token = { iv: iv.toString('base64'), value: data.toString('base64') };
  return Buffer.from(JSON.stringify(token)).toString('base64');
}
