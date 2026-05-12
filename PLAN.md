# Agentic Control Tower — Build Plan

## Vision

A unified platform for creating, monitoring, and orchestrating AI agents across multiple LLM providers. Built for teams who want visibility, control, and efficiency in their AI workflows. Launch as **Agentic Control Tower**, evolve toward full orchestration, then OS-level features as real usage patterns emerge.

---

## Phase 1: Agentic Control Tower (Foundation)

### Step 1: Project Structure & Tech Stack

**Stack Choices:**
- **Backend:** Node.js with TypeScript (unified language, strong typing, good ecosystem)
- **Frontend:** Next.js 14+ with React, TypeScript, Tailwind CSS
- **Database:** SQLite for local/dev (easy setup), Postgres for production
- **ORM:** Drizzle ORM (type-safe, lightweight)
- **State Management:** Zustand (frontend), simple in-memory stores (backend)
- **Real-time:** Server-Sent Events (SSE) for streaming, Socket.io for dashboard updates
- **Monitoring:** OpenTelemetry SDK for tracing

**Directory Structure:**
```
agentic-os/
├── apps/
│   ├── api/                  # Node.js/TypeScript backend
│   │   ├── src/
│   │   │   ├── core/          # Provider abstraction, agent engine
│   │   │   ├── routes/        # API endpoints
│   │   │   ├── db/            # Schema, migrations
│   │   │   ├── telemetry/     # OpenTelemetry setup
│   │   │   └── index.ts       # Entry point
│   │   └── package.json
│   └── dashboard/             # Next.js frontend
│       ├── src/
│       │   ├── components/    # UI components
│       │   ├── pages/        # Next.js pages
│       │   ├── stores/       # Zustand stores
│       │   └── lib/          # Utilities, API client
│       └── package.json
├── packages/
│   └── types/                # Shared TypeScript types
├── docker/                   # Docker compose for local-first
├── CLAUDE.md                 # This file
└── README.md
```

**Deliverables:**
- [ ] Initialize monorepo with pnpm workspaces
- [ ] Set up TypeScript configs (root + per-package)
- [ ] Configure ESLint and Prettier
- [ ] Set up GitHub Actions CI/CD pipeline
- [ ] Environment variable template (.env.example)

---

### Step 2: Data Model Design

**Core Entities:**

```
Provider
├── id: string (uuid)
├── name: string (e.g., "Anthropic", "OpenAI", "Ollama")
├── baseUrl: string
├── apiKeyEnvVar: string (e.g., "ANTHROPIC_API_KEY")
├── isLocal: boolean (true for Ollama, LM Studio)
├── status: "active" | "inactive"
└── createdAt, updatedAt: timestamp

Model
├── id: string
├── providerId: FK -> Provider
├── name: string (e.g., "claude-3-5-sonnet")
├── displayName: string
├── contextWindow: number (tokens)
├── inputCostPer1M: number (USD)
├── outputCostPer1M: number
├── supportsStreaming: boolean
├── supportsVision: boolean
├── supportsFunctionCalling: boolean
├── status: "active" | "beta" | "deprecated"
└── metadata: jsonb (provider-specific)

Agent
├── id: string
├── name: string
├── description: string
├── persona: jsonb
│   ├── tone: "professional" | "casual" | "technical"
│   ├── systemPrompt: string
│   ├── temperature: number
│   ├── maxTokens: number
│   └── knowledgeBases: string[]
├── tools: jsonb (registered tool definitions)
├── defaultModelId: FK -> Model
├── fallbackModelId: FK -> Model (optional)
├── memoryConfig: jsonb
├── rateLimit: number (requests per minute)
├── createdBy: string (user ID)
├── isTemplate: boolean
├── tags: string[]
└── createdAt, updatedAt

Session
├── id: string
├── agentId: FK -> Agent
├── userId: string
├── modelId: FK -> Model
├── status: "active" | "completed" | "error"
├── startedAt: timestamp
├── endedAt: timestamp (nullable)
└── metadata: jsonb

Message
├── id: string
├── sessionId: FK -> Session
├── role: "user" | "assistant" | "system" | "tool"
├── content: text
├── tokenCount: number (nullable, filled post-call)
├── modelId: string
├── latencyMs: number
├── costUsd: number
├── parentMessageId: FK -> Message (for threading)
└── createdAt

UsageRecord (aggregated, written post-call)
├── id: string
├── userId: string
├── agentId: FK -> Agent
├── modelId: FK -> Model
├── date: date (YYYY-MM-DD)
├── inputTokens: number
├── outputTokens: number
├── totalTokens: number
├── costUsd: number
├── requestCount: number
├── avgLatencyMs: number
└── createdAt

BudgetAlert
├── id: string
├── userId: string
├── type: "daily" | "weekly" | "monthly" | "threshold"
├── limitUsd: number
├── currentSpend: number
├── notifiedAt: timestamp (nullable)
└── status: "active" | "triggered" | "disabled"
```

