// Based on workflow-extension (ISC License)
// Copyright (c) 2026 popododo0720

import * as path from 'path';
import * as fs from 'fs';
import type { Language } from 'web-tree-sitter';
import { errorSignature, type NotifyFn, reportError, reportWarning } from './errorReporter';
import { getLanguageByFilePath, type LanguageId, type SymbolNode } from './languages';

export type { SymbolNode } from './languages';

export interface ParseResult {
  symbols: SymbolNode[];
  imports: string[];
}

let treeSitter: typeof import('web-tree-sitter') | null = null;
let languageCache: Record<string, Language> = {};
let initPromise: Promise<void> | null = null;
let wasmDir: string = '';

export async function initTreeSitter(notify?: NotifyFn): Promise<void> {
  if (treeSitter) return;
  if (initPromise) {
    await initPromise;
    return;
  }

  initPromise = (async () => {
    try {
      treeSitter = await import('web-tree-sitter');
      await treeSitter.Parser.init();

      wasmDir = path.join(path.dirname(require.resolve('tree-sitter-wasms/package.json')), 'out');
    } catch (err) {
      reportError('Failed to initialize tree-sitter', err, {
        onceKey: 'tree-sitter-init-failed',
        notify,
      });
      treeSitter = null;
    }
  })();

  await initPromise;
}

async function getLanguage(
  languageConfig: { id: LanguageId; wasmFile?: string },
  notify?: NotifyFn
): Promise<Language | null> {
  if (!treeSitter) await initTreeSitter(notify);
  if (!treeSitter || !languageConfig.wasmFile) return null;

  if (languageCache[languageConfig.id]) return languageCache[languageConfig.id];

  const wasmPath = path.join(wasmDir, languageConfig.wasmFile);
  if (!fs.existsSync(wasmPath)) return null;

  try {
    const lang = await treeSitter.Language.load(wasmPath);
    languageCache[languageConfig.id] = lang;
    return lang;
  } catch {
    return null;
  }
}

export async function parseFile(
  filePath: string,
  content: string,
  notify?: NotifyFn
): Promise<ParseResult> {
  const languageConfig = getLanguageByFilePath(filePath);

  if (!languageConfig?.wasmFile) {
    return { symbols: [], imports: [] };
  }

  try {
    const lang = await getLanguage(languageConfig, notify);
    if (!treeSitter || !lang) {
      return { symbols: [], imports: [] };
    }

    const parser = new treeSitter.Parser();
    parser.setLanguage(lang);

    const tree = parser.parse(content);
    if (!tree) {
      parser.delete();
      return { symbols: [], imports: [] };
    }

    const rootNode = tree.rootNode;

    const symbols = languageConfig.extractSymbols?.(rootNode) ?? [];
    const imports = languageConfig.extractImports?.(rootNode.text) ?? [];

    parser.delete();
    tree.delete();

    return { symbols, imports };
  } catch (err) {
    // web-tree-sitter has a known bug where certain syntax patterns can corrupt
    // the WASM module state, causing irrecoverable parser errors for the process.
    reportWarning('Tree-sitter internal parse failure; using empty parse result', err, {
      onceKey: `tree-sitter-parse:${errorSignature(err)}`,
      context: { filePath },
      notify,
    });
    return { symbols: [], imports: [] };
  }
}
