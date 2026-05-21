import { describe, expect, it, afterEach } from 'vitest';
import { identityCipher, getCipher, setCipher, type Cipher } from '../../src/core/settings/cipher.js';

const reversingCipher: Cipher = {
  encrypt: (s) => s.split('').reverse().join(''),
  decrypt: (s) => s.split('').reverse().join(''),
};

describe('cipher shim', () => {
  afterEach(() => setCipher(identityCipher));

  it('uses identityCipher by default', () => {
    const cipher = getCipher();
    expect(cipher.encrypt('hello')).toBe('hello');
    expect(cipher.decrypt('hello')).toBe('hello');
  });

  it('swap-in: setCipher replaces the active implementation', () => {
    setCipher(reversingCipher);
    expect(getCipher().encrypt('abc')).toBe('cba');
    expect(getCipher().decrypt('cba')).toBe('abc');
  });

  it('round-trips arbitrary strings', () => {
    setCipher(reversingCipher);
    const sample = 'sk-test-abc123';
    const cipher = getCipher();
    expect(cipher.decrypt(cipher.encrypt(sample))).toBe(sample);
  });
});