**Deliverables:**
- [ ] Design complete ERD
- [ ] Write Drizzle schema files
- [ ] Create database migrations
- [ ] Write seed data for development (providers, models, sample agents)

---

### Step 3: LLM Provider Abstraction Layer

**Interface Design:**

```typescript
interface LLMProvider {
  providerId: string;

  // Chat completion
  chat(params: ChatParams): Promise<ChatResponse>;

  // Streaming chat
  streamChat(params: ChatParams): AsyncGenerator<StreamEvent>;

  // Embeddings (for RAG)
  embed(texts: string[]): Promise<EmbeddingResponse>;

  // Model listing (if supported)
  listModels(): Promise<ModelInfo[]>;

  // Health check
  ping(): Promise<boolean>;
}

interface ChatParams {
  model: string;
  messages: Message[];
  systemPrompt?: string;
  temperature?: number;
  maxTokens?: number;
  tools?: Tool[];
  streaming?: boolean;
}

interface ChatResponse {
  content: string;
  finishReason: "stop" | "length" | "tool_use" | "error";
  usage: {
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
  };
  latencyMs: number;
  costUsd: number;
  raw: unknown; // Provider-specific response
}
```

**Provider Implementations:**
- [ ] Anthropic (Claude family)
- [ ] OpenAI (GPT-4, GPT-4o, GPT-4o-mini)
- [ ] Azure OpenAI (Enterprise)
- [ ] Google Vertex AI (Gemini)
- [ ] AWS Bedrock (Claude, Llama, Mistral, Titan)
- [ ] Ollama (Local)
- [ ] LM Studio (Local)
- [ ] Groq (Fast inference)
- [ ] Perplexity (Online models)
- [ ] Mistral API

**Deliverables:**
- [ ] Base provider class with common utilities
- [ ] Provider registry with activation/deactivation
- [ ] Per-provider SDK integration
- [ ] Unified error handling (normalize provider errors)
- [ ] Rate limiting per provider (respect their limits)
- [ ] Retry logic with exponential backoff
- [ ] Streaming support (SSE) for all providers
- [ ] Token counting utilities per model

---

### Step 4: Agent Configuration System

**Agent Builder Features:**
- Name, description, avatar (optional)
- Persona configuration (tone, creativity level)
- System prompt editor with variable support (`{{user.name}}`, `{{today}}`)
- Tool selection and configuration
- Default + fallback model selection
- Memory configuration (context window strategy)

**Tool System:**
```typescript
interface Tool {
  id: string;
  name: string;
  description: string;
  parameters: JSONSchema;
  handler: (params: unknown) => Promise<ToolResult>;
  requiresApproval: boolean; // Some tools need user confirmation
  rateLimit?: number;
}
```

**Built-in Tools (Phase 1):**
- [ ] Web Search (SerpAPI / Tavily)
- [ ] Calculator
- [ ] Code Interpreter
- [ ] File Read/Write
- [ ] HTTP Request (for APIs)

**Deliverables:**
- [ ] Agent CRUD API endpoints
- [ ] Agent template system (save as reusable)
- [ ] Tool registry with validation
- [ ] Built-in tool implementations
- [ ] Agent cloning and versioning
- [ ] Import/Export (JSON/YAML)

---

### Step 5: Telemetry & Cost Tracking

**Metrics to Capture:**
- Input/output/total tokens per request
- Cost per request (calculated from model pricing)
- Latency (time to first token, total time)
- Error rate per agent/model/provider
- Concurrent request count
- Context window utilization (if detectable)

**Cost Calculation:**
```typescript
function calculateCost(model: Model, inputTokens: number, outputTokens: number): number {
  return (inputTokens * model.inputCostPer1M / 1_000_000) +
         (outputTokens * model.outputCostPer1M / 1_000_000);
}
```

**Deliverables:**
- [ ] Middleware for automatic cost/latency tracking
- [ ] UsageRecord aggregation pipeline
- [ ] Real-time cost calculation
- [ ] Budget alert system (threshold-based)
- [ ] Usage breakdown by agent, model, user, time period
- [ ] Cost estimation before API call (show user cost preview)

---

### Step 6: OpenTelemetry Integration

**Tracing Setup:**
- Service name: `agentic-control-tower`
- Span types: `llm.call`, `agent.execution`, `tool.execution`
- Span attributes: model, provider, tokens, cost, agent_id, session_id

