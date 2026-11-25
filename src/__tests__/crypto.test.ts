import { describe, expect, it } from 'vitest';
import {
  generateId,
  generateSecretKey,
  hashPin,
  sha256Hex,
  sha256Pure,
  verifyPin,
} from '../utils/crypto';

describe('crypto utilities & secret keys', () => {
  it('computes identical SHA-256 hashes between pure-JS and Web Crypto', async () => {
    const sample = 'familygazette-v1:prof-1:4321';
    const pure = sha256Pure(sample);
    const web = await sha256Hex(sample);
    expect(pure).toHaveLength(64);
    expect(web).toBe(pure);
  });

  it('salts PIN hashes per profile ID and verifies cleanly', async () => {
    const h1 = await hashPin('prof-a', '1234');
    const h2 = await hashPin('prof-b', '1234');
    expect(h1).not.toBe(h2);
    await expect(verifyPin('prof-a', '1234', h1)).resolves.toBe(true);
    await expect(verifyPin('prof-a', '9999', h1)).resolves.toBe(false);
  });

  it('generates URL-safe 32-character unique secret keys for Gazette URLs', () => {
    const keys = new Set<string>();
    for (let i = 0; i < 20; i++) {
      const k = generateSecretKey();
      expect(k).toMatch(/^[A-Za-z0-9_-]{32}$/);
      keys.add(k);
    }
    expect(keys.size).toBe(20);
    expect(generateId('post')).toMatch(/^post-/);
  });
});
