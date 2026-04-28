import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { afterEach, describe, expect, test, vi } from 'vitest';
import extension from '../index';

async function withTempDir(run: (dir: string) => Promise<void>) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'repo-map-command-'));
  try {
    await run(dir);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
}

describe('/repo-map command', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  test('prints the current repo map through ui.notify at info level', async () => {
    await withTempDir(async (dir) => {
      await fs.writeFile(
        path.join(dir, 'example.ts'),
        'export function greet() { return "hi"; }',
        'utf-8'
      );

      const registerCommand = vi.fn();
      const pi = {
        on: vi.fn(),
        registerCommand,
        registerFlag: vi.fn(),
        getFlag: vi.fn().mockReturnValue(false),
      } as any;

      extension(pi);

      const command = registerCommand.mock.calls.find(([name]) => name === 'repo-map')?.[1];
      expect(command).toBeTruthy();

      const notify = vi.fn();
      await command.handler('', {
        cwd: dir,
        hasUI: true,
        signal: undefined,
        ui: { notify },
      });

      expect(notify).toHaveBeenCalledTimes(1);
      expect(notify).toHaveBeenCalledWith(
        expect.stringContaining('example.ts'),
        'info'
      );
      expect(notify.mock.calls[0][0]).toContain('function greet');
    });
  });
});