**Span Hierarchy:**
```
agent.execution (root)
├── llm.call (claude-3-5-sonnet)
│   ├── llm.call (fallback if applicable)
├── tool.execution (web_search)
├── tool.execution (calculator)
└── ...
```

**Exporters:**
- [ ] Console exporter (development)
- [ ] OTLP exporter (production - Jaeger, Tempo, etc.)
- [ ] Prometheus metrics endpoint

**Key Metrics:**
- `llm.requests.total` (counter, labels: provider, model, status)
- `llm.tokens.total` (counter, labels: type: input|output)
- `llm.cost.total` (counter, labels: provider, model)
- `llm.latency.ms` (histogram, labels: provider, model)
- `agent.sessions.active` (gauge)

**Deliverables:**
- [ ] OpenTelemetry SDK setup with auto-instrumentation
- [ ] Custom spans for LLM calls
- [ ] Span context propagation (trace across services)
- [ ] Prometheus metrics endpoint
- [ ] Grafana dashboard JSON (importable)
- [ ] Jaeger tracing UI integration

---

### Step 7: Dashboard — Real-time Monitoring

**Pages:**

**1. Overview / Home**
- Total spend (today, week, month)
- Active sessions count
- Top agents by usage
- Cost trend chart (line graph)
- Token usage pie chart

**2. Usage Analytics**
- Time-series charts (tokens, cost, requests)
- Filters: date range, agent, model, user
- Export to CSV
- Anomaly highlighting (spikes)

**3. Agent Management**
- List all agents with status
- Create/Edit/Delete agents
- Clone agent
- Agent detail view with config

**4. Live Monitor**
- Real-time session list
- Streaming response viewer
- Token counter (live)
- Cost counter (live)
- Latency waterfall

**5. Models & Providers**
- Provider health status
- Model catalog with capabilities
- Enable/disable models
- Pricing display

**6. Settings**
- API keys management
- Budget alert configuration
- Rate limit settings
- System prompt templates
- Export/Import config

**Component Library:**
- [ ] MetricCard (displays single KPI with trend)
- [ ] LineChart (recharts)
- [ ] BarChart (cost by agent)
- [ ] PieChart (token distribution)
- [ ] DataTable (sortable, filterable)
- [ ] StreamingText (renders tokens as they arrive)
- [ ] TokenWaterfall (latency breakdown)
- [ ] AgentCard (preview with status)
- [ ] ModelBadge (shows model with capabilities)
- [ ] AlertBanner (for budget warnings)

**Deliverables:**
- [ ] Next.js app scaffolded
- [ ] Tailwind + shadcn/ui setup
- [ ] Authentication (NextAuth.js) — simple for Phase 1
- [ ] Overview dashboard page
- [ ] Usage analytics page with charts
- [ ] Agent management CRUD UI
- [ ] Live monitor with SSE streaming
- [ ] Provider/model management UI
- [ ] Settings page
- [ ] Dark mode support

---

### Step 8: Export/Import System

**Config Format:**
```yaml
version: "1.0"
type: agent
metadata:
  name: "Customer Support Agent"
  tags: ["support", "tickets"]
  createdAt: "2024-01-15T10:30:00Z"
  author: "user_123"

config:
  persona:
    tone: "professional"
    systemPrompt: "You are a helpful support agent..."
    temperature: 0.7
    maxTokens: 2048
  defaultModel: "claude-3-5-sonnet-20241022"
  fallbackModel: "gpt-4o"
  tools:
    - id: "web_search"
    - id: "ticket_lookup"
  memoryConfig:
    strategy: "sliding_window"
    maxMessages: 50
```

**Deliverables:**
- [ ] Export agent to JSON/YAML
- [ ] Import agent from JSON/YAML
- [ ] Bulk export (all agents)
- [ ] Bulk import
- [ ] Config versioning (store previous versions)
- [ ] Schema validation on import
- [ ] UI: Download/Upload buttons

---

## Phase 2: Orchestration

### Step 9: Agent Topology Canvas

**Canvas Features:**
- Drag-and-drop node placement
- Node types: Agent, Condition, Input, Output, Delay, Merge
- Edge types: data flow, control flow
- Pan and zoom
- Grid snap
- Auto-layout algorithm

**Node Definitions:**
```typescript
interface PipelineNode {
  id: string;
  type: "agent" | "condition" | "input" | "output" | "delay" | "merge" | "split";
  position: { x: number; y: number };
  config: NodeConfig; // varies by type
  inputs: string[]; // node IDs
  outputs: string[]; // node IDs
}

interface Pipeline {
  id: string;
  name: string;
  nodes: PipelineNode[];
  edges: Edge[];
  createdBy: string;
  status: "draft" | "active" | "paused";
}
```

