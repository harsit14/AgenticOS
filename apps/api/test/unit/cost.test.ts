import { describe, expect, it } from 'vitest';
import { calculateCost } from '../../src/core/cost/calculate.js';

describe('calculateCost', () => {
  it('returns 0 for zero usage', () => {
    expect(calculateCost({ inputCostPer1M: 3, outputCostPer1M: 15 }, 0, 0)).toBe(0);
  });

  it('charges input and output tokens at their respective rates', () => {
    // Claude 3.5 Sonnet-ish: $3/M input, $15/M output
    const model = { inputCostPer1M: 3, outputCostPer1M: 15 };
    // 1,000,000 input tokens → $3, 1,000,000 output tokens → $15
    expect(calculateCost(model, 1_000_000, 0)).toBeCloseTo(3, 6);
    expect(calculateCost(model, 0, 1_000_000)).toBeCloseTo(15, 6);
    expect(calculateCost(model, 1_000_000, 1_000_000)).toBeCloseTo(18, 6);
  });

  it('scales linearly with token count', () => {
    const model = { inputCostPer1M: 10, outputCostPer1M: 30 };
    // 500 input → $0.005, 1000 output → $0.030
    expect(calculateCost(model, 500, 1000)).toBeCloseTo(0.005 + 0.03, 6);
  });

  it('returns 0 when the model has no pricing (local models)', () => {
    expect(calculateCost({ inputCostPer1M: 0, outputCostPer1M: 0 }, 5000, 5000)).toBe(0);
  });
});
