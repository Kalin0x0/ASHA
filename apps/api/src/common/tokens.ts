/**
 * Workspace launch-token interpolation.
 *
 * Resolves tokens like `{username}`, `{email}` and `{custom_attribute_<key>}`
 * (or `{<key>}`) inside any string — recursively across objects and arrays.
 * Unknown tokens are left untouched so partially-templated values survive.
 *
 * Used when dispatching a provision command so admin-defined container env /
 * labels can reference the launching user. Kept here (api-local) for now; can
 * be promoted to a shared package when the agent needs it too.
 */
export interface TokenContext {
  username?: string;
  email?: string;
  /** Per-launch values, exposed as `{custom_attribute_<key>}` or `{<key>}`. */
  customAttributes?: Record<string, unknown>;
}

const TOKEN = /\{([a-zA-Z0-9_]+)\}/g;

export function resolveTokens<T>(value: T, ctx: TokenContext): T {
  if (typeof value === 'string') return interpolate(value, ctx) as unknown as T;
  if (Array.isArray(value)) return value.map((v) => resolveTokens(v, ctx)) as unknown as T;
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) out[k] = resolveTokens(v as unknown, ctx);
    return out as unknown as T;
  }
  return value;
}

function interpolate(input: string, ctx: TokenContext): string {
  return input.replace(TOKEN, (whole, key: string) => {
    const v = lookup(key, ctx);
    return v === undefined || v === null ? whole : String(v);
  });
}

function lookup(key: string, ctx: TokenContext): unknown {
  if (key === 'username') return ctx.username;
  if (key === 'email') return ctx.email;
  const attrs = ctx.customAttributes ?? {};
  if (key.startsWith('custom_attribute_')) return attrs[key.slice('custom_attribute_'.length)];
  if (key in attrs) return attrs[key];
  return undefined;
}
