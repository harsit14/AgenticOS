import { eq } from 'drizzle-orm';
import { db } from '../../db/index.js';
import { settings } from '../../db/schema.js';
import { getCipher } from './cipher.js';

export type SettingsMap = {
  default_model_id: string;
  provider_api_keys: Record<string, string>;
  monthly_budget_usd: number;
  ui_preferences: { theme: 'light' | 'dark' | 'system' };
};

export type SettingKey = keyof SettingsMap;

const SENSITIVE_KEYS: ReadonlySet<SettingKey> = new Set(['provider_api_keys']);

function encryptForStorage<K extends SettingKey>(key: K, value: SettingsMap[K]): unknown {
  if (key === 'provider_api_keys') {
    const cipher = getCipher();
    const out: Record<string, string> = {};
    for (const [provider, plain] of Object.entries(value as Record<string, string>)) {
      out[provider] = cipher.encrypt(plain);
    }
    return out;
  }
  return value;
}

function decryptFromStorage<K extends SettingKey>(key: K, value: unknown): SettingsMap[K] {
  if (key === 'provider_api_keys') {
    const cipher = getCipher();
    const stored = (value ?? {}) as Record<string, string>;
    const out: Record<string, string> = {};
    for (const [provider, ciphertext] of Object.entries(stored)) {
      out[provider] = cipher.decrypt(ciphertext);
    }
    return out as SettingsMap[K];
  }
  return value as SettingsMap[K];
}

export async function getSetting<K extends SettingKey>(key: K): Promise<SettingsMap[K] | null> {
  const row = await db.select().from(settings).where(eq(settings.key, key)).get();
  if (!row) return null;
  return decryptFromStorage(key, row.value);
}

export async function setSetting<K extends SettingKey>(key: K, value: SettingsMap[K]): Promise<void> {
  const stored = encryptForStorage(key, value);
  const now = new Date();
  const existing = await db.select().from(settings).where(eq(settings.key, key)).get();
  if (existing) {
    await db.update(settings).set({ value: stored, updatedAt: now }).where(eq(settings.key, key)).run();
  } else {
    await db.insert(settings).values({ key, value: stored, updatedAt: now }).run();
  }
}

export async function deleteSetting(key: SettingKey): Promise<void> {
  await db.delete(settings).where(eq(settings.key, key)).run();
}

export async function getAllSettings(): Promise<Partial<SettingsMap>> {
  const rows = await db.select().from(settings).all();
  const out: Partial<SettingsMap> = {};
  for (const row of rows) {
    const key = row.key as SettingKey;
    (out as Record<string, unknown>)[key] = decryptFromStorage(key, row.value);
  }
  return out;
}

export function isSensitiveKey(key: SettingKey): boolean {
  return SENSITIVE_KEYS.has(key);
}
