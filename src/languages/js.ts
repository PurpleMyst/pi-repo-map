// Based on workflow-extension (ISC License)
// Copyright (c) 2026 popododo0720

import type { SymbolNode, TreeSitterNode } from './types';
import { createPathImportResolver } from './utils';
import { unique, getDeclarationName, presentChildren, createSymbol } from './utils';

// ---------------------------------------------------------------------------
// JavaScript / TypeScript import extraction
// ---------------------------------------------------------------------------

export function extractJSImports(source: string): string[] {
  const imports: string[] = [];
  const patterns = [
    /\bimport\s+(?:[^'";]*?\s+from\s+)?['"]([^'"]+)['"]/g,
    /\bexport\s+[^'";]*?\s+from\s+['"]([^'"]+)['"]/g,
    /\brequire\(\s*['"]([^'"]+)['"]\s*\)/g,
  ];

  for (const pattern of patterns) {
    for (const match of source.matchAll(pattern)) {
      imports.push(match[1]);
    }
  }

  return unique(imports);
}

// ---------------------------------------------------------------------------
// JavaScript / TypeScript import resolution
// ---------------------------------------------------------------------------

const JS_RESOLVE_EXTENSIONS = [
  '', '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs',
  '/index.ts', '/index.tsx', '/index.js', '/index.jsx',
];

export const resolveJSImport = createPathImportResolver(JS_RESOLVE_EXTENSIONS);

// ---------------------------------------------------------------------------
// JavaScript / TypeScript symbol extraction
// ---------------------------------------------------------------------------

export function extractJSSymbols(
  node: TreeSitterNode,
  context: 'module' | 'class' | 'interface' = 'module'
): SymbolNode[] {
  const symbols: SymbolNode[] = [];

  for (const child of presentChildren(node)) {
    symbols.push(...extractJSSymbol(child, context));
  }

  return symbols;
}

function extractJSSymbol(
  node: TreeSitterNode,
  context: 'module' | 'class' | 'interface'
): SymbolNode[] {
  if (node.type === 'export_statement') {
    const declaration = node.childForFieldName?.('declaration');
    return declaration ? extractJSSymbol(declaration, context) : [];
  }

  if (node.type === 'class_declaration') {
    const name = getDeclarationName(node);
    if (!name) return [];

    const body = node.childForFieldName?.('body');
    const children = body ? extractJSSymbols(body, 'class') : [];

    return [createSymbol('class', name, node, children)];
  }

  if (node.type === 'interface_declaration') {
    const name = getDeclarationName(node);
    if (!name) return [];

    const body = node.childForFieldName?.('body');
    const children = body ? extractJSSymbols(body, 'interface') : [];

    return [createSymbol('interface', name, node, children)];
  }

  if (
    node.type === 'method_definition' ||
    node.type === 'method_signature' ||
    node.type === 'abstract_method_signature'
  ) {
    const name = getDeclarationName(node);
    if (!name) return [];

    return [createSymbol('method', name, node)];
  }

  if (node.type === 'function_declaration') {
    const name = getDeclarationName(node);
    if (!name) return [];

    const symbolType = context === 'class' ? 'method' : 'function';
    return [createSymbol(symbolType, name, node)];
  }

  if (node.type === 'lexical_declaration' || node.type === 'variable_declaration') {
    return extractJSVariableSymbols(node);
  }

  if (node.type === 'type_alias_declaration' || node.type === 'enum_declaration') {
    const name = getDeclarationName(node);
    if (!name) return [];

    const symbolType = node.type === 'enum_declaration' ? 'enum' : 'type';
    return [createSymbol(symbolType, name, node)];
  }

  return [];
}

function extractJSVariableSymbols(node: TreeSitterNode): SymbolNode[] {
  let symbolType = 'var';
  const keyword = node.child(0)?.text.trim();
  if (keyword === 'const') symbolType = 'const';
  if (keyword === 'let') symbolType = 'let';

  const symbols: SymbolNode[] = [];
  for (const child of presentChildren(node)) {
    if (child.type !== 'variable_declarator') continue;

    const name = getDeclarationName(child);
    if (!name) continue;

    symbols.push(createSymbol(symbolType, name, child));
  }

  if (symbols.length === 0) {
    const fallbackName = getDeclarationName(node);
    if (fallbackName) {
      symbols.push(createSymbol(symbolType, fallbackName, node));
    }
  }

  return symbols;
}
