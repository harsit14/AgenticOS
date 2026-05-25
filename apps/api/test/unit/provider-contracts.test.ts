import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ChatParams } from '@agentic-os/types';

const messagesCreate = vi.fn();

vi.mock('@anthropic-ai/sdk', () => ({
  default: class MockAnthropic {
    messages = {
      create: messagesCreate,
      stream: vi.fn(),
      list: vi.fn(),
    };
  },
}));

const { AnthropicProvider } = await import('../../src/core/providers/anthropic.js');
const { OpenAIProvider, AzureProvider } = await import('../../src/core/providers/openai.js');
const { VertexProvider } = await import('../../src/core/providers/vertex.js');

const calculatorTool = {
  id: 'calculator',
  name: 'Calculator',
  description: 'Perform mathematical calculations',
  parameters: {
    type: 'object',
    properties: {
      expression: { type: 'string', description: 'Expression to evaluate' },
    },
    required: ['expression'],
  },
  requiresApproval: false,
};

const baseChatParams: ChatParams = {
  model: 'claude-3-5-sonnet-20241022',
  messages: [{ role: 'user', content: 'What is 2 + 2?' }],
  systemPrompt: 'You are helpful.',
  tools: [calculatorTool],
  maxTokens: 256,
  temperature: 0,
};

describe('provider configuration', () => {
  it('passes settings-store API keys into OpenAI-compatible providers', () => {
    const openai = new OpenAIProvider({ apiKey: 'sk-openai-test' });
    const azure = new AzureProvider({
      apiKey: 'sk-azure-test',
      baseUrl: 'https://example.openai.azure.com',
    });
    const vertex = new VertexProvider({ apiKey: 'vertex-key-test' });

    expect((openai as unknown as { apiKey: string }).apiKey).toBe('sk-openai-test');
    expect((azure as unknown as { apiKey: string }).apiKey).toBe('sk-azure-test');
    expect((azure as { baseUrl: string }).baseUrl).toBe('https://example.openai.azure.com');
    expect((vertex as unknown as { apiKey: string }).apiKey).toBe('vertex-key-test');
  });
});

describe('AnthropicProvider tool calls', () => {
  beforeEach(() => {
    messagesCreate.mockReset();
  });

  it('extracts Claude tool_use blocks into shared tool calls', async () => {
    messagesCreate.mockResolvedValueOnce({
      content: [
        {
          type: 'tool_use',
          id: 'toolu_1',
          name: 'calculator',
          input: { expression: '2 + 2' },
        },
      ],
      usage: { input_tokens: 42, output_tokens: 7 },
    });

    const provider = new AnthropicProvider({ apiKey: 'sk-ant-test' });
    const result = await provider.chat(baseChatParams);

    expect(result.finishReason).toBe('tool_use');
    expect(result.toolCalls).toEqual([
      {
        id: 'toolu_1',
        name: 'calculator',
        arguments: JSON.stringify({ expression: '2 + 2' }),
      },
    ]);

    const request = messagesCreate.mock.calls[0][0];
    expect(request.tools[0].name).toBe('calculator');
    expect(request.messages[0]).toEqual({
      role: 'user',
      content: 'What is 2 + 2?',
    });
  });

  it('threads prior assistant tool_use and tool_result blocks back to Claude', async () => {
    messagesCreate.mockResolvedValueOnce({
      content: [{ type: 'text', text: 'The answer is 4.' }],
      usage: { input_tokens: 50, output_tokens: 9 },
    });

    const provider = new AnthropicProvider({ apiKey: 'sk-ant-test' });
    await provider.chat({
      ...baseChatParams,
      messages: [
        { role: 'user', content: 'What is 2 + 2?' },
        {
          role: 'assistant',
          content: '',
          toolCalls: [
            {
              id: 'toolu_1',
              name: 'calculator',
              arguments: JSON.stringify({ expression: '2 + 2' }),
            },
          ],
        },
        {
          role: 'tool',
          toolCallId: 'toolu_1',
          content: '2 + 2 = 4',
        },
      ],
    });

    const sentMessages = messagesCreate.mock.calls[0][0].messages;
    expect(sentMessages[1]).toEqual({
      role: 'assistant',
      content: [
        {
          type: 'tool_use',
          id: 'toolu_1',
          name: 'calculator',
          input: { expression: '2 + 2' },
        },
      ],
    });
    expect(sentMessages[2]).toEqual({
      role: 'user',
      content: [
        {
          type: 'tool_result',
          tool_use_id: 'toolu_1',
          content: '2 + 2 = 4',
        },
      ],
    });
  });
});
