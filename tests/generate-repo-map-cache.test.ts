import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs/promises';
import { beforeEach, describe, expect, test, vi } from 'vitest';

const config = {
  tokenBudget: 10_000,
  maxFiles: 100,
  excludedDirs: [],
};

async function withTempDir(run: (dir: string) => Promise<void>) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'repo-map-cache-'));
  try {
    await run(dir);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
}

async function loadGenerateRepoMap(parseFileMock: ReturnType<typeof vi.fn>) {
  vi.resetModules();
  vi.doMock('../src/parser', () => ({
    initTreeSitter: vi.fn().mockResolvedValue(undefined),
    parseFile: parseFileMock,
  }));

  const { generateRepoMap } = await import('../index');
  return generateRepoMap;
}

describe('generateRepoMap parse caching', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test('does not call parseFile again for unchanged file across runs', async () => {
    await withTempDir(async (dir) => {
      const filePath = path.join(dir, 'a.ts');
      await fs.writeFile(filePath, 'export function hello() {}', 'utf-8');

      const parseFileMock = vi.fn().mockResolvedValue({
        symbols: [{ type: 'function', name: 'hello', line: 1 }],
        imports: [],
      });

      const generateRepoMap = await loadGenerateRepoMap(parseFileMock);

      await generateRepoMap(dir, config);
      await generateRepoMap(dir, config);

      expect(parseFileMock).toHaveBeenCalledTimes(1);
    });
  });

  test('re-parses when file content changes between runs', async () => {
    await withTempDir(async (dir) => {
      const filePath = path.join(dir, 'a.ts');
      await fs.writeFile(filePath, 'export function one() {}', 'utf-8');

      const parseFileMock = vi.fn().mockResolvedValue({ symbols: [], imports: [] });
      const generateRepoMap = await loadGenerateRepoMap(parseFileMock);

      await generateRepoMap(dir, config);

      await fs.writeFile(filePath, 'export function two() {}', 'utf-8');
      await generateRepoMap(dir, config);

      expect(parseFileMock).toHaveBeenCalledTimes(2);
    });
  });

  test('reuses parse result for identical content across different files', async () => {
    await withTempDir(async (dir) => {
      const content = 'export const shared = 1;';
      await fs.writeFile(path.join(dir, 'a.ts'), content, 'utf-8');
      await fs.writeFile(path.join(dir, 'b.ts'), content, 'utf-8');

      const parseFileMock = vi.fn().mockResolvedValue({
        symbols: [{ type: 'const', name: 'shared', line: 1 }],
        imports: [],
      });
      const generateRepoMap = await loadGenerateRepoMap(parseFileMock);

      await generateRepoMap(dir, config);

      expect(parseFileMock).toHaveBeenCalledTimes(1);
    });
  });
});
