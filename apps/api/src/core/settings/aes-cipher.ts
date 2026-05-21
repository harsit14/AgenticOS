import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
} from 'crypto';
import { chmodSync, existsSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import type { Cipher } from './cipher.js';

// AES-256-GCM at-rest encryption for sensitive settings (provider API keys).
//
// The 32-byte key lives in a 0600 keyfile next to the SQLite database. This
// protects against casual disk inspection and accidentally sharing the .db
// file — it is NOT protection against an attacker who can already read the
// data directory (the key is right there). For that, an OS-keychain-backed
// cipher is the next step; the Cipher shim means call sites won't change.

const KEYFILE_NAME = '.keyfile';
const ENC_PREFIX = 'enc:v1:'; // marks an encrypted value so decrypt() can detect plaintext

function loadOrCreateKey(dir: string): Buffer {
  const keyPath = join(dir, KEYFILE_NAME);
  if (existsSync(keyPath)) {
    const key = readFileSync(keyPath);
    if (key.length === 32) return key;
    // Wrong size — regenerate (any values encrypted with the old key become
    // unreadable, but a malformed keyfile is unrecoverable anyway).
  }
  const key = randomBytes(32);
  writeFileSync(keyPath, key, { mode: 0o600 });
  try {
    chmodSync(keyPath, 0o600);
  } catch {
    // best-effort on platforms without POSIX permissions
  }
  return key;
}

/**
 * Build an AES-256-GCM cipher whose key is stored in `<dir>/.keyfile`.
 * decrypt() passes through values that lack the encrypted-marker prefix, so
 * databases that already hold plaintext keys keep working (and get
 * re-encrypted the next time the value is saved).
 */
export function createAesCipher(dir: string): Cipher {
  const key = loadOrCreateKey(dir);

  return {
    encrypt(plaintext: string): string {
      const iv = randomBytes(12);
      const cipher = createCipheriv('aes-256-gcm', key, iv);
      const ciphertext = Buffer.concat([
        cipher.update(plaintext, 'utf8'),
        cipher.final(),
      ]);
      const tag = cipher.getAuthTag();
      // Layout: enc:v1:<base64(iv | tag | ciphertext)>
      return ENC_PREFIX + Buffer.concat([iv, tag, ciphertext]).toString('base64');
    },

    decrypt(stored: string): string {
      if (!stored.startsWith(ENC_PREFIX)) {
        // Legacy plaintext value — return as-is.
        return stored;
      }
      const raw = Buffer.from(stored.slice(ENC_PREFIX.length), 'base64');
      const iv = raw.subarray(0, 12);
      const tag = raw.subarray(12, 28);
      const ciphertext = raw.subarray(28);
      const decipher = createDecipheriv('aes-256-gcm', key, iv);
      decipher.setAuthTag(tag);
      return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString(
        'utf8',
      );
    },
  };
}
