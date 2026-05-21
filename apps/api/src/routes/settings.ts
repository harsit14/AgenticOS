import type { FastifyInstance } from 'fastify';
import { eq } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { db } from '../db/index.js';
import { budgetAlerts } from '../db/schema.js';
import {
  getAllSettings,
  getSetting,
  setSetting,
  deleteSetting,
  isSensitiveKey,
  type SettingKey,
  type SettingsMap,
} from '../core/settings/index.js';

const KNOWN_KEYS: ReadonlySet<SettingKey> = new Set([
  'default_model_id',
  'provider_api_keys',
  'monthly_budget_usd',
  'ui_preferences',
]);

function isKnownKey(key: string): key is SettingKey {
  return KNOWN_KEYS.has(key as SettingKey);
}

function validateValue<K extends SettingKey>(key: K, value: unknown): SettingsMap[K] {
  switch (key) {
    case 'default_model_id': {
      if (typeof value !== 'string' || value.length === 0) {
        throw new Error('default_model_id must be a non-empty string');
      }
      return value as SettingsMap[K];
    }
    case 'provider_api_keys': {
      if (value === null || typeof value !== 'object' || Array.isArray(value)) {
        throw new Error('provider_api_keys must be an object of provider→key');
      }
      for (const v of Object.values(value as Record<string, unknown>)) {
        if (typeof v !== 'string') throw new Error('provider_api_keys values must be strings');
      }
      return value as SettingsMap[K];
    }
    case 'monthly_budget_usd': {
      if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
        throw new Error('monthly_budget_usd must be a non-negative number');
      }
      return value as SettingsMap[K];
    }
    case 'ui_preferences': {
      if (value === null || typeof value !== 'object') {
        throw new Error('ui_preferences must be an object');
      }
      const theme = (value as { theme?: unknown }).theme;
      if (theme !== 'light' && theme !== 'dark' && theme !== 'system') {
        throw new Error('ui_preferences.theme must be light|dark|system');
      }
      return value as SettingsMap[K];
    }
    default:
      throw new Error(`Unknown setting key: ${key as string}`);
  }
}

// Redact sensitive values for index/list endpoints — return key presence, not the key itself.
function redactForRead<K extends SettingKey>(key: K, value: SettingsMap[K]): unknown {
  if (key === 'provider_api_keys') {
    return Object.fromEntries(
      Object.entries(value as Record<string, string>).map(([k]) => [k, '***configured***']),
    );
  }
  return value;
}

