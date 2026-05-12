# Agentic Control Tower

A unified platform for creating, monitoring, and orchestrating AI agents across multiple LLM providers. Built with TypeScript, Fastify, Next.js, and Drizzle ORM.

## Features

### Phase 1: Foundation

#### Multi-Provider LLM Support
- **10 LLM Providers**: Anthropic (Claude), OpenAI (GPT-4), Azure OpenAI, Google Vertex AI (Gemini), AWS Bedrock, Ollama (local), LM Studio (local), Groq, Perplexity, Mistral
- Unified provider interface with consistent error handling
- Token counting and cost estimation per model
- Rate limiting per provider with token bucket algorithm
- Streaming support for real-time responses

#### Agent System
- Create and configure AI agents with custom personas
- **4 tone presets**: Professional, Casual, Technical, Creative
- System prompt editor with variable support
- Configurable memory strategies: Sliding Window, Summary, Full
- Tool registry with built-in tools (Calculator, Web Search, Code Interpreter, HTTP Request, File Read/Write)
- Rate limiting per agent

#### Observability
- **OpenTelemetry** integration for distributed tracing
- Custom spans for LLM calls, agent execution, tool execution
- Prometheus metrics endpoint
- Grafana dashboard configuration included
- Request/response tracking with cost and latency

#### Analytics Dashboard
- Real-time usage monitoring
- Cost tracking by agent, model, and time period
- Token usage breakdown with pie charts
- Budget alerts with threshold notifications
- Session monitoring with live streaming

#### Export/Import
- Export agent configurations to JSON
- Import configurations with schema validation
- Version history with rollback capability
- Bulk export/import for multiple agents

### Phase 2: Orchestration

#### Agent Topology Canvas
- Visual pipeline builder with drag-and-drop interface
- **7 node types**: Input, Agent, Condition, Delay, Merge, Split, Output
- Grid snap and zoom controls
- Pre-built templates: Sequential, Parallel, Conditional
- Pipeline validation (cycle detection, orphaned nodes)
- Real-time execution visualization

#### Cross-Agent Communication
- Agent-to-agent messaging with pub/sub pattern
- Shared context store per pipeline
- Sequential and parallel execution patterns
- Conditional branching logic
- Loop handling with max iterations
- Error propagation between agents
- Timeout handling

#### Agent Marketplace
- Browse and install pre-built agent templates
- Search by name, filter by category
- Rating and review system
- Template forking and customization
- Submit templates for community curation
- Install count tracking

#### Gamification
- **18 badges** across 6 categories (tokens saved, cost reduction, streaks, tasks completed, agents created)
- Badge tiers: Bronze, Silver, Gold, Platinum
- Leaderboard with rank calculation
- Streak tracking (consecutive usage days)
- Cost savings dashboard with before/after comparison
- Level and points system

### Phase 3: OS-Level Features (Coming Soon)

- Local-first deployment with Docker Compose
- Context window visualization with memory pressure indicators
- Cross-agent learning (Hive Mind) with pattern detection
- Plugin architecture for extensibility

## Tech Stack

| Layer | Technology |
|-------|------------|
| Backend | Node.js, TypeScript, Fastify |
| Frontend | Next.js 14, React, Tailwind CSS |
| Database | SQLite (dev), PostgreSQL (prod) |
| ORM | Drizzle ORM |
| State | Zustand (frontend) |
| Monitoring | OpenTelemetry, Prometheus, Grafana |
| LLM Providers | Anthropic, OpenAI, Azure, Vertex, Bedrock, Ollama, LM Studio, Groq, Perplexity, Mistral |

## Quick Start

```bash
# Install dependencies
pnpm install

# Copy environment variables
cp .env.example .env

# Start development
pnpm dev

# Or use Docker Compose
cd docker && docker-compose up
```

## Project Structure

```
agentic-os/
├── apps/
│   ├── api/                    # Node.js/TypeScript backend
│   │   └── src/
│   │       ├── core/           # Provider abstraction, agent engine, orchestration
│   │       ├── routes/         # API endpoints
│   │       ├── db/             # Schema, migrations
│   │       └── telemetry/      # OpenTelemetry setup
│   └── dashboard/              # Next.js frontend
│       └── src/
│           ├── components/     # UI components
│           ├── pages/          # Next.js pages
│           ├── stores/         # Zustand stores
│           └── lib/            # Utilities, API client
├── packages/
│   └── types/                  # Shared TypeScript types
├── docker/                      # Docker compose files
├── PLAN.md                     # Full build plan
└── README.md
```

## Available Scripts

```bash
pnpm dev           # Start all services
pnpm build         # Build all packages
pnpm lint          # Lint all packages
pnpm typecheck     # Type check all packages

# Database
pnpm db:generate   # Generate migrations
pnpm db:migrate    # Run migrations
pnpm db:push       # Push schema to database
pnpm db:studio     # Open Drizzle Studio
```

## Dashboard Pages

| Page | Path | Description |
|------|------|-------------|
| Dashboard | `/` | Overview with KPIs, cost charts, top agents |
| Agents | `/agents` | Create, manage, and configure agents |
| Pipelines | `/pipelines` | Visual pipeline builder for orchestration |
| Marketplace | `/marketplace` | Browse and install agent templates |
| Live Monitor | `/monitor` | Real-time session monitoring |
| Providers | `/providers` | Manage LLM providers and models |
| Analytics | `/analytics` | Usage analytics and cost breakdown |
| Settings | `/settings` | API keys, budget alerts, preferences |

## API Endpoints

### Providers
- `GET /api/providers` - List all providers
- `GET /api/providers/:id` - Get provider details
- `POST /api/providers` - Create provider
- `PUT /api/providers/:id` - Update provider

### Models
- `GET /api/models` - List all models
- `GET /api/models/:id` - Get model details

### Agents
- `GET /api/agents` - List all agents
- `GET /api/agents/:id` - Get agent details
- `POST /api/agents` - Create agent
- `PUT /api/agents/:id` - Update agent
- `DELETE /api/agents/:id` - Delete agent
- `GET /api/agents/:id/versions` - Get version history
- `POST /api/agents/:id/rollback` - Rollback to version
- `GET /api/agents/:id/export` - Export agent config
- `POST /api/agents/import` - Import agent config

### Sessions
- `GET /api/sessions` - List sessions
- `POST /api/sessions` - Create session
- `GET /api/sessions/:id` - Get session details

### Pipelines
- `GET /api/pipelines` - List all pipelines
- `POST /api/pipelines` - Create pipeline
- `PUT /api/pipelines/:id` - Update pipeline
- `POST /api/pipelines/:id/execute` - Execute pipeline
- `GET /api/pipelines/:id/executions` - Get execution history
- `GET /api/pipelines/templates` - Get template list

### Marketplace
- `GET /api/marketplace/templates` - List templates
- `POST /api/marketplace/templates/:id/install` - Install template
- `POST /api/marketplace/templates/:id/rate` - Rate template
- `POST /api/marketplace/templates/from-agent/:id` - Create from agent

### Gamification
- `GET /api/gamification/:userId/stats` - Get user stats
- `GET /api/gamification/leaderboard` - Get leaderboard
- `GET /api/gamification/badges` - List all badges

### Metrics
- `GET /api/metrics` - Prometheus metrics endpoint

## Adding a New LLM Provider

1. Create provider class in `apps/api/src/core/providers/`
2. Implement `LLMProvider` interface from `types.ts`
3. Register in `ProviderManager` in `apps/api/src/core/providers/index.ts`
4. Add model pricing to seed data

## Environment Variables

See `.env.example` for all configuration options.

## License

MIT