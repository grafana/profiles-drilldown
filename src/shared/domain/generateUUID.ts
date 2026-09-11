/**
 * Generate a UUID v4.
 *
 * Uses `crypto.randomUUID()` when available (secure contexts / HTTPS).
 * Falls back to `crypto.getRandomValues()` for non-secure contexts (e.g. Grafana over HTTP).
 * Falls back to `Math.random()` if no crypto API is available.
 */
export function generateUUID(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }

  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    // Set version (4) and variant (10xx)
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;

    const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  }

  // Last-resort fallback: RFC 4122 version 4 UUID using Math.random().
  // Not cryptographically secure, but ensures we always return a valid UUID.
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    // Safe: this UUID is used as a local identifier (DOM key, filter id, saved-search uid),
    // never for security, auth, or uniqueness across trust boundaries.
    // eslint-disable-next-line sonarjs/pseudo-random
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}
