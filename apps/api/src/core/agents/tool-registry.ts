import type { Tool, ToolResult, ToolContext } from './types.js';

// Tool registry to manage available tools
export class ToolRegistry {
  private tools: Map<string, Tool> = new Map();

  constructor() {
    this.registerBuiltInTools();
  }

  private registerBuiltInTools(): void {
    // Calculator tool
    this.register({
      id: 'calculator',
      name: 'Calculator',
      description: 'Perform mathematical calculations',
      category: 'data',
      parameters: {
        type: 'object',
        properties: {
          expression: {
            type: 'string',
            description: 'Mathematical expression to evaluate (e.g., "2 + 2" or "sqrt(16)")',
          },
        },
        required: ['expression'],
      },
      requiresApproval: false,
      handler: async (params) => {
        try {
          const { expression } = params as { expression: string };

          // Safe math evaluation (basic)
          // In production, use a proper math library
          const sanitized = expression.replace(/[^0-9+\-*/().%\s]/g, '');

          // Handle common math functions
          let result = sanitized;
          const mathPattern = /(sqrt|abs|ceil|floor|round|sin|cos|tan|log|exp)\(([^)]+)\)/g;
          result = result.replace(mathPattern, (_, fn, arg) => {
            const num = parseFloat(arg);
            switch (fn) {
              case 'sqrt': return Math.sqrt(num).toString();
              case 'abs': return Math.abs(num).toString();
              case 'ceil': return Math.ceil(num).toString();
              case 'floor': return Math.floor(num).toString();
              case 'round': return Math.round(num).toString();
              case 'sin': return Math.sin(num).toString();
              case 'cos': return Math.cos(num).toString();
              case 'tan': return Math.tan(num).toString();
              case 'log': return Math.log(num).toString();
              case 'exp': return Math.exp(num).toString();
              default: return arg;
            }
          });

          // Evaluate the expression
          // Using Function constructor for safety in this controlled context
          const evalResult = new Function(`return ${result}`)();

          return {
            success: true,
            content: `${expression} = ${evalResult}`,
            data: { expression, result: evalResult },
          };
        } catch (error) {
          return {
            success: false,
            content: '',
            error: `Calculation error: ${(error as Error).message}`,
          };
        }
      },
    });

