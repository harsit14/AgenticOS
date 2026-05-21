# Agentic Control Tower

## Overview
Local-first, single-user tool for creating and running AI agents across multiple LLM providers. Everything runs on the user's machine: SQLite for state, provider API keys in the local settings store, direct calls to the LLM provider.

## Current Phase
**Local-first v1 shipping** — all six phases of [LOCAL_FIRST_PLAN.md](./LOCAL_FIRST_PLAN.md) (0 through 5) are complete. Original multi-tenant plan archived as [PLAN_ORIGINAL.md](./PLAN_ORIGINAL.md). Phase 2/3 features (pipelines, marketplace, hive mind, plugins, gamification) live on the `archive/phase-2-3-features` branch and can be re-introduced one at a time once anyone wants them.

## Project Structure
- `apps/api/` — Fastify backend with the agent executor, provider abstraction, and routes
- `apps/dashboard/` — Next.js dashboard for managing agents and watching sessions
- `packages/types/` — Shared TypeScript types
- `docker/` — Optional Docker Compose for containerized local deployment

## Key Technologies
- **API**: Fastify, Drizzle ORM, better-sqlite3, OpenTelemetry (optional)
- **Dashboard**: Next.js 14, Tailwind CSS, Recharts (TanStack Query coming in Phase 3)
- **Database**: SQLite — single file on disk, no external services
- **Providers**: Anthropic, OpenAI, Azure, Vertex, Bedrock, Ollama, LM Studio, Groq, Perplexity, Mistral

## Build Plan
See [LOCAL_FIRST_PLAN.md](./LOCAL_FIRST_PLAN.md) for the 6-phase refactor (Phase 0 reset → Phase 5 polish).

## Status
- [x] Monorepo structure with pnpm workspaces
- [x] TypeScript configurations
- [x] ESLint + Prettier setup
- [x] GitHub Actions CI pipeline
- [x] Docker Compose (local-first, no Postgres/Redis)
- [x] Shared types package
- [x] Phase 0: Scope reset complete (orchestration/marketplace/gamification/plugins/hive-mind removed; multi-tenancy stripped)
- [x] Phase 1: Drizzle migrations, type consolidation, settings key/value store
- [x] Phase 2: Cost calculation, real tokenizer (gpt-tokenizer), executor rewrite, integration test passes
- [x] Phase 3: Agents page wired end-to-end via TanStack Query (real `useQuery`/`useMutation`, no mocks)
- [x] Phase 4: All dashboard pages wired — Monitor, Session detail (chat + context visualizer), Providers (with test-connection), Analytics, Settings, Home. No mock data anywhere in the dashboard
- [x] Phase 5: Polish — cipher shim, global Fastify error handler, OTEL spans on `agent.execute` / `llm.chat` / `tool.invoke`, three-step onboarding page that gates `/` on having at least one provider key, agents-page test, all four CI jobs green (lint / typecheck / test / build)

## Conventions
- New API code throws typed errors from `apps/api/src/core/errors.ts` (`NotFoundError`, `ConfigurationError`, `InvalidInputError`) or the provider error classes; the global error handler maps each to its HTTP code. Don't add try/catch in route handlers unless you need to recover.
- New dashboard pages: `useQuery` for reads with loading/error/empty states, `useMutation` for writes that invalidate the matching query key. See [agents.tsx](apps/dashboard/src/pages/agents.tsx) for the pattern.
- Legacy provider files (`groq.ts`, `vertex.ts`, `ollama.ts`, etc.) carry `// @ts-nocheck` markers and need a clean port — listed in [apps/api/tsconfig.json](apps/api/tsconfig.json).
