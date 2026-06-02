import { seal, unseal } from '@chista/crypto';

/**
 * Provider configs (VM/DNS/auth) carry secrets — API tokens, passwords, private
 * keys. We seal the *entire* config blob (AES-256-GCM) into the row's
 * `secretRef` column and persist only a redacted copy in `config` for display,
 * so secrets never leave the database in API responses.
 *
 * Keys whose name suggests a secret are masked in the redacted copy.
 */
const SECRET_KEY_PATTERN = /(password|secret|token|key|credential|privatekey|passphrase|apikey)/i;
const MASK = '••••••••';

export function isSecretKey(key: string): boolean {
  // "publicKey" / "keyName" / "tokenId" are identifiers, not secrets.
  if (/^(public|keyname|tokenid|accesskeyid|clientid|userocid|tenancyocid|fingerprint)$/i.test(key)) {
    return false;
  }
  return SECRET_KEY_PATTERN.test(key);
}

/** Produce a display-safe copy of a config with secret-looking values masked. */
export function redactConfig(config: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(config)) {
    out[k] = isSecretKey(k) && v ? MASK : v;
  }
  return out;
}

/** Seal a config blob to a string for the `secretRef` column. */
export function sealConfig(config: Record<string, unknown>, key: string): string {
  return seal(JSON.stringify(config), key);
}

/** Recover the original config from a sealed `secretRef`. */
export function unsealConfig(secretRef: string, key: string): Record<string, unknown> {
  return JSON.parse(unseal(secretRef, key)) as Record<string, unknown>;
}

/**
 * Merge an incoming (partial) config update over the previously-sealed config.
 * Masked values in the incoming config mean "unchanged" — they keep the stored
 * secret rather than overwriting it with the mask.
 */
export function mergeSealedConfig(
  previous: Record<string, unknown>,
  incoming: Record<string, unknown>,
): Record<string, unknown> {
  const merged = { ...previous };
  for (const [k, v] of Object.entries(incoming)) {
    if (v === MASK) continue; // unchanged masked secret
    merged[k] = v;
  }
  return merged;
}