**Execution Visualization:**
- Live token flow animation along edges
- Node status (idle, running, success, error)
- Execution timeline
- Branch visualization for parallel paths

**Deliverables:**
- [ ] Canvas component (React Flow or custom)
- [ ] Pipeline CRUD API
- [ ] Drag-and-drop pipeline builder UI
- [ ] Node palette with all node types
- [ ] Pipeline validation (cycles, missing inputs)
- [ ] Pipeline execution engine
- [ ] Live execution visualization
- [ ] Pipeline templates (pre-built workflows)
- [ ] Branch/parallel execution support

---

### Step 10: Cross-Agent Communication

**Message Protocol:**
```typescript
interface AgentMessage {
  from: string; // agent ID
  to: string | "broadcast";
  content: unknown;
  type: "task" | "result" | "error" | "context_update";
  correlationId: string;
  timestamp: number;
}
```

**Shared Memory Stores:**
- Key-value store per pipeline
- Vector store for RAG context
- File store for artifacts

**Patterns:**
- Sequential: A → B → C (pass output as input)
- Parallel: A splits to B, C, D (fan-out)
- Conditional: A → (condition) → B or C
- Loop: A → B → (condition) → back to A or exit
- Observer: A runs, B, C observe without blocking

**Deliverables:**
- [ ] Agent-to-agent messaging API
- [ ] Shared context store
- [ ] Pipeline execution engine
- [ ] Sequential/parallel execution patterns
- [ ] Conditional branching logic
- [ ] Loop handling with max iterations
- [ ] Error propagation between agents
- [ ] Timeout handling

---

### Step 11: Agent Personas Marketplace

**Template System:**
- Public templates (curated)
- Private templates (user-created)
- Template ratings and usage stats

**Template Schema:**
```typescript
interface AgentTemplate {
  id: string;
  name: string;
  description: string;
  category: string[]; // ["support", "coding", "creative"]
  authorId: string;
  authorName: string;
  rating: number;
  installCount: number;
  config: AgentConfig; // Same as exported config
  preview: {
    avatar?: string;
    sampleConversation: Message[];
  };
  tags: string[];
  isPublic: boolean;
  createdAt: number;
  updatedAt: number;
}
```

**Features:**
- Browse templates by category
- Search templates
- Install template (creates local copy)
- Rate and review templates
- Fork and customize

**Deliverables:**
- [ ] Template listing API
- [ ] Template creation from existing agent
- [ ] Template install workflow
- [ ] Marketplace UI (browse, search, install)
- [ ] Rating system
- [ ] Template submission for curation

---

### Step 12: Usage Gamification

**Metrics to Track:**
- Tokens saved (compared to baseline)
- Cost reduction over time
- Agent deployment streak
- Successful task completions
- Workflow efficiency

**Gamification Elements:**
- Efficiency badges (e.g., "Token Saver", "Cost Cutter")
- Weekly/monthly leaderboards
- Streak tracking (consecutive days of use)
- Achievement unlocked notifications
- Cost comparison dashboard ("You saved $X this week")

**Calculation:**
```typescript
// "Tokens saved" = baseline (avg tokens before optimization) - actual tokens
// Baseline could be: simple prompt without compression, or average of similar tasks
```

**Deliverables:**
- [ ] Efficiency tracking system
- [ ] Badge definition and awarding logic
- [ ] Leaderboard API and UI
- [ ] Streak tracking (daily active agents)
- [ ] Achievement notifications
- [ ] Cost savings dashboard
- [ ] Comparison charts (before/after optimization)

---

## Phase 3: OS-Level Features

### Step 13: Local-First Option

**Self-Hosted Deployment:**
- Docker Compose setup
- SQLite (default) or Postgres
- Ollama for local models
- No external API dependencies

**Data Residency:**
- All data stays on user's infrastructure
- Optional encrypted backups
- Export all data anytime

**Deliverables:**
- [ ] Docker Compose file (API + Postgres + Redis)
- [ ] Docker Compose with Ollama
- [ ] Local-only mode toggle
- [ ] One-click backup/restore
- [ ] Self-hosted installation guide
- [ ] Helm chart for Kubernetes

---

### Step 14: Context Window Visualization

**Visual Breakdown:**
- System prompt (fixed size indicator)
- Tools definitions (proportional)
- Conversation history (variable)
- RAG context (if applicable)
- Available space indicator

