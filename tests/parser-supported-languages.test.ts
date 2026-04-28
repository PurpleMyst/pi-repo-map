import { describe, test, expect, beforeAll } from 'vitest';
import { parseFile, initTreeSitter } from '../src/parser';
import * as fs from 'fs';
import * as path from 'path';

const FIXTURES_DIR = path.join(__dirname, 'fixtures');

beforeAll(async () => {
  await initTreeSitter();
}, 30000);

describe('supported language parsing', () => {
  const fixtures = [
    'nesting.ts',
    'nesting.tsx',
    'nesting.js',
    'nesting.jsx',
    'nesting.py',
    'nesting.lua',
    'impl_trait.rs',
    'imports.dart',
    'nesting.dart',
  ];

  for (const fixture of fixtures) {
    test(`parses ${fixture}`, async () => {
      const content = fs.readFileSync(path.join(FIXTURES_DIR, fixture), 'utf-8');
      const result = await parseFile(fixture, content);
      expect(result).toMatchSnapshot();
    });
  }
});

describe('unsupported language parsing', () => {
  test('returns empty parse result for dropped language extensions', async () => {
    const result = await parseFile('main.go', 'package main\nfunc main() {}');
    expect(result).toEqual({ symbols: [], imports: [] });
  });
});
