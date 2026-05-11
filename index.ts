// Based on workflow-extension (ISC License)
// Copyright (c) 2026 popododo0720

import { defineTool, type ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from 'typebox';
import * as os from 'os';
import { Text } from "@earendil-works/pi-tui";

import { loadConfig, type RepoMapConfig } from './src/config';
import { type NotifyFn, reportError } from './src/errorReporter';
import { generateRepoMap, generateSymbols } from './src/generator';
import {
  type ProgressCallback,
  type SetProgressWidget,
  createWidgetProgressCallback,
  clearProgressWidget,
} from './src/progress';
import { injectRepoMap } from './src/renderer';

interface CachedRepoMap {
  cwd: string;
  map: string;
  timestamp: number;
}

let cache: CachedRepoMap | null = null;

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

      // Check cache
      if (cache && cache.cwd === ctx.cwd) {
        return {
          systemPrompt: event.systemPrompt + injectRepoMap(cache.map),
        };
      }

      // Check for abort signal
      if (ctx.signal?.aborted) {
        return;
      }

      const notify: NotifyFn | undefined = ctx.hasUI
        ? ctx.ui.notify.bind(ctx.ui)
        : undefined;

      // Set up progress widget if UI is available
      const setWidget: SetProgressWidget | undefined = ctx.hasUI
        ? ctx.ui.setWidget.bind(ctx.ui)
        : undefined;
      const progressCallback: ProgressCallback | undefined = setWidget
        ? createWidgetProgressCallback(setWidget)
        : undefined;

      // Generate fresh repo map with progress reporting
      const repoMap = await buildRepoMap(ctx.cwd, config, notify, progressCallback, ctx.signal);

      // Clear progress widget
      if (setWidget) {
        clearProgressWidget(setWidget);
      }

      return {
        systemPrompt: event.systemPrompt + injectRepoMap(repoMap),
      };
    } catch (err) {
      const notify: NotifyFn | undefined = ctx.hasUI
        ? ctx.ui.notify.bind(ctx.ui)
        : undefined;
      reportError('Repo-map hook failed', err, {
        context: { cwd: ctx.cwd },
        notify,
      });
      // Clear progress widget on error
      if (ctx.hasUI) {
        const setWidget: SetProgressWidget = ctx.ui.setWidget.bind(ctx.ui);
        clearProgressWidget(setWidget);
      }
      return;
    }
  });

  pi.registerTool(defineTool({
    name: "symbols",
    label: "Symbols",
    description: "Read only the symbols in a file (formatted like the repo map), or pass a directory path to generate an updated repository map",
    promptSnippet: "Read a compact symbol outline for a file or directory",
    promptGuidelines: [
      "Use symbols when you need a quick structural overview of a file without reading its full contents.",
      "The repository map is a snapshot from session start and may be stale. Use symbols with a directory path (e.g., the project root) to generate an updated map when you suspect it is out of date (for example, after creating, moving, or renaming files).",
    ],

    parameters: Type.Object({
      path: Type.String({ description: 'Path to the file or directory to inspect, relative to the current working directory or absolute. For files, returns a symbol outline. For directories, returns an updated repository map.' }),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      try {
        const notify: NotifyFn | undefined = ctx.hasUI
          ? ctx.ui.notify.bind(ctx.ui)
          : undefined;
        const symbols = await generateSymbols(params.path, ctx.cwd, notify, ctx.signal);
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

    renderCall(args, theme, _context) {
      const text = theme.fg("toolTitle", theme.bold("symbols ")) + theme.fg("accent", args.path);
      return new Text(text, 0, 0);
    },
  }));

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
        ctx.hasUI ? ctx.ui.notify.bind(ctx.ui) : undefined,
        undefined,
        ctx.signal
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
