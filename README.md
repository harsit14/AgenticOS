# Agentic Control Tower - Development Guide

## Quick Start

```bash
# Install dependencies
pnpm install

# Copy environment variables
cp .env.example .env

# Start development (requires Ollama for local models)
pnpm dev
```

## Project Structure

```
agentic-os/
├── apps/
│   ├── api/              # Node.js/TypeScript backend
│   │   ├── src/
│   │   │   ├── core/     # Provider abstraction, agent engine
│   │   │   ├── routes/   # API endpoints
│   │   │   ├── db/       # Schema, migrations
│   │   │   ├── telemetry/# OpenTelemetry setup
│   │   │   └── index.ts  # Entry point
│   │   └── package.json
│   └── dashboard/        # Next.js frontend
│       ├── src/
│       │   ├── components/
│       │   ├── pages/
│       │   ├── stores/
│       │   └── lib/
│       └── package.json
├── packages/
│   └── types/            # Shared TypeScript types
├── docker/               # Docker compose
└── PLAN.md              # Full build plan
```

## Commands

```bash
pnpm dev           # Start all services
pnpm build         # Build all packages
pnpm lint          # Lint all packages
pnpm typecheck     # Type check all packages
pnpm test          # Run tests

# Database
pnpm db:generate   # Generate migrations
pnpm db:migrate    # Run migrations
pnpm db:push       # Push schema to database
pnpm db:studio     # Open Drizzle Studio
```

## API Endpoints

- `GET /health` - Health check
- `GET /api/providers` - List providers
- `GET /api/models` - List models
- `GET /api/agents` - List agents
- `POST /api/agents` - Create agent
- `GET /api/sessions` - List sessions
- `POST /api/sessions` - Create session
- `GET /api/usage` - Usage analytics

## Adding a New Provider

1. Create provider class in `apps/api/src/core/providers/`
2. Implement `LLMProvider` interface
3. Register in `apps/api/src/core/providers/index.ts`
4. Add to seed data in `apps/api/src/db/seed.ts`

## Environment Variables

See `.env.example` for all configuration options.