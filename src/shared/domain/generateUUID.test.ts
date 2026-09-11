import { generateUUID } from './generateUUID';

describe('generateUUID', () => {
  it('returns a valid UUID v4 when crypto.randomUUID is available', () => {
    const result = generateUUID();

    // Standard UUID v4 format: 8-4-4-4-12 hex chars, with version 4 and variant nibbles.
    expect(result).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });

  it('returns unique UUIDs across calls', () => {
    const uuids = new Set<string>();
    for (let i = 0; i < 100; i++) {
      uuids.add(generateUUID());
    }
    expect(uuids.size).toBe(100);
  });

  describe('fallback path (no crypto.randomUUID)', () => {
    let originalRandomUUID: typeof crypto.randomUUID | undefined;

    beforeEach(() => {
      originalRandomUUID = crypto.randomUUID;
      // jsdom/webcrypto polyfill exposes randomUUID; remove it to simulate a non-secure context.
      Object.defineProperty(crypto, 'randomUUID', {
        value: undefined,
        configurable: true,
      });
    });

    afterEach(() => {
      Object.defineProperty(crypto, 'randomUUID', {
        value: originalRandomUUID,
        configurable: true,
        writable: true,
      });
    });

    it('falls back to crypto.getRandomValues and still returns a valid UUID v4', () => {
      const result = generateUUID();

      expect(result).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    });

    it('returns unique UUIDs from the fallback path', () => {
      const uuids = new Set<string>();
      for (let i = 0; i < 100; i++) {
        uuids.add(generateUUID());
      }
      expect(uuids.size).toBe(100);
    });
  });

  describe('no crypto support at all', () => {
    let originalCrypto: PropertyDescriptor | undefined;

    beforeEach(() => {
      originalCrypto = Object.getOwnPropertyDescriptor(global, 'crypto');
      // The crypto global exists at compile time; remove at runtime to simulate a hostile env.
      Object.defineProperty(global, 'crypto', { value: undefined, configurable: true });
    });

    afterEach(() => {
      if (originalCrypto) {
        Object.defineProperty(global, 'crypto', originalCrypto);
      }
    });

    it('falls back to Math.random and still returns a valid UUID v4', () => {
      const result = generateUUID();

      expect(result).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    });

    it('returns unique UUIDs from the Math.random fallback', () => {
      const uuids = new Set<string>();
      for (let i = 0; i < 100; i++) {
        uuids.add(generateUUID());
      }
      expect(uuids.size).toBe(100);
    });
  });
});
