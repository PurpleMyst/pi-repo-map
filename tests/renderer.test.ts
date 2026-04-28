import { describe, expect, test } from 'vitest';
import { renderRepoMap, renderSymbols } from '../src/renderer';

describe('renderRepoMap', () => {
  test('renders nested symbol hierarchy', () => {
    const rankedFiles = [{ path: '/repo/a.ts', relativePath: 'a.ts', pagerank: 1 }];
    const symbolsMap = new Map([
      ['/repo/a.ts', {
        symbols: [
          {
            type: 'class',
            name: 'Greeter',
            line: 1,
            children: [
              { type: 'method', name: 'hello', line: 2 },
            ],
          },
        ],
      }],
    ]);

    const output = renderRepoMap(rankedFiles, symbolsMap, 10_000);

    expect(output).toContain('a.ts');
    expect(output).toContain('│ class Greeter (line 1)');
    expect(output).toContain('│   method hello (line 2)');
  });
});

describe('renderSymbols', () => {
  test('renders symbols without a file header', () => {
    const output = renderSymbols([
      {
        type: 'class',
        name: 'Greeter',
        line: 1,
        children: [
          { type: 'method', name: 'hello', line: 2 },
        ],
      },
    ]);

    expect(output).toBe('│ class Greeter (line 1)\n│   method hello (line 2)');
  });
});
