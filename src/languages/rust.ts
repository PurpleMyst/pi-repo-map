// Based on workflow-extension (ISC License)
// Copyright (c) 2026 popododo0720

import * as path from 'path';
import type { ImportResolver, SymbolNode, TreeSitterNode } from './types';
import { tryCandidates, tryImportBases } from './utils';
import { unique, getDeclarationName, presentChildren, createSymbol } from './utils';

// ---------------------------------------------------------------------------
// Rust import extraction
// ---------------------------------------------------------------------------

function splitTopLevelCommas(value: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let start = 0;

  for (let i = 0; i < value.length; i++) {
    const char = value[i];
    if (char === '{') depth++;
    if (char === '}') depth--;
    if (char === ',' && depth === 0) {
      parts.push(value.slice(start, i).trim());
      start = i + 1;
    }
  }

  parts.push(value.slice(start).trim());
  return parts.filter(Boolean);
}

function expandRustUseTree(value: string): string[] {
  const trimmed = value.trim();
  const open = trimmed.indexOf('{');
  if (open === -1) return [trimmed];

  let depth = 0;
  let close = -1;
  for (let i = open; i < trimmed.length; i++) {
    if (trimmed[i] === '{') depth++;
    if (trimmed[i] === '}') depth--;
    if (depth === 0) {
      close = i;
      break;
    }
  }
  if (close === -1) return [trimmed];

  const prefix = trimmed.slice(0, open).replace(/::$/, '');
  const suffix = trimmed.slice(close + 1).replace(/^::/, '');
  const inner = trimmed.slice(open + 1, close);
  const expanded: string[] = [];

  for (const part of splitTopLevelCommas(inner)) {
    const combined = [prefix, part, suffix].filter(Boolean).join('::');
    expanded.push(...expandRustUseTree(combined));
  }

  return expanded;
}

export function extractRustImports(source: string): string[] {
  const imports: string[] = [];
  for (const match of source.matchAll(/^\s*use\s+([^;]+);/gm)) {
    imports.push(...expandRustUseTree(match[1]));
  }
  return unique(imports);
}

// ---------------------------------------------------------------------------
// Rust import resolution
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Rust symbol extraction
// ---------------------------------------------------------------------------

function getRustImplName(node: TreeSitterNode): string | null {
  const traitNode = node.childForFieldName?.('trait');
  const typeNode = node.childForFieldName?.('type');

  const traitName = traitNode?.text.trim();
  const targetType = typeNode?.text.trim();

  if (traitName && targetType) {
    return `${traitName} for ${targetType}`;
  }

  if (targetType) {
    return targetType;
  }

  return getDeclarationName(node);
}

export function extractRustSymbols(
  node: TreeSitterNode,
  context: 'module' | 'impl' | 'trait' = 'module'
): SymbolNode[] {
  const symbols: SymbolNode[] = [];

  for (const child of presentChildren(node)) {
    if (child.type === 'declaration_list') {
      symbols.push(...extractRustSymbols(child, context));
      continue;
    }

    if (child.type === 'impl_item') {
      const name = getRustImplName(child);
      if (!name) continue;

      const children = extractRustSymbols(child, 'impl');
      symbols.push(createSymbol('impl', name, child, children));
      continue;
    }

    if (child.type === 'trait_item') {
      const name = getDeclarationName(child);
      if (!name) continue;

      const children = extractRustSymbols(child, 'trait');
      symbols.push(createSymbol('trait', name, child, children));
      continue;
    }

    if (child.type === 'function_item') {
      const name = getDeclarationName(child);
      if (!name) continue;

      const symbolType = context === 'impl' || context === 'trait' ? 'method' : 'function';
      symbols.push(createSymbol(symbolType, name, child));
      continue;
    }

    if (child.type === 'type_alias_item' || child.type === 'type_item') {
      const name = getDeclarationName(child);
      if (!name) continue;

      symbols.push(createSymbol('type', name, child));
      continue;
    }

    if (child.type === 'const_item') {
      const name = getDeclarationName(child);
      if (!name) continue;

      symbols.push(createSymbol('const', name, child));
      continue;
    }

    if (child.type === 'struct_item' || child.type === 'enum_item') {
      const name = getDeclarationName(child);
      if (!name) continue;

      const symbolType = child.type === 'struct_item' ? 'struct' : 'enum';
      symbols.push(createSymbol(symbolType, name, child));
      continue;
    }

    if (child.type === 'macro_rules') {
      const name = getDeclarationName(child);
      if (!name) continue;

      symbols.push(createSymbol('macro', name, child));
    }
  }

  return symbols;
}