export async function settingsRouter(app: FastifyInstance) {
  // GET /api/settings — all settings (sensitive values redacted)
  app.get('/', async () => {
    const all = await getAllSettings();
    const out: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(all)) {
      out[key] = isSensitiveKey(key as SettingKey)
        ? redactForRead(key as SettingKey, value as never)
        : value;
    }
    return { success: true, data: out };
  });

  // GET /api/settings/:key — single setting (sensitive values redacted)
  app.get<{ Params: { key: string } }>('/:key', async (request, reply) => {
    const { key } = request.params;
    if (!isKnownKey(key)) {
      return reply.code(404).send({
        success: false,
        error: { code: 'NOT_FOUND', message: `Unknown setting key: ${key}` },
      });
    }
    const value = await getSetting(key);
    if (value === null) {
      return reply.code(404).send({
        success: false,
        error: { code: 'NOT_FOUND', message: `Setting not set: ${key}` },
      });
    }
    const out = isSensitiveKey(key) ? redactForRead(key, value as never) : value;
    return reply.send({ success: true, data: out });
  });

  // PUT /api/settings/:key — write a setting.
  // For provider_api_keys, the incoming value is merged with what's already
  // stored: keys present in the body overwrite or add entries; keys absent
  // from the body are preserved. Set a key to an empty string to clear it.
  app.put<{ Params: { key: string }; Body: { value: unknown } }>('/:key', async (request, reply) => {
    const { key } = request.params;
    if (!isKnownKey(key)) {
      return reply.code(400).send({
        success: false,
        error: { code: 'INVALID_KEY', message: `Unknown setting key: ${key}` },
      });
    }
    const body = request.body;
    if (!body || typeof body !== 'object' || !('value' in body)) {
      return reply.code(400).send({
        success: false,
        error: { code: 'INVALID_INPUT', message: 'Body must be { value: ... }' },
      });
    }

    try {
      const validated = validateValue(key, body.value);

      if (key === 'provider_api_keys') {
        const existing = (await getSetting('provider_api_keys')) ?? {};
        const merged: Record<string, string> = { ...existing };
        for (const [providerId, value] of Object.entries(
          validated as Record<string, string>,
        )) {
          if (value === '') {
            delete merged[providerId];
          } else {
            merged[providerId] = value;
          }
        }
        await setSetting('provider_api_keys', merged);
      } else {
        // Key is narrowed to a non-provider_api_keys variant here; the typed
        // wrapper requires the value type matches the key, which it does by
        // construction (validateValue returns SettingsMap[K]).
        await setSetting(
          key as Exclude<SettingKey, 'provider_api_keys'>,
          validated as never,
        );
      }

      return reply.send({ success: true, data: { key, saved: true } });
    } catch (err) {
      return reply.code(400).send({
        success: false,
        error: { code: 'VALIDATION', message: (err as Error).message },
      });
    }
  });

  // DELETE /api/settings/:key — clear a setting
  app.delete<{ Params: { key: string } }>('/:key', async (request, reply) => {
    const { key } = request.params;
    if (!isKnownKey(key)) {
      return reply.code(404).send({
        success: false,
        error: { code: 'NOT_FOUND', message: `Unknown setting key: ${key}` },
      });
    }
    await deleteSetting(key);
    return reply.send({ success: true, data: { key, deleted: true } });
  });

  // GET /api/settings/budget — list budget alerts (single-user)
  app.get('/budget', async () => {
    const alerts = await db.select().from(budgetAlerts).all();
    return { success: true, data: alerts };
  });

  // POST /api/settings/budget — create or update budget alert
  app.post<{ Body: { type: string; limitUsd: number } }>('/budget', async (request, reply) => {
    const { type, limitUsd } = request.body;
    if (!['daily', 'weekly', 'monthly', 'threshold'].includes(type)) {
      return reply.code(400).send({
        success: false,
        error: { code: 'INVALID_INPUT', message: 'type must be daily|weekly|monthly|threshold' },
      });
    }
    if (typeof limitUsd !== 'number' || limitUsd < 0) {
      return reply.code(400).send({
        success: false,
        error: { code: 'INVALID_INPUT', message: 'limitUsd must be a non-negative number' },
      });
    }

    const now = new Date();
    const existing = (await db.select().from(budgetAlerts).all()).find(
      (r) => r.type === type,
    );

    if (existing) {
      await db
        .update(budgetAlerts)
        .set({ limitUsd, updatedAt: now })
        .where(eq(budgetAlerts.id, existing.id))
        .run();
      return reply.send({ success: true, data: { id: existing.id, limitUsd } });
    }

    const id = nanoid();
    await db
      .insert(budgetAlerts)
      .values({
        id,
        type: type as 'daily' | 'weekly' | 'monthly' | 'threshold',
        limitUsd,
        currentSpend: 0,
        status: 'active',
        createdAt: now,
        updatedAt: now,
      })
      .run();
    return reply.code(201).send({ success: true, data: { id, limitUsd } });
  });

  // DELETE /api/settings/budget/:alertId
  app.delete<{ Params: { alertId: string } }>('/budget/:alertId', async (request) => {
    const { alertId } = request.params;
    await db.delete(budgetAlerts).where(eq(budgetAlerts.id, alertId)).run();
    return { success: true, data: { deleted: true, id: alertId } };
  });
}
