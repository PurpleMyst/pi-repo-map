import { describe, test, expect, beforeAll } from 'vitest';
import { parseFile, initTreeSitter } from '../src/parser';
import * as fs from 'fs';
import * as path from 'path';

const FIXTURES_DIR = path.join(__dirname, 'fixtures');

const fixtures = fs.readdirSync(FIXTURES_DIR)
  .filter(f => f.endsWith('.rs'));

// Initialize tree-sitter once before all tests
beforeAll(async () => {
  await initTreeSitter();
}, 30000);

describe('Rust symbol extraction', () => {
  for (const fixture of fixtures) {
    test(`parses ${fixture}`, async () => {
      const filePath = path.join(FIXTURES_DIR, fixture);
      const content = fs.readFileSync(filePath, 'utf-8');
      const result = await parseFile(fixture, content);

      expect(result).toMatchSnapshot();
    });
  }
});

// Regression test for parallel parse race condition
describe('initTreeSitter', () => {
  test('parallel parseFile calls all return symbols', async () => {
    const files = ['simple.rs', 'generics.rs', 'impl_trait.rs', 'rooted_tree.rs'];
    
    // Do NOT call initTreeSitter() - let parseFile handle internal init
    // This reproduces the original race condition
    const results = await Promise.all(
      files.map(async (f) => {
        const content = fs.readFileSync(path.join(FIXTURES_DIR, f), 'utf-8');
        return parseFile(f, content);
      })
    );
    
    // All files should have parsed successfully
    for (let i = 0; i < files.length; i++) {
      expect(results[i].symbols.length, `${files[i]} should have symbols`).toBeGreaterThan(0);
    }
  });
  
  test('many concurrent parseFile calls all return symbols', async () => {
    // Run many parse calls concurrently to stress the init race condition
    const calls = Array.from({ length: 20 }, (_, i) => {
      const file = ['simple.rs', 'generics.rs'][i % 2];
      const content = fs.readFileSync(path.join(FIXTURES_DIR, file), 'utf-8');
      return parseFile(file, content);
    });
    
    const results = await Promise.all(calls);
    
    // All 20 calls should have symbols
    const failures = results.filter(r => r.symbols.length === 0);
    expect(failures.length, `${failures.length} calls failed`).toBe(0);
  });
});