import type { SymbolNode, TreeSitterNode } from './types';

// Based on workflow-extension (ISC License)
// Copyright (c) 2026 popododo0720

import * as path from 'path';
import type { ImportResolver } from './types';

// ---------------------------------------------------------------------------
// Language-agnostic import resolution utilities
// ---------------------------------------------------------------------------

function isInside(childPath: string, parentPath: string): boolean {
  const relative = path.relative(parentPath, childPath);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

export function tryCandidates(
  basePath: string,
  extensions: string[],
  rootDir: string,
  knownFiles: Set<string>
): string | null {
  const normalizedBase = path.resolve(basePath);
  if (!isInside(normalizedBase, rootDir)) return null;

  for (const ext of extensions) {
    const candidate = path.resolve(normalizedBase + ext);
    if (isInside(candidate, rootDir) && knownFiles.has(candidate)) {
      return candidate;
    }
  }

  return null;
}

export function tryImportBases(
  bases: string[],
  extensions: string[],
  rootDir: string,
  knownFiles: Set<string>
): string | null {
  for (const base of bases) {
    const resolved = tryCandidates(base, extensions, rootDir, knownFiles);
    if (resolved) return resolved;
  }

  return null;
}

export function createPathImportResolver(extensions: string[]): ImportResolver {
  return ({ importPath, importerPath, rootDir, knownFiles }) => {
    const fromDir = path.dirname(importerPath);
    const normalizedImport = importPath.replace(/^@\//, '').replace(/\//g, path.sep);
    const bases = importPath.startsWith('.')
      ? [path.resolve(fromDir, normalizedImport)]
      : [path.resolve(rootDir, normalizedImport), path.resolve(rootDir, 'src', normalizedImport)];

    return tryImportBases(bases, extensions, rootDir, knownFiles);
  };
}

// ---------------------------------------------------------------------------
// Language-agnostic fallback resolvers
// ---------------------------------------------------------------------------

const DEFAULT_RESOLVE_EXTENSIONS = [
  '', '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.py', '.rs', '.dart',
  '/index.ts', '/index.js', '/__init__.py', '/mod.rs',
];

export const resolveUnknownImport = createPathImportResolver(['']);
export const resolveDefaultImport = createPathImportResolver(DEFAULT_RESOLVE_EXTENSIONS);

// ---------------------------------------------------------------------------
// Shared symbol extraction utilities
// ---------------------------------------------------------------------------

/** Return unique items from a string array, preserving first-occurrence order. */
export function unique(values: string[]): string[] {
  return Array.from(new Set(values));
}

export function getDeclarationName(node: TreeSitterNode): string | null {
  const nameField = node.childForFieldName?.('name');
  if (nameField) {
    return nameField.text.trim();
  }

  for (let i = 0; i < node.childCount; i++) {
    const child = node.child(i);
    if (!child) continue;

    if (
      child.type === 'identifier' ||
      child.type === 'type_identifier' ||
      child.type === 'property_identifier' ||
      child.type === 'field_identifier'
    ) {
      return child.text.trim();
    }
  }

  return null;
}

export function presentChildren(node: TreeSitterNode): TreeSitterNode[] {
  return node.namedChildren.filter((child): child is TreeSitterNode => child !== null);
}

export function createSymbol(
  type: string,
  name: string,
  node: TreeSitterNode,
  children: SymbolNode[] = []
): SymbolNode {
  return children.length > 0
    ? { type, name, line: node.startPosition.row + 1, children }
    : { type, name, line: node.startPosition.row + 1 };
}
