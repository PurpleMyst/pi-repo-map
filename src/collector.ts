// Based on workflow-extension (ISC License)
// Copyright (c) 2026 popododo0720

import * as fs from 'fs/promises';
import * as path from 'path';
import { SUPPORTED_EXTENSIONS } from './languages';

const MAX_FILE_SIZE = 100 * 1024; // 100KB

export interface FileInfo {
  path: string;
  relativePath: string;
}

export async function collectFiles(
  rootDir: string,
  options: {
    maxFiles: number;
    excludedDirs: string[];
    onProgress?: (current: number) => void;
  }
): Promise<FileInfo[]> {
  const files: FileInfo[] = [];


  async function walk(dir: string): Promise<void> {
    if (files.length >= options.maxFiles) return;

    try {
      const entries = await fs.readdir(dir, { withFileTypes: true });

      for (const entry of entries) {
        if (files.length >= options.maxFiles) break;

        const fullPath = path.join(dir, entry.name);

        if (entry.isDirectory()) {
          const lowerName = entry.name.toLowerCase();
          if (options.excludedDirs.some(dir => lowerName === dir.toLowerCase())) {
            continue;
          }
          await walk(fullPath);
        } else if (entry.isFile()) {
          const ext = path.extname(entry.name).toLowerCase();
          if (!SUPPORTED_EXTENSIONS.has(ext)) continue;

          try {
            const stat = await fs.stat(fullPath);
            if (stat.size > MAX_FILE_SIZE) continue;

            const relativePath = path.relative(rootDir, fullPath);
            files.push({ path: fullPath, relativePath });
            options.onProgress?.(files.length);
          } catch {
            // Skip files we can't stat
          }
        }
      }
    } catch {
      // Skip directories we can't read
    }
  }

  await walk(rootDir);
  return files;
}
