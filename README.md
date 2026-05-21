# Agentic Control Tower

A **local-first, single-user** desktop-style tool for creating, monitoring, and running AI agents across multiple LLM providers. Everything lives on your machine — SQLite for state, your API keys in the local settings store, direct calls to whichever provider you point it at.

## What it does

- Multi-provider LLM access: Anthropic, OpenAI, Azure, Vertex, Bedrock, Ollama, LM Studio, Groq, Perplexity, Mistral
- Agent CRUD with persona, tools, and memory strategy
- Session + message persistence to SQLite
- Usage tracking with real cost per call
- Dashboard for managing agents, watching sessions, and reviewing spend
- Context window utilization visualizer
- First-class local-model support via Ollama / LM Studio

## What it doesn't do (yet)

Phase 2/3 features from the original plan — pipelines, agent marketplace, hive mind, plugin system, gamification — are intentionally out of scope for v1 and preserved on `archive/phase-2-3-features`. They will be reintroduced one at a time once the core message loop is solid.

## Tech stack

| Layer | Technology |
|-------|------------|
| Backend | Node.js, TypeScript, Fastify |
| Frontend | Next.js 14, React, Tailwind CSS |
| Database | SQLite (via better-sqlite3) |
| ORM | Drizzle ORM |
| Tracing | OpenTelemetry (optional, OTLP) |

## Quick start

```bash
pnpm install
cp .env.example .env
pnpm dev
```

Open `http://localhost:3000`, complete onboarding (paste a provider API key or point at a local Ollama), and create your first agent.

## Layout

```
agentic-os/
├── apps/
│   ├── api/          # Fastify backend (executor, providers, routes)
│   └── dashboard/    # Next.js frontend
├── packages/
│   └── types/        # Shared TypeScript types
├── docker/           # Optional containerized deployment
├── LOCAL_FIRST_PLAN.md  # Active build plan
└── PLAN_ORIGINAL.md     # Original multi-tenant plan (historical)
```

## Scripts

```bash
pnpm dev         # Run API + dashboard
pnpm build       # Build all packages
pnpm lint        # Lint all packages
pnpm typecheck   # Type-check all packages
pnpm test        # Run tests
```

API-only scripts (run from `apps/api/`):

```bash
pnpm db:generate # Generate a new Drizzle migration from schema.ts
pnpm db:migrate  # Apply pending migrations
pnpm db:studio   # Open Drizzle Studio
```

## Adding a new LLM provider

1. Implement the `LLMProvider` interface in `apps/api/src/core/providers/`.
2. Register the class in `ProviderManager` (`apps/api/src/core/providers/index.ts`).
3. Add provider + model rows to the seed data in `apps/api/src/db/seed.ts`.

## License

MIT
