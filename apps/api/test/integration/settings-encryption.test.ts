/**
 * P2 — verifies provider API keys are encrypted at rest.
 *
 * Drives the real settings module with the AES cipher and asserts the raw
 * stored value is ciphertext while getSetting() returns the plaintext.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

const tmpDir = mkdtempSync(join(tmpdir(), 'agentic-enc-'));
process.env.DATABASE_URL = `file:${join(tmpDir, 'test.db')}`;

const { db, initDb } = await import('../../src/db/index.js');
const { settings } = await import('../../src/db/schema.js');
const { eq } = await import('drizzle-orm');
const { getSetting, setSetting } = await import('../../src/core/settings/index.js');
const { setCipher, identityCipher } = await import('../../src/core/settings/cipher.js');
const { createAesCipher } = await import('../../src/core/settings/aes-cipher.js');

beforeAll(async () => {
  await initDb();
  setCipher(createAesCipher(tmpDir));
});

afterAll(() => {
  setCipher(identityCipher);
  rmSync(tmpDir, { recursive: true, force: true });
});

describe('provider_api_keys encryption at rest', () => {
  it('stores ciphertext but reads back plaintext', async () => {
    await setSetting('provider_api_keys', { openai: 'sk-super-secret-123' });

    // Raw row: the stored value must NOT contain the plaintext key.
    const row = await db
      .select()
      .from(settings)
      .where(eq(settings.key, 'provider_api_keys'))
      .get();
    const stored = (row?.value ?? {}) as Record<string, string>;
    expect(stored.openai).toBeDefined();
    expect(stored.openai).not.toContain('sk-super-secret-123');
    expect(stored.openai.startsWith('enc:v1:')).toBe(true);

    // getSetting transparently decrypts.
    const readBack = await getSetting('provider_api_keys');
    expect(readBack).toEqual({ openai: 'sk-super-secret-123' });
  });

  it('non-sensitive settings are stored as-is', async () => {
    await setSetting('default_model_id', 'lmstudio:some-model');
    const row = await db
      .select()
      .from(settings)
      .where(eq(settings.key, 'default_model_id'))
      .get();
    expect(row?.value).toBe('lmstudio:some-model');
  });
});
