// Based on workflow-extension (ISC License)
// Copyright (c) 2026 popododo0720

import * as fs from 'fs/promises';
import * as path from 'path';
import { getCachedParse, setCachedParse, type ParseResult } from './cache';
import { collectFiles } from './collector';
import { loadConfig } from './config';
import { reportError, reportWarning, type NotifyFn } from './errorReporter';
import { parseFile, initTreeSitter } from './parser';
import { type ProgressCallback } from './progress';
import { processGraph } from './graph';
import { renderRepoMap, renderSymbols } from './renderer';

export interface RepoMapGenerationConfig {
  tokenBudget: number;
  maxFiles: number;
  excludedDirs: string[];
}

export async function generateRepoMap(
  cwd: string,
  config: RepoMapGenerationConfig,
  notify?: NotifyFn,
  progress?: ProgressCallback,
  signal?: AbortSignal
): Promise<string> {
  try {
    progress?.({
      phase: 'collecting',
      current: 0,
      total: 0,
      message: 'Discovering files...',
    });

    const files = await collectFiles(cwd, {
      maxFiles: config.maxFiles,
      excludedDirs: config.excludedDirs,
      onProgress: (count) => {
        progress?.({
          phase: 'collecting',
          current: count,
          total: count,
          message: `${count} files found`,
        });
      },
    });

    if (signal?.aborted) {
      return '';
    }

    progress?.({
      phase: 'collecting',
      current: files.length,
      total: files.length,
      message: `${files.length} files discovered`,
    });

    if (files.length === 0) {
      progress?.({ phase: 'done', current: 1, total: 1, message: 'No files found' });
      return '';
    }

    progress?.({ phase: 'init', current: 0, total: 1, message: 'Loading language parsers...' });

    await initTreeSitter(notify);

    if (signal?.aborted) {
      return '';
    }

    const parseResults = new Map<string, ParseResult>();
    const fileParseFailures: { filePath: string; error: unknown }[] = [];

    progress?.({
      phase: 'parsing',
      current: 0,
      total: files.length,
      message: 'Parsing files...',
    });

    const REPORT_INTERVAL = 10;
    let lastReportIndex = 0;

    for (let i = 0; i < files.length; i++) {
      if (signal?.aborted) {
        return '';
      }

      const file = files[i];
      try {
        const content = await fs.readFile(file.path, 'utf-8');
        const cached = getCachedParse(content);
        if (cached) {
          parseResults.set(file.path, cached);
        } else {
          const result = await parseFile(file.path, content, notify);
          setCachedParse(content, result);
          parseResults.set(file.path, result);
        }
      } catch (err) {
        fileParseFailures.push({ filePath: file.path, error: err });
      }

      if ((i - lastReportIndex >= REPORT_INTERVAL) || i === files.length - 1) {
        progress?.({
          phase: 'parsing',
          current: i + 1,
          total: files.length,
          message: `Parsed ${i + 1}/${files.length} files`,
        });
        lastReportIndex = i;
      }
    }

    if (fileParseFailures.length > 0) {
      const firstFailure = fileParseFailures[0];
      reportWarning('Failed to parse some files; repo map may be incomplete', firstFailure.error, {
        context: {
          failedFiles: fileParseFailures.length,
          firstFile: firstFailure.filePath,
        },
        notify,
      });
    }

    progress?.({
      phase: 'graphing',
      current: 0,
      total: 1,
      message: 'Analyzing dependencies...',
    });

    const rankedFiles = processGraph(files, parseResults);

    if (signal?.aborted) {
      return '';
    }

    progress?.({ phase: 'rendering', current: 0, total: 1, message: 'Generating repo map...' });

    const result = renderRepoMap(rankedFiles, parseResults, config.tokenBudget);

    progress?.({
      phase: 'done',
      current: 1,
      total: 1,
      message: `${files.length} files, ${parseResults.size} parsed`,
    });

    return result;
  } catch (err) {
    reportError('Repo-map generation failed', err, {
      context: { cwd },
      notify,
    });
    progress?.({ phase: 'done', current: 0, total: 0, message: 'Failed' });
    return '';
  }
}

export async function generateSymbols(
  filePath: string,
  cwd: string,
  notify?: NotifyFn,
  signal?: AbortSignal
): Promise<string> {
  const absolutePath = path.isAbsolute(filePath) ? filePath : path.resolve(cwd, filePath);
  const stat = await fs.stat(absolutePath);
  if (stat.isDirectory()) {
    const config = await loadConfig(absolutePath);
    if (config.enabled === false) {
      throw new Error(`Repo map is disabled for ${filePath}`);
    }
    return generateRepoMap(absolutePath, config, notify, undefined, signal);
  }

  const content = await fs.readFile(absolutePath, 'utf-8');
  await initTreeSitter(notify);

  const cached = getCachedParse(content);
  const result = cached ?? await parseFile(absolutePath, content, notify);
  if (!cached) {
    setCachedParse(content, result);
  }

  return renderSymbols(result.symbols);
}
