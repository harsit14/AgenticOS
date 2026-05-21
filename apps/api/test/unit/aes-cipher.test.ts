import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { existsSync, mkdtempSync, rmSync, statSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { createAesCipher } from '../../src/core/settings/aes-cipher.js';

describe('createAesCipher', () => {
  let dir: string;

  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), 'aes-cipher-'));
  });
  afterAll(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('round-trips a value and marks it encrypted', () => {
    const cipher = createAesCipher(dir);
    const enc = cipher.encrypt('sk-secret-123');
    expect(enc).not.toBe('sk-secret-123');
    expect(enc.startsWith('enc:v1:')).toBe(true);
    expect(cipher.decrypt(enc)).toBe('sk-secret-123');
  });

  it('passes legacy plaintext through decrypt unchanged', () => {
    const cipher = createAesCipher(dir);
    // A value saved before encryption was enabled has no enc: prefix.
    expect(cipher.decrypt('plain-old-key')).toBe('plain-old-key');
  });

  it('persists the key so a fresh cipher instance can still decrypt', () => {
    const enc = createAesCipher(dir).encrypt('persisted-value');
    expect(createAesCipher(dir).decrypt(enc)).toBe('persisted-value');
  });

  it('uses a random IV — same plaintext yields different ciphertext', () => {
    const cipher = createAesCipher(dir);
    expect(cipher.encrypt('same')).not.toBe(cipher.encrypt('same'));
  });

  it('writes the keyfile with 0600 permissions', () => {
    createAesCipher(dir);
    const keyPath = join(dir, '.keyfile');
    expect(existsSync(keyPath)).toBe(true);
    expect(statSync(keyPath).mode & 0o777).toBe(0o600);
  });
});
