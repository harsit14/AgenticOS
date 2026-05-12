# Agentic Control Tower

## Overview
Agentic Control Tower is a unified platform for creating, monitoring, and orchestrating AI agents across multiple LLM providers. Built with TypeScript, Fastify, Next.js, and Drizzle ORM.

## Current Phase
**Step 1: Project Structure & Tech Stack** - in progress

## Project Structure
- `apps/api/` - Node.js/TypeScript backend with Fastify
- `apps/dashboard/` - Next.js frontend with React
- `packages/types/` - Shared TypeScript types
- `docker/` - Docker Compose for deployment

## Key Technologies
- **API**: Fastify, Drizzle ORM, OpenTelemetry
- **Dashboard**: Next.js 14, Tailwind CSS, Zustand, Recharts
- **Database**: SQLite (dev), PostgreSQL (prod)
- **Providers**: Anthropic, OpenAI, Azure, Vertex, Bedrock, Ollama, LM Studio, Groq, Perplexity, Mistral

## Build Plan
See [PLAN.md](./PLAN.md) for detailed 16-step implementation plan across 3 phases.

## Status
- [x] Monorepo structure with pnpm workspaces
- [x] TypeScript configurations
- [x] ESLint + Prettier setup
- [x] GitHub Actions CI pipeline
- [x] Docker Compose for local-first deployment
- [x] Shared types package
- [ ] API entry point (in progress)
- [ ] Database schema
- [ ] Provider abstraction layer
- [ ] Dashboard UI

## Next Steps
1. Complete Step 1 with API entry point and basic route files
2. Move to Step 2: Data Model Design (Drizzle schema)
3. Then Step 3: LLM Provider Abstraction Layer