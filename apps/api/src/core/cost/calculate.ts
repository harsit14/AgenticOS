import type { Model } from '@agentic-os/types';

/**
 * Compute the USD cost of an LLM call from its token usage and the model's
 * per-million-token pricing. Returns 0 if the model has no pricing (e.g. local
 * models like Ollama / LM Studio).
 */
export function calculateCost(
  model: Pick<Model, 'inputCostPer1M' | 'outputCostPer1M'>,
  inputTokens: number,
  outputTokens: number,
): number {
  const input = (inputTokens * (model.inputCostPer1M ?? 0)) / 1_000_000;
  const output = (outputTokens * (model.outputCostPer1M ?? 0)) / 1_000_000;
  return input + output;
}