    // Web Search tool (placeholder - would integrate with SerpAPI, Tavily, etc.)
    this.register({
      id: 'web_search',
      name: 'Web Search',
      description: 'Search the web for information',
      category: 'web',
      parameters: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'Search query to look up',
          },
          num_results: {
            type: 'number',
            description: 'Number of results to return',
            default: 5,
          },
        },
        required: ['query'],
      },
      requiresApproval: false,
      handler: async (params) => {
        const { query, num_results = 5 } = params as { query: string; num_results?: number };

        // Placeholder - in production, integrate with actual search API
        return {
          success: true,
          content: `Search results for "${query}":\n\n[This is a placeholder. Integrate with SerpAPI, Tavily, or Brave Search for actual results.]`,
          data: { query, resultsCount: num_results },
        };
      },
    });

    // Code Interpreter tool
    this.register({
      id: 'code_interpreter',
      name: 'Code Interpreter',
      description: 'Execute code in a sandboxed environment',
      category: 'code',
      parameters: {
        type: 'object',
        properties: {
          language: {
            type: 'string',
            description: 'Programming language (python, javascript)',
            enum: ['python', 'javascript', 'bash'],
          },
          code: {
            type: 'string',
            description: 'Code to execute',
          },
        },
        required: ['language', 'code'],
      },
      requiresApproval: true, // Code execution requires approval
      handler: async (params) => {
        const { language, code } = params as { language: string; code: string };

        // Placeholder - in production, use a sandboxed execution environment
        return {
          success: true,
          content: `[Code execution is sandboxed. In production, integrate with Docker containers or a service like PyPy.]\n\nLanguage: ${language}\nCode: ${code.substring(0, 100)}...`,
          data: { language, codeLength: code.length },
        };
      },
    });

    // HTTP Request tool
    this.register({
      id: 'http_request',
      name: 'HTTP Request',
      description: 'Make HTTP requests to external APIs',
      category: 'api',
      parameters: {
        type: 'object',
        properties: {
          method: {
            type: 'string',
            description: 'HTTP method',
            enum: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
            default: 'GET',
          },
          url: {
            type: 'string',
            description: 'URL to request',
          },
          headers: {
            type: 'object',
            description: 'HTTP headers',
          },
          body: {
            type: 'object',
            description: 'Request body (for POST/PUT/PATCH)',
          },
        },
        required: ['method', 'url'],
      },
      requiresApproval: true,
      handler: async (params) => {
        const { method, url, headers, body } = params as {
          method: string;
          url: string;
          headers?: Record<string, string>;
          body?: unknown;
        };

        try {
          const response = await fetch(url, {
            method,
            headers: {
              'Content-Type': 'application/json',
              ...headers,
            },
            body: body ? JSON.stringify(body) : undefined,
          });

          const data = await response.json().catch(() => response.text());

          return {
            success: true,
            content: `HTTP ${method} ${url} returned ${response.status}`,
            data: { status: response.status, body: data },
          };
        } catch (error) {
          return {
            success: false,
            content: '',
            error: `Request failed: ${(error as Error).message}`,
          };
        }
      },
    });

    // File Read tool
    this.register({
      id: 'file_read',
      name: 'File Read',
      description: 'Read contents of a file',
      category: 'file',
      parameters: {
        type: 'object',
        properties: {
          path: {
            type: 'string',
            description: 'Path to the file',
          },
          max_lines: {
            type: 'number',
            description: 'Maximum number of lines to read',
            default: 100,
          },
        },
        required: ['path'],
      },
      requiresApproval: true,
      handler: async (params) => {
        // Placeholder - in production, use proper file system access
        return {
          success: true,
          content: `[File read would read: ${(params as { path: string }).path}]`,
          data: { path: (params as { path: string }).path },
        };
      },
    });

    // File Write tool
    this.register({
      id: 'file_write',
      name: 'File Write',
      description: 'Write content to a file',
      category: 'file',
      parameters: {
        type: 'object',
        properties: {
          path: {
            type: 'string',
            description: 'Path to write to',
          },
          content: {
            type: 'string',
            description: 'Content to write',
          },
        },
        required: ['path', 'content'],
      },
      requiresApproval: true,
      handler: async (params) => {
        return {
          success: true,
          content: `[File write would write to: ${(params as { path: string }).path}]`,
          data: { path: (params as { path: string }).path },
        };
      },
    });
  }

  register(tool: Tool): void {
    this.tools.set(tool.id, tool);
  }

  unregister(toolId: string): boolean {
    return this.tools.delete(toolId);
  }

  get(toolId: string): Tool | undefined {
    return this.tools.get(toolId);
  }

  getAll(): Tool[] {
    return Array.from(this.tools.values());
  }

  getByCategory(category: string): Tool[] {
    return this.getAll().filter(t => t.category === category);
  }

  async execute(toolId: string, params: unknown, context: ToolContext): Promise<ToolResult> {
    const tool = this.tools.get(toolId);
    if (!tool) {
      return { success: false, content: '', error: `Tool not found: ${toolId}` };
    }

    try {
      return await tool.handler(params, context);
    } catch (error) {
      return { success: false, content: '', error: `Tool execution failed: ${(error as Error).message}` };
    }
  }

  validateParams(toolId: string, params: unknown): { valid: boolean; errors: string[] } {
    const tool = this.tools.get(toolId);
    if (!tool) {
      return { valid: false, errors: [`Tool not found: ${toolId}`] };
    }

    const errors: string[] = [];
    const paramsObj = params as Record<string, unknown>;

    // Check required parameters
    if (tool.parameters.required) {
      for (const required of tool.parameters.required) {
        if (paramsObj[required] === undefined) {
          errors.push(`Missing required parameter: ${required}`);
        }
      }
    }

    // Validate parameter types
    for (const [key, schema] of Object.entries(tool.parameters.properties)) {
      const value = paramsObj[key];
      if (value !== undefined && typeof value !== schema.type) {
        errors.push(`Parameter "${key}" must be of type ${schema.type}`);
      }
    }

    return { valid: errors.length === 0, errors };
  }

  // Get tool definitions for LLM function calling
  getDefinitions(): Array<{ id: string; name: string; description: string; parameters: Record<string, unknown> }> {
    return this.getAll().map(tool => ({
      id: tool.id,
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters,
    }));
  }
}

// Singleton
let registry: ToolRegistry | null = null;

export function getToolRegistry(): ToolRegistry {
  if (!registry) {
    registry = new ToolRegistry();
  }
  return registry;
}