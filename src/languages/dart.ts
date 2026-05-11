// Based on workflow-extension (ISC License)
// Copyright (c) 2026 popododo0720

import * as path from 'path';
import type { ImportResolver, SymbolNode, TreeSitterNode } from './types';
import { tryImportBases } from './utils';
import { unique, getDeclarationName, presentChildren, createSymbol } from './utils';

// ---------------------------------------------------------------------------
// Dart import extraction
// ---------------------------------------------------------------------------

export function extractDartImports(source: string): string[] {
  const imports: string[] = [];
  const pattern = /^\s*(?:import|export|part)\s+['"]([^'"]+)['"]/gm;
  for (const match of source.matchAll(pattern)) {
    imports.push(match[1]);
  }
  return unique(imports);
}

// ---------------------------------------------------------------------------
// Dart import resolution
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Dart symbol extraction
// ---------------------------------------------------------------------------

function getLastDirectIdentifier(node: TreeSitterNode): string | null {
  for (let i = node.namedChildCount - 1; i >= 0; i--) {
    const child = node.namedChild(i);
    if (child?.type === 'identifier') {
      return child.text.trim();
    }
  }

  return null;
}

function getDartCallableName(node: TreeSitterNode): string | null {
  if (node.type === 'method_signature') {
    const signature = presentChildren(node).find(child =>
      child.type === 'function_signature' ||
      child.type === 'getter_signature' ||
      child.type === 'setter_signature' ||
      child.type === 'operator_signature'
    );
    return signature ? getDartCallableName(signature) : getLastDirectIdentifier(node);
  }

  if (node.type === 'operator_signature') {
    return node.text.replace(/\s+/g, ' ').trim();
  }

  return getLastDirectIdentifier(node);
}

export function extractDartSymbols(
  node: TreeSitterNode,
  context: 'module' | 'class' = 'module'
): SymbolNode[] {
  const symbols: SymbolNode[] = [];

  for (const child of presentChildren(node)) {
    if (child.type === 'class_definition') {
      const name = getDeclarationName(child);
      if (!name) continue;

      const body = presentChildren(child).find(node => node.type === 'class_body');
      const children = body ? extractDartSymbols(body, 'class') : [];
      symbols.push(createSymbol('class', name, child, children));
      continue;
    }

    if (child.type === 'mixin_declaration') {
      const name = getDeclarationName(child);
      if (!name) continue;

      const body = presentChildren(child).find(node => node.type === 'class_body');
      const children = body ? extractDartSymbols(body, 'class') : [];
      symbols.push(createSymbol('mixin', name, child, children));
      continue;
    }

    if (child.type === 'extension_declaration') {
      const name = getDeclarationName(child) ?? '<anonymous>';
      const body = presentChildren(child).find(node => node.type === 'extension_body');
      const children = body ? extractDartSymbols(body, 'class') : [];
      symbols.push(createSymbol('extension', name, child, children));
      continue;
    }

    if (child.type === 'enum_declaration') {
      const name = getDeclarationName(child);
      if (!name) continue;

      symbols.push(createSymbol('enum', name, child));
      continue;
    }

    if (child.type === 'method_signature' || child.type === 'function_signature') {
      const name = getDartCallableName(child);
      if (!name) continue;

      const symbolType = context === 'class' ? 'method' : 'function';
      symbols.push(createSymbol(symbolType, name, child));
      continue;
    }

    if (child.type === 'declaration') {
      const signature = presentChildren(child).find(node =>
        node.type === 'constructor_signature' ||
        node.type === 'constant_constructor_signature' ||
        node.type === 'factory_constructor_signature'
      );
      const name = signature ? getDartCallableName(signature) : null;
      if (name) {
        symbols.push(createSymbol('method', name, child));
      }
      continue;
    }

    if (child.type === 'static_final_declaration_list') {
      for (const declaration of presentChildren(child)) {
        const name = getDeclarationName(declaration);
        if (name) symbols.push(createSymbol('const', name, declaration));
      }
    }
  }

  return symbols;
}
