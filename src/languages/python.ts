// Based on workflow-extension (ISC License)
// Copyright (c) 2026 popododo0720

import * as path from 'path';
import type { ImportResolver, SymbolNode, TreeSitterNode } from './types';
import { tryImportBases } from './utils';
import { unique, getDeclarationName, presentChildren, createSymbol } from './utils';

// ---------------------------------------------------------------------------
// Python import extraction
// ---------------------------------------------------------------------------

export function extractPythonImports(source: string): string[] {
  const imports: string[] = [];

  for (const line of source.split(/\r?\n/)) {
    const trimmed = line.trim();
    const importMatch = trimmed.match(/^import\s+(.+)$/);
    if (importMatch) {
      for (const part of importMatch[1].split(',')) {
        const name = part.trim().split(/\s+as\s+/)[0]?.trim();
        if (name) imports.push(name);
      }
      continue;
    }

    const fromMatch = trimmed.match(/^from\s+([.\w]+)\s+import\s+(.+)$/);
    if (!fromMatch) continue;

    const moduleName = fromMatch[1];
    const importedNames = fromMatch[2]
      .replace(/[()]/g, '')
      .split(',')
      .map(part => part.trim().split(/\s+as\s+/)[0]?.trim())
      .filter((name): name is string => Boolean(name && name !== '*'));

    if (moduleName.startsWith('.')) {
      const dots = moduleName.match(/^\.+/)?.[0] ?? '';
      const rest = moduleName.slice(dots.length).replace(/\./g, '/');
      const prefix = dots.length === 1 ? './' : '../'.repeat(dots.length - 1);

      if (rest) {
        imports.push(prefix + rest);
        for (const name of importedNames) {
          imports.push(`${prefix}${rest}/${name}`);
        }
      } else {
        for (const name of importedNames) {
          imports.push(prefix + name);
        }
      }
    } else {
      imports.push(moduleName);
      for (const name of importedNames) {
        imports.push(`${moduleName}.${name}`);
      }
    }
  }

  return unique(imports);
}

// ---------------------------------------------------------------------------
// Python import resolution
// ---------------------------------------------------------------------------

function createPythonImportResolver(extensions: string[]): ImportResolver {
  return ({ importPath, importerPath, rootDir, knownFiles }) => {
    const fromDir = path.dirname(importerPath);
    const normalizedImport = importPath.startsWith('.')
      ? importPath.replace(/\//g, path.sep)
      : importPath.replace(/\./g, path.sep);
    const bases = importPath.startsWith('.')
      ? [path.resolve(fromDir, normalizedImport)]
      : [path.resolve(rootDir, normalizedImport), path.resolve(rootDir, 'src', normalizedImport)];

    return tryImportBases(bases, extensions, rootDir, knownFiles);
  };
}

export const resolvePythonImport = createPythonImportResolver(['', '.py', '/__init__.py']);

// ---------------------------------------------------------------------------
// Python symbol extraction
// ---------------------------------------------------------------------------

export function extractPythonSymbols(
  node: TreeSitterNode,
  context: 'module' | 'class' = 'module'
): SymbolNode[] {
  const symbols: SymbolNode[] = [];

  for (const child of presentChildren(node)) {
    // Unwrap decorated_definition — its inner definition is a named child.
    const def: TreeSitterNode | undefined =
      child.type === 'decorated_definition'
        ? child.namedChildren.find(
            (c: TreeSitterNode) =>
              c.type === 'function_definition' ||
              c.type === 'async_function_definition' ||
              c.type === 'class_definition'
          )
        : child;

    if (!def) continue;

    if (def.type === 'class_definition') {
      const name = getDeclarationName(def);
      if (!name) continue;

      const body = def.childForFieldName?.('body');
      const children = body ? extractPythonSymbols(body, 'class') : [];
      symbols.push(createSymbol('class', name, def, children));
      continue;
    }

    if (def.type === 'function_definition' || def.type === 'async_function_definition') {
      const name = getDeclarationName(def);
      if (!name) continue;

      const symbolType = context === 'class' ? 'method' : 'function';
      symbols.push(createSymbol(symbolType, name, def));
    }
  }

  return symbols;
}
