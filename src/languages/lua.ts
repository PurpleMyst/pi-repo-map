// Based on workflow-extension (ISC License)
// Copyright (c) 2026 popododo0720

import type { SymbolNode, TreeSitterNode } from './types';
import { getDeclarationName, presentChildren, createSymbol } from './utils';

// ---------------------------------------------------------------------------
// Lua symbol extraction
// ---------------------------------------------------------------------------

function getLuaFunctionName(node: TreeSitterNode): string | null {
  const nameField = node.childForFieldName?.('name');
  if (nameField) {
    return nameField.text.trim();
  }

  const variableNode = presentChildren(node).find(child => child.type === 'variable');
  if (variableNode) {
    return variableNode.text.trim();
  }

  return getDeclarationName(node);
}

export function extractLuaSymbols(node: TreeSitterNode): SymbolNode[] {
  const symbols: SymbolNode[] = [];

  for (const child of presentChildren(node)) {
    if (child.type !== 'function_definition_statement') continue;

    const name = getLuaFunctionName(child);
    if (!name) continue;

    symbols.push(createSymbol('function', name, child));
  }

  return symbols;
}
