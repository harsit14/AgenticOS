import { describe, expect, it } from 'vitest';
import { evaluateExpression } from '../../src/core/agents/safe-math.js';

describe('evaluateExpression', () => {
  it('evaluates basic arithmetic with precedence', () => {
    expect(evaluateExpression('2 + 2')).toBe(4);
    expect(evaluateExpression('2 + 3 * 4')).toBe(14);
    expect(evaluateExpression('(2 + 3) * 4')).toBe(20);
    expect(evaluateExpression('10 / 4')).toBe(2.5);
    expect(evaluateExpression('10 % 3')).toBe(1);
  });

  it('handles unary minus and decimals', () => {
    expect(evaluateExpression('-5 + 3')).toBe(-2);
    expect(evaluateExpression('3.5 * 2')).toBe(7);
    expect(evaluateExpression('-(4 - 1)')).toBe(-3);
  });

  it('supports math functions', () => {
    expect(evaluateExpression('sqrt(16)')).toBe(4);
    expect(evaluateExpression('abs(-7)')).toBe(7);
    expect(evaluateExpression('floor(3.9)')).toBe(3);
    expect(evaluateExpression('round(2.5)')).toBe(3);
    expect(evaluateExpression('sqrt(9) + abs(-1)')).toBe(4);
  });

  it('rejects arbitrary code — no path to JS execution', () => {
    // The old implementation used new Function(); these would have run as JS.
    expect(() => evaluateExpression('process.exit(1)')).toThrow();
    expect(() => evaluateExpression('require("fs")')).toThrow();
    expect(() => evaluateExpression('1; console.log(1)')).toThrow();
    expect(() => evaluateExpression('globalThis')).toThrow();
    expect(() => evaluateExpression('[].constructor')).toThrow();
  });

  it('rejects malformed expressions', () => {
    expect(() => evaluateExpression('2 +')).toThrow();
    expect(() => evaluateExpression('(2 + 3')).toThrow();
    expect(() => evaluateExpression('')).toThrow();
    expect(() => evaluateExpression('unknownfn(2)')).toThrow();
  });

  it('rejects non-finite results', () => {
    expect(() => evaluateExpression('1 / 0')).toThrow(/finite/);
  });
});
