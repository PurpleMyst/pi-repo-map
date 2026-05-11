// Based on workflow-extension (ISC License)
// Copyright (c) 2026 popododo0720

import * as path from 'path';
import type { ImportResolver } from './types';
import { createPathImportResolver, tryCandidates, tryImportBases } from './utils';

// ---------------------------------------------------------------------------
// Language-specific import resolvers
// ---------------------------------------------------------------------------

// -- JavaScript / TypeScript -------------------------------------------------

const JS_RESOLVE_EXTENSIONS = [
  '', '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs',
  '/index.ts', '/index.tsx', '/index.js', '/index.jsx',
];

export const resolveJSImport = createPathImportResolver(JS_RESOLVE_EXTENSIONS);

// -- Python ------------------------------------------------------------------

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

// -- Rust --------------------------------------------------------------------

function rustPathVariants(importPath: string, fromDir: string, rootDir: string): string[] {
  const cleaned = importPath
    .replace(/\s+as\s+\w+$/g, '')
    .replace(/[{}]/g, '')
    .split(',')[0]
    .trim();

  if (!cleaned) return [];

  const parts = cleaned.split('::').filter(Boolean);
  const roots: string[] = [];
  let moduleParts = parts;

  if (parts[0] === 'crate') {
    roots.push(path.join(rootDir, 'src'), rootDir);
    moduleParts = parts.slice(1);
  } else if (parts[0] === 'self') {
    roots.push(fromDir);
    moduleParts = parts.slice(1);
  } else if (parts[0] === 'super') {
    roots.push(path.dirname(fromDir));
    moduleParts = parts.slice(1);
  } else {
    roots.push(rootDir);
  }

  const variants: string[] = [];
  for (const root of roots) {
    for (let length = moduleParts.length; length >= 1; length--) {
      variants.push(path.join(root, ...moduleParts.slice(0, length)));
    }
  }

  return variants;
}

function createRustImportResolver(extensions: string[]): ImportResolver {
  return ({ importPath, importerPath, rootDir, knownFiles }) => {
    const fromDir = path.dirname(importerPath);
    for (const variant of rustPathVariants(importPath, fromDir, rootDir)) {
      const resolved = tryCandidates(variant, extensions, rootDir, knownFiles);
      if (resolved) return resolved;
    }
    return null;
  };
}

export const resolveRustImport = createRustImportResolver(['', '.rs', '/mod.rs']);

// -- Dart --------------------------------------------------------------------

function createDartImportResolver(extensions: string[]): ImportResolver {
  return ({ importPath, importerPath, rootDir, knownFiles }) => {
    if (importPath.startsWith('dart:')) {
      return null;
    }

    if (importPath.startsWith('package:')) {
      const packagePath = importPath.slice('package:'.length);
      const slashIndex = packagePath.indexOf('/');
      if (slashIndex === -1) return null;

      const packageRelativePath = packagePath.slice(slashIndex + 1).replace(/\//g, path.sep);
      const bases = [
        path.resolve(rootDir, 'lib', packageRelativePath),
        path.resolve(rootDir, packageRelativePath),
      ];

      return tryImportBases(bases, extensions, rootDir, knownFiles);
    }

    const fromDir = path.dirname(importerPath);
    const normalizedImport = importPath.replace(/\//g, path.sep);
    const bases = importPath.startsWith('.') || !path.isAbsolute(normalizedImport)
      ? [path.resolve(fromDir, normalizedImport)]
      : [path.resolve(rootDir, normalizedImport), path.resolve(rootDir, 'src', normalizedImport)];

    return tryImportBases(bases, extensions, rootDir, knownFiles);
  };
}

export const resolveDartImport = createDartImportResolver(['', '.dart']);
