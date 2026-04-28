// Based on workflow-extension (ISC License)
// Copyright (c) 2026 popododo0720

import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";
import { Type } from 'typebox';
import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';

import { loadConfig, type RepoMapConfig } from './src/config';
import { collectFiles } from './src/collector';
import { processGraph } from './src/graph';
import { renderRepoMap, injectRepoMap, renderSymbols } from './src/renderer';
import { type NotifyFn, reportError, reportWarning } from './src/errorReporter';
import { getCachedParse, setCachedParse, type ParseResult } from './src/cache';
import {
  type ProgressState,
  type ProgressCallback,
  createWidgetProgressCallback,
  clearProgressWidget,
} from './src/progress';

interface CacheEntry {
  cwd: string;
  map: string;
  timestamp: number;
}

const CACHE_TTL_MS = 30_000;

let cache: CacheEntry | null = null;

export async function generateRepoMap(
  cwd: string,
  config: {
    tokenBudget: number;
    maxFiles: number;
    excludedDirs: string[];
  },
  notify?: NotifyFn,
  progress?: ProgressCallback,
  signal?: AbortSignal
): Promise<string> {
  try {
    // Phase 1: Collect files
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

    // Phase 2: Initialize tree-sitter
    progress?.({ phase: 'init', current: 0, total: 1, message: 'Loading language parsers...' });

    const { initTreeSitter, parseFile } = await import('./src/parser');
    await initTreeSitter(notify);

    if (signal?.aborted) {
      return '';
    }

    // Phase 3: Parse files
    const parseResults = new Map<string, ParseResult>();
    const fileParseFailures: { filePath: string; error: unknown }[] = [];

    progress?.({
      phase: 'parsing',
      current: 0,
      total: files.length,
      message: 'Parsing files...',
    });

    // Process files with progress updates every 10 files
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

      // Report progress every REPORT_INTERVAL files or on last file
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

    // Phase 4: Process graph
    progress?.({
      phase: 'graphing',
      current: 0,
      total: 1,
      message: 'Analyzing dependencies...',
    });

    const rankedFiles = processGraph(
      files.map(f => ({ path: f.path, relativePath: f.relativePath })),
      parseResults
    );

    if (signal?.aborted) {
      return '';
    }

    // Phase 5: Render
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

async function buildRepoMap(
  cwd: string,
  config: RepoMapConfig,
  notify?: NotifyFn,
  progress?: ProgressCallback,
  signal?: AbortSignal
): Promise<string> {
  const repoMap = await generateRepoMap(cwd, config, notify, progress, signal);
  cache = { cwd, map: repoMap, timestamp: Date.now() };
  return repoMap;
}

async function generateSymbols(filePath: string, cwd: string, notify?: NotifyFn): Promise<string> {
  const absolutePath = path.isAbsolute(filePath) ? filePath : path.resolve(cwd, filePath);
  const stat = await fs.stat(absolutePath);
  if (stat.isDirectory()) {
    throw new Error(`Path is a directory: ${filePath}`);
  }

  const content = await fs.readFile(absolutePath, 'utf-8');
  const { initTreeSitter, parseFile } = await import('./src/parser');
  await initTreeSitter(notify);

  const cached = getCachedParse(content);
  const result = cached ?? await parseFile(absolutePath, content, notify);
  if (!cached) {
    setCachedParse(content, result);
  }

  return renderSymbols(result.symbols);
}

const symbolsToolParameters = Type.Object({
  path: Type.String({ description: 'Path to the file to inspect, relative to the current working directory or absolute' }),
});

export default function (pi: ExtensionAPI) {
  // Inject repo map into system prompt
  pi.on("before_agent_start", async (event, ctx) => {
    try {
      // Check if disabled via flag
      if (pi.getFlag("no-repo-map")) {
        return;
      }

      // Skip repo-map generation in the home directory to avoid scanning unrelated files
      if (os.homedir() === ctx.cwd) {
        return;
      }

      const config = await loadConfig(ctx.cwd);
      if (config.enabled === false) {
        return;
      }

      const now = Date.now();

      // Check cache
      if (cache && cache.cwd === ctx.cwd && now - cache.timestamp < CACHE_TTL_MS) {
        return {
          systemPrompt: event.systemPrompt + injectRepoMap(cache.map),
        };
      }

      // Check for abort signal
      if (ctx.signal?.aborted) {
        return;
      }

      const notify: NotifyFn | undefined = ctx.hasUI
        ? (message, type) => ctx.ui.notify(message, type)
        : undefined;

      // Set up progress widget if UI is available
      const progressCallback: ProgressCallback | undefined = ctx.hasUI
        ? createWidgetProgressCallback((id, content) => ctx.ui.setWidget(id, content as Parameters<typeof ctx.ui.setWidget>[1]))
        : undefined;

      // Generate fresh repo map with progress reporting
      const repoMap = await buildRepoMap(ctx.cwd, config, notify, progressCallback, ctx.signal ?? undefined);

      // Clear progress widget
      if (progressCallback) {
        clearProgressWidget((id, content) => ctx.ui.setWidget(id, content as Parameters<typeof ctx.ui.setWidget>[1]));
      }

      return {
        systemPrompt: event.systemPrompt + injectRepoMap(repoMap),
      };
    } catch (err) {
      reportError('Repo-map hook failed', err, {
        context: { cwd: ctx.cwd },
        notify: ctx.hasUI ? (message, type) => ctx.ui.notify(message, type) : undefined,
      });
      // Clear progress widget on error
      if (ctx.hasUI) {
        clearProgressWidget((id, content) => ctx.ui.setWidget(id, content as Parameters<typeof ctx.ui.setWidget>[1]));
      }
      return;
    }
  });

  pi.registerTool({
    name: "symbols",
    label: "Symbols",
    description: "Read only the symbols in a file, formatted like they appear in the repo map",
    promptSnippet: "symbols: Read only the symbols in a file, formatted like they appear in the repo map",
    promptGuidelines: [
      "Use symbols when you need a quick structural overview of a file without reading its full contents.",
    ],
    parameters: symbolsToolParameters,
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      try {
        const notify: NotifyFn | undefined = ctx.hasUI
          ? (message, type) => ctx.ui.notify(message, type)
          : undefined;
        const symbols = await generateSymbols(params.path, ctx.cwd, notify);
        return {
          content: [{ type: "text", text: symbols || '(no symbols found)' }],
          details: { path: params.path },
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return {
          content: [{ type: "text", text: message }],
          details: { path: params.path },
          isError: true,
        };
      }
    },
  });

  pi.registerCommand("repo-map", {
    description: "Print the current repo map",
    handler: async (_args, ctx) => {
      const config = await loadConfig(ctx.cwd);
      if (config.enabled === false) {
        ctx.ui.notify('Repo map is disabled for this project', 'info');
        return;
      }

      const repoMap = await buildRepoMap(
        ctx.cwd,
        config,
        ctx.hasUI ? (message, type) => ctx.ui.notify(message, type) : undefined,
        undefined,
        ctx.signal ?? undefined
      );

      ctx.ui.notify(repoMap || '(empty repo map)', 'info');
    },
  });

  // Optional: flag to disable
  pi.registerFlag("no-repo-map", {
    description: "Disable automatic repo map injection",
    type: "boolean",
    default: false,
  });
}
