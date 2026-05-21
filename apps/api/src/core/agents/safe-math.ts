/**
 * A safe arithmetic expression evaluator for the `calculator` tool.
 *
 * The previous implementation used `new Function('return ' + expr)()`, which
 * executes arbitrary JavaScript. Since the agentic tool loop lets a model pick
 * tool arguments, that was a code-execution hole. This is a hand-written
 * recursive-descent parser that only understands numbers, the operators
 * + - * / %, parentheses, unary minus, and a fixed set of single-argument
 * math functions — there is no path to arbitrary code.
 */

const FUNCTIONS: Record<string, (n: number) => number> = {
  sqrt: Math.sqrt,
  abs: Math.abs,
  ceil: Math.ceil,
  floor: Math.floor,
  round: Math.round,
  sin: Math.sin,
  cos: Math.cos,
  tan: Math.tan,
  log: Math.log,
  log10: Math.log10,
  log2: Math.log2,
  exp: Math.exp,
};

type Token =
  | { kind: 'number'; value: number }
  | { kind: 'op'; value: '+' | '-' | '*' | '/' | '%' }
  | { kind: 'lparen' }
  | { kind: 'rparen' }
  | { kind: 'ident'; value: string };

function tokenize(input: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;

  while (i < input.length) {
    const ch = input[i];

    if (ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r') {
      i++;
      continue;
    }

    if (ch >= '0' && ch <= '9') {
      let num = '';
      while (i < input.length && /[0-9.]/.test(input[i])) {
        num += input[i];
        i++;
      }
      const value = Number(num);
      if (!Number.isFinite(value)) {
        throw new Error(`Invalid number: ${num}`);
      }
      tokens.push({ kind: 'number', value });
      continue;
    }

    if (/[a-zA-Z_]/.test(ch)) {
      let ident = '';
      while (i < input.length && /[a-zA-Z0-9_]/.test(input[i])) {
        ident += input[i];
        i++;
      }
      tokens.push({ kind: 'ident', value: ident });
      continue;
    }

    if (ch === '+' || ch === '-' || ch === '*' || ch === '/' || ch === '%') {
      tokens.push({ kind: 'op', value: ch });
      i++;
      continue;
    }

    if (ch === '(') {
      tokens.push({ kind: 'lparen' });
      i++;
      continue;
    }

    if (ch === ')') {
      tokens.push({ kind: 'rparen' });
      i++;
      continue;
    }

    throw new Error(`Unexpected character: ${ch}`);
  }

  return tokens;
}

/**
 * Grammar:
 *   expr   = term  (('+' | '-') term)*
 *   term   = factor (('*' | '/' | '%') factor)*
 *   factor = number
 *          | ident '(' expr ')'
 *          | '(' expr ')'
 *          | ('-' | '+') factor
 */
class Parser {
  private pos = 0;
  constructor(private readonly tokens: Token[]) {}

  parse(): number {
    const value = this.expr();
    if (this.pos !== this.tokens.length) {
      throw new Error('Unexpected trailing input');
    }
    return value;
  }

  private peek(): Token | undefined {
    return this.tokens[this.pos];
  }

  private expr(): number {
    let value = this.term();
    let tok = this.peek();
    while (tok && tok.kind === 'op' && (tok.value === '+' || tok.value === '-')) {
      this.pos++;
      const rhs = this.term();
      value = tok.value === '+' ? value + rhs : value - rhs;
      tok = this.peek();
    }
    return value;
  }

  private term(): number {
    let value = this.factor();
    let tok = this.peek();
    while (
      tok &&
      tok.kind === 'op' &&
      (tok.value === '*' || tok.value === '/' || tok.value === '%')
    ) {
      this.pos++;
      const rhs = this.factor();
      if (tok.value === '*') value *= rhs;
      else if (tok.value === '/') value /= rhs;
      else value %= rhs;
      tok = this.peek();
    }
    return value;
  }

  private factor(): number {
    const tok = this.peek();
    if (!tok) throw new Error('Unexpected end of expression');

    if (tok.kind === 'op' && (tok.value === '-' || tok.value === '+')) {
      this.pos++;
      const operand = this.factor();
      return tok.value === '-' ? -operand : operand;
    }

    if (tok.kind === 'number') {
      this.pos++;
      return tok.value;
    }

    if (tok.kind === 'lparen') {
      this.pos++;
      const value = this.expr();
      const close = this.peek();
      if (!close || close.kind !== 'rparen') {
        throw new Error('Expected closing parenthesis');
      }
      this.pos++;
      return value;
    }

    if (tok.kind === 'ident') {
      const fn = FUNCTIONS[tok.value];
      if (!fn) {
        throw new Error(`Unknown function: ${tok.value}`);
      }
      this.pos++;
      const open = this.peek();
      if (!open || open.kind !== 'lparen') {
        throw new Error(`Expected '(' after ${tok.value}`);
      }
      this.pos++;
      const arg = this.expr();
      const close = this.peek();
      if (!close || close.kind !== 'rparen') {
        throw new Error('Expected closing parenthesis');
      }
      this.pos++;
      return fn(arg);
    }

    throw new Error('Unexpected token in expression');
  }
}

/**
 * Evaluate an arithmetic expression. Throws on anything malformed or unsafe.
 */
export function evaluateExpression(expression: string): number {
  if (typeof expression !== 'string' || expression.trim() === '') {
    throw new Error('Expression must be a non-empty string');
  }
  if (expression.length > 500) {
    throw new Error('Expression too long');
  }
  const result = new Parser(tokenize(expression)).parse();
  if (!Number.isFinite(result)) {
    throw new Error('Expression did not evaluate to a finite number');
  }
  return result;
}
