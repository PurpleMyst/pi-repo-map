import { describe, expect, test } from 'vitest';
import { renderRepoMap } from '../src/renderer';

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
    expect(output).toContain('│ class Greeter');
    expect(output).toContain('│   method hello');
  });
});
