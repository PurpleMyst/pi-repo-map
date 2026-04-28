// Based on workflow-extension (ISC License)
// Copyright (c) 2026 popododo0720

import * as path from 'path';
import * as fs from 'fs';
import { errorSignature, type NotifyFn, reportError, reportWarning } from './errorReporter';
import { getLanguageByFilePath, type LanguageId, type SymbolNode } from './languages';

export type { SymbolNode } from './languages';

export interface ParseResult {
  symbols: SymbolNode[];
  imports: string[];
}

interface TreeSitterTypes {
  Parser: typeof import('web-tree-sitter').Parser;
  Language: typeof import('web-tree-sitter').Language;
  Node: import('web-tree-sitter').Node;
  Point: import('web-tree-sitter').Point;
}

let tsTypes: TreeSitterTypes | null = null;
let languageCache: Record<string, import('web-tree-sitter').Language> = {};
let initPromise: Promise<void> | null = null;
let wasmDir: string = '';

export async function initTreeSitter(notify?: NotifyFn): Promise<void> {
  if (tsTypes) return;
  if (initPromise) {
    await initPromise;
    return;
  }

  initPromise = (async () => {
    try {
      const ts = await import('web-tree-sitter');
      tsTypes = {
        Parser: ts.Parser,
        Language: ts.Language,
        Node: ts.Node,
        Point: ts.Point,
      };

      await ts.Parser.init();

      try {
        const pkgPath = require.resolve('tree-sitter-wasms/package.json');
        wasmDir = path.dirname(pkgPath) + '/out';
      } catch {
        wasmDir = path.join(__dirname, '../../node_modules/tree-sitter-wasms/out');
      }
    } catch (err) {
      reportError('Failed to initialize tree-sitter', err, {
        onceKey: 'tree-sitter-init-failed',
        notify,
      });
      tsTypes = null;
    }
  })();

  await initPromise;
}

async function getLanguage(
  languageConfig: { id: LanguageId; wasmFile?: string }
): Promise<import('web-tree-sitter').Language | null> {
  if (!tsTypes) await initTreeSitter();
  if (!tsTypes || !languageConfig.wasmFile) return null;

  if (languageCache[languageConfig.id]) return languageCache[languageConfig.id];

  const wasmPath = path.join(wasmDir, languageConfig.wasmFile);
  if (!fs.existsSync(wasmPath)) return null;

  try {
    const lang = await tsTypes.Language.load(wasmPath);
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

  if (!tsTypes) await initTreeSitter(notify);
  if (!tsTypes) {
    return { symbols: [], imports: [] };
  }

  try {
    const lang = await getLanguage(languageConfig);
    if (!lang) {
      return { symbols: [], imports: [] };
    }

    const parser = new tsTypes.Parser();
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
