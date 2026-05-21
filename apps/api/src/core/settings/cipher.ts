// Indirection for at-rest encryption of sensitive settings (e.g. provider API keys).
// v1 uses the identity cipher — values are stored plain in the local SQLite file,
// which the user owns. A future iteration can swap in a keytar-backed cipher
// without changing call sites.

export interface Cipher {
  encrypt(plaintext: string): string;
  decrypt(ciphertext: string): string;
}

export const identityCipher: Cipher = {
  encrypt: (s) => s,
  decrypt: (s) => s,
};

let activeCipher: Cipher = identityCipher;

export function setCipher(cipher: Cipher): void {
  activeCipher = cipher;
}

export function getCipher(): Cipher {
  return activeCipher;
}
