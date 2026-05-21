# Local-First Single-User Refactor Plan

## Scope decision (read first)

This plan refactors Agentic Control Tower into a **local-first, single-user** tool that runs on the user's own machine, stores everything in local SQLite, and calls LLM APIs directly using locally-stored keys.

**Recommendation: cut Phase 2/3 stubs from `main` and preserve them on an archive branch.** Rationale: they are skeletons (~37% integrated average), they add maintenance overhead while they don't work, and they obscure the holes in Phase 1. They can be re-introduced one at a time after Phase 1 actually works end-to-end.

If you'd rather keep Phase 2/3 code in place and adapt it instead of cutting, skip Phase 0 and adapt sections 1.3 and 5.4 accordingly.

What stays:
- Multi-provider LLM abstraction (Anthropic, OpenAI, Ollama, LM Studio, Groq, Mistral, Perplexity, Vertex, Bedrock, Azure)
- Agent CRUD + execution
- Session + message persistence
- Usage tracking with real cost calculation
- Dashboard for management and observation
- Context window visualization
- Local Ollama / LM Studio support

What's removed (preserved on `archive/phase-2-3-features` branch):
- Pipelines / orchestration / pipeline executor
- Agent communication / message bus
- Marketplace / agent templates
- Gamification / badges / user stats
- Hive mind / learning
- Plugin system
- JWT/auth scaffolding
- Postgres, Redis, multi-tenant `userId` columns
- Agent versioning, export/import (deferrable, re-add later)

---

## Phase 0: Reset scope ✓

### 0.1 Archive existing code

```bash
git checkout -b archive/phase-2-3-features
git push -u origin archive/phase-2-3-features
git checkout main
```

### 0.2 Delete cut features

Remove these paths from `main`:

- `apps/api/src/core/orchestration/` (entire directory)
- `apps/api/src/core/learning/` (entire directory)
- `apps/api/src/core/plugins/` (entire directory)
- `apps/api/src/routes/pipelines.ts`
- `apps/api/src/routes/marketplace.ts`
- `apps/api/src/routes/gamification.ts`
- `apps/dashboard/src/pages/pipelines.tsx`
- `apps/dashboard/src/pages/marketplace.tsx`
- Any `apps/dashboard/src/components/` files only used by the above pages (audit imports before deleting)

Update `apps/api/src/index.ts`:
- Remove imports for `pipelineRoutes`, `marketplaceRoutes`, `gamificationRoutes`
- Remove their `app.register(...)` calls

Update `apps/dashboard/src/components/layout.tsx` (or wherever nav lives):
- Remove nav entries for Pipelines and Marketplace

Update `packages/types/src/index.ts`:
- Remove `Pipeline`, `PipelineNode`, `PipelineEdge`, `PipelineExecution`, `NodeExecution`
- Remove `AgentTemplate`, `Badge`, `UserStats`
- Leave `ApiResponse`, `PaginatedResponse`, `DashboardMetrics`, `LiveSession`, and all core entity types

### 0.3 Remove multi-tenancy from schema

In `apps/api/src/db/schema.ts`, drop `userId` columns from:
- `sessions`
- `usageRecords`
- `budgetAlerts`

Also drop these tables entirely:
- `pipelines`, `pipelineExecutions`, `nodeExecutions`
- `agentTemplates`
- `userStats`

Replace the `settings` table with a single key/value shape (see Phase 1.3).

### 0.4 Clean env + docker

Remove from `.env.example`:
- `JWT_SECRET`
- `DATABASE_URL` for Postgres (keep an example `DATABASE_URL=file:./data/agentic.db` for SQLite)
- `REDIS_URL`