**Memory Pressure Levels:**
- Green: < 50% utilized
- Yellow: 50-80% utilized
- Red: > 80% utilized (warning)
- Critical: > 95% (must truncate)

**Optimization Suggestions:**
- "Remove oldest 10 messages to free X tokens"
- "Disable tool X to save Y tokens"
- "Summarize conversation to fit"

**Deliverables:**
- [ ] Context window model (calculate size per component)
- [ ] Visual component (segmented bar/circle)
- [ ] Memory pressure indicator
- [ ] Optimization suggestions engine
- [ ] Auto-truncation options
- [ ] Token budget settings per agent

---

### Step 15: Cross-Agent Learning (Hive Mind)

**Pattern Detection:**
- Analyze successful agent executions
- Identify common prompt patterns
- Find effective tool combinations

**Sharing Mechanisms:**
- Agents can mark successful patterns
- Patterns propagate to similar agents (same category)
- User approval required before pattern applies

**Types of Learning:**
```typescript
interface LearnedPattern {
  id: string;
  type: "prompt_optimization" | "tool_sequence" | "context_strategy";
  agentIds: string[]; // agents this applies to
  pattern: {
    trigger: string; // "customer complaint detected"
    action: string; // "use empathetic tone + escalate tool"
    success: number; // how many times it worked
  };
  confidence: number; // 0-1
  autoApply: boolean; // requires approval if false
  createdAt: number;
}
```

**Deliverables:**
- [ ] Execution analysis pipeline
- [ ] Pattern detection algorithms
- [ ] Pattern storage and retrieval
- [ ] Cross-agent pattern suggestion UI
- [ ] User approval workflow
- [ ] Pattern effectiveness tracking
- [ ] Auto-apply with guardrails

---

### Step 16: Plugin Architecture

**Plugin Interface:**
```typescript
interface Plugin {
  id: string;
  name: string;
  version: string;
  description: string;
  author: string;

  // Lifecycle hooks
  onInstall?: (context: PluginContext) => Promise<void>;
  onUninstall?: () => Promise<void>;
  onAgentCreate?: (agent: Agent) => Agent;

  // Tool definitions (plugins can add tools)
  tools?: Tool[];

  // UI extensions (plugins can add dashboard components)
  dashboard?: {
    pages?: DashboardPage[];
    widgets?: DashboardWidget[];
  };

  // Settings schema
  settingsSchema?: JSONSchema;
  settings?: Record<string, unknown>;
}

interface PluginContext {
  db: Database;
  llm: LLMProvider;
  config: Record<string, unknown>;
}
```

**Plugin Registry:**
- Install from URL or file
- Plugin sandboxing (limited API access)
- Enable/disable without uninstall
- Plugin settings UI

**Deliverables:**
- [ ] Plugin API and types
- [ ] Plugin loader with sandboxing
- [ ] Plugin manifest validation
- [ ] Plugin CRUD API
- [ ] Plugin settings UI
- [ ] Plugin marketplace (curated list)
- [ ] Official plugins: GitHub, Slack, Jira, Notion, Database

---

## Appendix: Model Catalog

### Anthropic
| Model | Context | Input ($/M) | Output ($/M) |
|-------|---------|-------------|--------------|
| Claude 3.5 Sonnet | 200K | $3 | $15 |
| Claude 3.5 Haiku | 200K | $0.80 | $4 |
| Claude 3 Opus | 200K | $15 | $75 |

### OpenAI
| Model | Context | Input ($/M) | Output ($/M) |
|-------|---------|-------------|--------------|
| GPT-4o | 128K | $5 | $15 |
| GPT-4o-mini | 128K | $0.15 | $0.60 |
| GPT-4 Turbo | 128K | $10 | $30 |

### Google
| Model | Context | Input ($/M) | Output ($/M) |
|-------|---------|-------------|--------------|
| Gemini 1.5 Pro | 1M | $1.25 | $5 |
| Gemini 1.5 Flash | 1M | $0.075 | $0.30 |

---

## Priority Order for Implementation

**Phase 1 (Foundation) — Do first:**
1. Project structure (Step 1)
2. Data model (Step 2)
3. Provider abstraction (Step 3)
4. Basic agent system (Step 4)
5. Telemetry & cost tracking (Step 5)
6. OpenTelemetry (Step 6)
7. Dashboard UI (Step 7)
8. Export/Import (Step 8)

**Phase 2 (Orchestration):**
9. Topology canvas
10. Cross-agent communication
11. Personas marketplace
12. Gamification

**Phase 3 (OS-Level):**
13. Local-first
14. Context visualization
15. Hive mind
16. Plugin architecture

---

*Last updated: 2026-05-11*
