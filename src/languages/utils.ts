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