Update `docker/docker-compose.yml`:
- Remove `postgres` service
- Remove `redis` service
- Remove `prometheus`/`grafana`/`jaeger` services (or keep behind a `monitoring` profile, but they're optional for local)
- Keep `ollama` behind `local-llm` profile
- API service: mount `./data:/app/data` for the SQLite file; remove DB env vars except `DATABASE_URL=file:/app/data/agentic.db`
- Dashboard service: keep, point `NEXT_PUBLIC_API_URL` at the API service

### 0.5 Update docs

Make these three files agree:
- `CLAUDE.md` — set current phase to "Local-first refactor"; status list reflects what actually works
- `README.md` — remove SaaS/multi-tenant framing; describe as a desktop-style local tool. Remove "Phase 3 Coming Soon"; the new phases are the ones in *this* plan
- `PLAN.md` — rename to `PLAN_ORIGINAL.md` (preserve history); this file (`LOCAL_FIRST_PLAN.md`) becomes the active plan

---

## Phase 1: Foundation fixes ✓

### 1.1 Drizzle migrations

Install `drizzle-kit`:

```bash
cd apps/api
pnpm add -D drizzle-kit
```

Create `apps/api/drizzle.config.ts`:

```ts
import type { Config } from 'drizzle-kit';

export default {
  schema: './src/db/schema.ts',
  out: './drizzle',
  dialect: 'sqlite',
  dbCredentials: {
    url: process.env.DATABASE_URL || 'file:./data/agentic.db',
  },
} satisfies Config;
```

Generate the initial migration after Phase 0 schema changes:

```bash
pnpm exec drizzle-kit generate --name init
```

Rewrite `apps/api/src/db/index.ts`:
- Delete the entire raw `sqlite.exec('CREATE TABLE ...')` block (lines 30-189)
- Open the SQLite connection (still `better-sqlite3`)
- Call `migrate(db, { migrationsFolder: './drizzle' })` from `drizzle-orm/better-sqlite3/migrator` at startup
- Ensure `./data/` directory exists before opening the DB file

Add npm scripts to `apps/api/package.json`:

```json
"db:generate": "drizzle-kit generate",
"db:migrate": "drizzle-kit migrate",
"db:studio": "drizzle-kit studio"
```

**Acceptance**: fresh clone → `pnpm install && pnpm dev` creates `./data/agentic.db` with all tables, no manual SQL.

### 1.2 Consolidate types

Establish `packages/types/src/index.ts` as the single source of truth for all entity and protocol types.

Move into the types package (and export from `index.ts`):
- `Tool`, `ToolCall`, `ToolResult` (currently duplicated in `providers/types.ts` and `agents/types.ts`)
- `ChatMessage`, `ChatParams`, `ChatResponse`, `UsageInfo`, `StreamEvent`, `StreamEventType`

Keep in `apps/api/src/core/providers/types.ts`:
- Only the runtime error classes (`LLMError`, `RateLimitError`, `ContextLengthError`, `AuthenticationError`)
- Re-export shared types from `@agentic-os/types`

Shrink `apps/api/src/core/agents/types.ts` to runtime-only:
- `ToolHandler` (function signature with closures over Node APIs)
- `ToolContext`
- Re-export the rest from `@agentic-os/types`

Update imports in:
- All `apps/api/src/core/providers/*.ts`
- `apps/api/src/core/agents/agent-manager.ts`
- `apps/api/src/core/agents/executor.ts`
- `apps/api/src/core/agents/tool-registry.ts`
- All `apps/api/src/routes/*.ts`
- All `apps/dashboard/src/**/*.ts(x)`

**Acceptance**: searching the repo for `interface Tool ` returns one result (in the types package).

### 1.3 Settings storage (key/value, single-user)

Replace the settings table with:

```ts
export const settings = sqliteTable('settings', {
  key: text('key').primaryKey(),
  value: text('value', { mode: 'json' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
});
```

Create `apps/api/src/core/settings/index.ts` with a typed wrapper:

```ts
export type SettingsMap = {
  default_model_id: string;
  provider_api_keys: Record<string, string>; // providerId -> key
  monthly_budget_usd: number;
  ui_preferences: { theme: 'light' | 'dark' | 'system' };
};

export async function getSetting<K extends keyof SettingsMap>(key: K): Promise<SettingsMap[K] | null>;
export async function setSetting<K extends keyof SettingsMap>(key: K, value: SettingsMap[K]): Promise<void>;
export async function getAllSettings(): Promise<Partial<SettingsMap>>;
```

Update `apps/api/src/routes/settings.ts`:
- `GET /api/settings` → `getAllSettings()`
- `GET /api/settings/:key` → `getSetting(key)`
- `PUT /api/settings/:key` → `setSetting(key, body.value)` with validation per key

---

## Phase 2: The core message loop ✓

**Do not start Phase 3 until this phase is fully working.** This is the heart of the product.

### 2.1 Cost calculation

New file `apps/api/src/core/cost/calculate.ts`:

```ts
import type { Model } from '@agentic-os/types';

export function calculateCost(
  model: Pick<Model, 'inputCostPer1M' | 'outputCostPer1M'>,
  inputTokens: number,
  outputTokens: number
): number {
  return (
    (inputTokens * model.inputCostPer1M) / 1_000_000 +
    (outputTokens * model.outputCostPer1M) / 1_000_000
  );
}
```

Unit tests required for this file (it's pure and trivial — perfect first test).

### 2.2 Real token counting

Replace the `length / 4` heuristic in `packages/types/src/context.ts:227`.

```bash
pnpm add gpt-tokenizer
```

Update `countTokens(text: string, model?: string): number`:
- For OpenAI/Anthropic/most models: use `gpt-tokenizer` (close enough for cost estimation; Anthropic-exact tokenization is a Phase 5+ enhancement)
- For Ollama/LM Studio: use the same heuristic (no remote tokenizer)

Document the approximation in a JSDoc comment.

### 2.3 Rewrite the executor

Rewrite `apps/api/src/core/agents/executor.ts` around this signature:

```ts
import type { Message, UsageInfo } from '@agentic-os/types';

export async function executeMessage(params: {
  sessionId: string;
  userMessage: string;
}): Promise<{
  userMessage: Message;
  assistantMessage: Message;
  usage: UsageInfo;
  costUsd: number;
}>;
```

Flow inside `executeMessage`:

1. Load session by id; throw `NotFoundError` if missing or `status !== 'active'`
2. Load the session's agent; throw `NotFoundError` if missing
3. Resolve model: `agent.defaultModelId ?? settings.default_model_id`; throw `ConfigurationError` if neither set
4. Load the model + its provider from DB
5. Look up the API key: `(await getSetting('provider_api_keys'))?.[provider.id]`; throw `AuthenticationError` if missing
6. Load prior messages for the session (ordered, capped to context window)
7. Build `ChatParams`:
   - `system`: agent's system prompt
   - `messages`: prior messages + new user message
   - `tools`: resolved tool definitions from agent's `tools` field
   - `temperature`, `maxTokens`: from agent config with sensible defaults
8. Insert the user message to DB (with `countTokens` estimate) **before** the LLM call so it persists on failure
9. Get the provider instance from `ProviderManager`, initialize with the API key
10. Call `provider.chat(chatParams)`
11. Compute cost via `calculateCost(model, usage.inputTokens, usage.outputTokens)`
12. Insert assistant message with real token counts and cost
13. Insert a row in `usageRecords` (agentId, sessionId, modelId, tokens, cost, timestamp)
14. Update `session.updatedAt`
15. Return

Remove the hardcoded `'claude-3-5-sonnet'` fallback at `executor.ts:48` and `agent-manager.ts:68`.

### 2.4 New endpoint: send a message

In `apps/api/src/routes/sessions.ts`, add:

```ts
app.post('/:sessionId/messages', async (request, reply) => {
  const { sessionId } = request.params as { sessionId: string };
  const body = request.body as { content?: string };

  if (!body.content?.trim()) {
    return reply.code(400).send({
      success: false,
      error: { code: 'INVALID_INPUT', message: 'content is required' },
    });
  }

  const result = await executeMessage({
    sessionId,
    userMessage: body.content,
  });

  return reply.code(201).send({ success: true, data: result });
});
```

Errors propagate to the global error handler (Phase 5.2). Do **not** wrap in try/catch in the route handler.

### 2.5 Strip `userId` from session creation

Update `POST /api/sessions` (`apps/api/src/routes/sessions.ts:44`):
- Body: `{ agentId: string; modelId?: string }`
- Validate that `agentId` exists in DB; 404 if not
- If `modelId` provided, validate it exists; 404 if not
- Insert with no `userId` column

### 2.6 First real test

Set up `vitest` for the API:

```bash
cd apps/api
pnpm add -D vitest
```

Add `"test": "vitest run"` and `"test:watch": "vitest"` to `apps/api/package.json`.

Create `apps/api/test/integration/message-loop.test.ts`:
- Use an in-memory SQLite DB
- Run migrations
- Seed: one provider (Anthropic), one model (with cost > 0), one agent, one session
- Mock `@anthropic-ai/sdk` to return a canned response with known token counts
- Build the Fastify app and `inject` a `POST /api/sessions/:id/messages` request
- Assert: response 201, assistant message saved, `usageRecords` row exists with correct cost

This becomes the first real test and unblocks CI.

**Acceptance for Phase 2**: running the integration test passes, and a manual `curl` from a real Anthropic key returns a real response and persists messages + cost to the DB.

---

## Phase 3: Wire one dashboard page end-to-end ✓

Establish the pattern with one page. Do not touch other pages in this phase.

### 3.1 TanStack Query setup

```bash
cd apps/dashboard
pnpm add @tanstack/react-query
```

Create `apps/dashboard/src/lib/queryClient.ts`:

```ts
import { QueryClient } from '@tanstack/react-query';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});
```

Wrap `_app.tsx` with `<QueryClientProvider client={queryClient}>`.

### 3.2 Real API client

Rewrite `apps/dashboard/src/lib/api.ts`:
- Delete `getDashboardMetrics()`'s mock return value
- Every function returns the API response data, typed via `@agentic-os/types`
- Throws on non-2xx so TanStack Query handles errors
- Base URL from `process.env.NEXT_PUBLIC_API_URL` (default `http://localhost:3000`)

Shape:

```ts
async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...init?.headers },
  });
  if (!res.ok) {
    const error = await res.json().catch(() => ({}));
    throw new ApiError(res.status, error?.error?.message ?? res.statusText);
  }
  return res.json().then((body) => body.data as T);
}

export const api = {
  getAgents: () => request<Agent[]>('/api/agents'),
  createAgent: (input: CreateAgentInput) => request<Agent>('/api/agents', { method: 'POST', body: JSON.stringify(input) }),
  // ...
};
```

### 3.3 Wire the Agents page

Rewrite `apps/dashboard/src/pages/agents.tsx`:
- Delete `mockAgents`
- `const { data: agents, isLoading, error } = useQuery({ queryKey: ['agents'], queryFn: api.getAgents });`
- Loading state: skeleton rows
- Error state: error banner with a retry button (`refetch`)
- Empty state: "No agents yet" with a "Create your first agent" CTA
- Render real agent data in the existing table layout

Add a "Create Agent" modal (new component `apps/dashboard/src/components/create-agent-modal.tsx`):
- Form fields: name, description, system prompt, default model (populated from `useQuery({ queryKey: ['models'], queryFn: api.getModels })`)
- `useMutation` to POST `/api/agents`; on success, invalidate `['agents']` and close

Add a top-of-file comment in `agents.tsx`:

```tsx
// PATTERN: This page is the template for all other dashboard pages.
// 1. useQuery for reads with loading/error/empty states
// 2. useMutation for writes that invalidate the matching query key
// 3. No mock data. No local state for server data.
```

**Acceptance for Phase 3**: load the dashboard, see real agents from the DB; create a new agent in the UI, see it appear in the list and persist after refresh.

---

## Phase 4: Wire the remaining pages ✓

Apply the pattern from Phase 3 to each page. For each: delete mocks, add `useQuery`/`useMutation`, add loading/error/empty states.

### 4.1 Sessions / Monitor

`apps/dashboard/src/pages/monitor.tsx`:
- Delete the `liveSessions` mock and the `setInterval` streaming simulation
- `useQuery({ queryKey: ['sessions', { status: 'active' }], queryFn: () => api.getSessions({ status: 'active' }), refetchInterval: 5_000 })`
- Clicking a session row navigates to `/sessions/[id]`

New page `apps/dashboard/src/pages/sessions/[id].tsx`:
- `useQuery(['session', id, 'messages'], () => api.getMessages(id))`
- Message list (user/assistant bubbles, token + cost per message)
- "Send message" form → `useMutation` → POST `/api/sessions/:id/messages` (Phase 2.4)
- On success, invalidate `['session', id, 'messages']`

Streaming (deferred from Phase 2, do here): add a new API endpoint `POST /api/sessions/:id/messages/stream` returning `text/event-stream` with events `delta`, `usage`, `done`, `error`. Implement only for Anthropic and OpenAI; others return 501. Dashboard consumes via `EventSource`.

### 4.2 Providers

`apps/dashboard/src/pages/providers.tsx`:
- `useQuery(['providers'])` and `useQuery(['models'])`
- Show each provider with a "Configured / Not configured" badge based on whether a key exists in settings
- "Configure" button opens a modal that PUTs to `/api/settings/provider_api_keys`
- "Test connection" button calls a new endpoint `POST /api/providers/:id/test` that does a trivial `chat()` call with the stored key; surfaces success or the error message

### 4.3 Analytics

Backend: add `GET /api/usage/aggregate?groupBy=day&range=7d` that returns daily cost + token totals from `usageRecords`. Also `?groupBy=model` and `?groupBy=agent`.

`apps/dashboard/src/pages/analytics.tsx`:
- `useQuery(['usage', 'daily', '7d'])` → line chart (cost over time)
- `useQuery(['usage', 'by-model'])` → bar chart
- `useQuery(['usage', 'by-agent'])` → bar chart
- Date range picker controls the query key

### 4.4 Settings

`apps/dashboard/src/pages/settings.tsx`:
- `useQuery(['settings'])`
- One form section per setting: default model, monthly budget, theme, provider API keys
- Each save is a `useMutation` to PUT `/api/settings/:key`; invalidates `['settings']`

### 4.5 Dashboard home

`apps/dashboard/src/pages/index.tsx`:
- KPI cards from `useQuery(['usage', 'summary'])` — backend needs a `/api/usage/summary` endpoint returning today/week/month totals + active session count
- Top agents table from `useQuery(['agents', 'top'])` — backend ranks by usage records
- Recent sessions from `useQuery(['sessions', 'recent'])`
- Delete the mock-returning paths in `apps/dashboard/src/lib/api.ts:23` entirely

### 4.6 Context visualizer integration

Wire the existing `apps/dashboard/src/components/context-visualizer.tsx` into the session detail page (Phase 4.1). It should show context window utilization for the current session based on real message tokens.

**Acceptance for Phase 4**: every page in the dashboard renders from real backend data. Searching the dashboard for `mock` returns no application code.

---

## Phase 5: Polish ✓

### 5.1 API key storage shim

The settings table stores provider API keys. For local-first v1, plain JSON in SQLite is acceptable (the user owns the file). Add a one-function indirection so future encryption is a drop-in:

```ts
// apps/api/src/core/settings/cipher.ts
export interface Cipher {
  encrypt(plaintext: string): string;
  decrypt(ciphertext: string): string;
}

export const identityCipher: Cipher = {
  encrypt: (s) => s,
  decrypt: (s) => s,
};
```

`getSetting('provider_api_keys')` runs values through `cipher.decrypt`; `setSetting` runs them through `cipher.encrypt`. v1 uses `identityCipher`; v2 will swap in a keytar-backed cipher.

### 5.2 Global error handler

In `apps/api/src/index.ts`, register a Fastify error handler:

```ts
import { LLMError, RateLimitError, AuthenticationError, ContextLengthError } from './core/providers/types.js';

app.setErrorHandler((err, request, reply) => {
  request.log.error({ err, requestId: request.id }, 'request failed');

  if (err instanceof RateLimitError) {
    return reply.code(429).header('Retry-After', err.retryAfter ?? 60).send({
      success: false,
      error: { code: 'RATE_LIMITED', message: err.message },
    });
  }
  if (err instanceof AuthenticationError) {
    return reply.code(401).send({ success: false, error: { code: 'AUTH_FAILED', message: err.message }});
  }
  if (err instanceof ContextLengthError) {
    return reply.code(413).send({ success: false, error: { code: 'CONTEXT_TOO_LONG', message: err.message }});
  }
  if (err instanceof LLMError) {
    return reply.code(502).send({ success: false, error: { code: 'LLM_ERROR', message: err.message }});
  }
  if (err.validation) {
    return reply.code(400).send({ success: false, error: { code: 'VALIDATION', message: err.message, details: err.validation }});
  }
  return reply.code(500).send({
    success: false,
    error: { code: 'INTERNAL', message: 'Internal server error', requestId: request.id },
  });
});
```

Remove try/catch + manual error responses from every route handler. Let errors throw.

Add custom error classes for `NotFoundError`, `ConfigurationError`, `InvalidInputError` in `apps/api/src/core/errors.ts` and handle them in the same error handler.

### 5.3 OpenTelemetry instrumentation

Add custom spans (use the SDK already initialized in `apps/api/src/telemetry/`):

- In `executor.ts:executeMessage` — span `agent.execute`, attributes: `agent.id`, `model.id`, `provider.id`, `session.id`, `cost.usd`, `tokens.input`, `tokens.output`
- In each provider's `chat()` — span `llm.chat`, attributes: `model.id`, `tokens.input`, `tokens.output`, `latency.ms`
- In tool invocations — span `tool.invoke`, attributes: `tool.id`, `duration.ms`, `error` (boolean)

Default exporter: console (no infra needed for local). OTLP exporter configurable via `OTEL_EXPORTER_OTLP_ENDPOINT` env var.

### 5.4 First-run onboarding

On dashboard load, fetch `/api/settings`. If no provider API keys are configured, redirect to `/onboarding`.

New page `apps/dashboard/src/pages/onboarding.tsx`:
1. Step 1: Pick at least one provider. Show all 10 with logo + name + "I have a key" / "I'll use local (Ollama/LM Studio)"
2. Step 2: For each selected cloud provider, paste API key. For Ollama, detect local server at `http://localhost:11434` and pull available models.
3. Step 3: Pick a default model from configured providers
4. Step 4: Save settings, redirect to `/`

After onboarding, "fresh clone to first working agent" should be ≤5 minutes.

### 5.5 CI passes

- `apps/api/test/integration/message-loop.test.ts` already created in Phase 2.6
- Add `apps/api/test/unit/cost.test.ts` (Phase 2.1)
- Add `apps/dashboard/test/agents-page.test.tsx` using `@testing-library/react` — asserts loading, empty, error, and populated states render correctly with a mocked QueryClient

Verify all four CI jobs (`lint`, `typecheck`, `test`, `build`) pass on a fresh clone.

### 5.6 Sync docs (final pass)

- `CLAUDE.md` — update status to reflect what's actually working after Phase 4
- `README.md` — quickstart: clone → `pnpm install` → `pnpm dev` → onboarding → first agent. Screenshot if possible.
- This file (`LOCAL_FIRST_PLAN.md`) — mark phases as ✓ as you complete them. When all five phases are ✓, the v1 product is done.

---

## Definition of done

The user can:

1. Clone the repo, run `pnpm install`, then `pnpm dev`
2. Open the dashboard, complete onboarding, paste an Anthropic API key
3. Create an agent with a name and system prompt via the dashboard UI
4. Start a session with that agent
5. Send a message and see a real response from Claude in the session view
6. See the response message, token counts, and cost recorded
7. See aggregate usage and cost trends on the analytics page
8. Reconfigure the default model via the settings page
9. All four CI jobs pass on `main`

If all nine work, v1 ships. Phase 2/3 features (pipelines, marketplace, hive mind, plugins) can then be re-introduced from `archive/phase-2-3-features` one at a time, each with the same integration bar: real backend wiring, real dashboard wiring, real tests.

---

## Execution order summary

| Phase | Goal | Touches |
|-------|------|---------|
| 0 | Scope reset | Deletes, archive branch, schema cleanup, docker, env |
| 1 | Foundation | Drizzle migrations, type consolidation, settings key/value |
| 2 | Core loop | Cost calc, real tokenizer, executor rewrite, message endpoint, first test |
| 3 | One page wired | TanStack Query, real API client, Agents page as pattern |
| 4 | All pages wired | Monitor + session detail + streaming, Providers, Analytics, Settings, Home |
| 5 | Polish | API key shim, error handler, OTEL spans, onboarding, more tests, docs |

Do not skip ahead. Each phase has acceptance criteria that the next phase depends on.
