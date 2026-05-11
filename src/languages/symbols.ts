import type { SymbolNode, TreeSitterNode } from './types';

function getDeclarationName(node: TreeSitterNode): string | null {
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

function presentChildren(node: TreeSitterNode): TreeSitterNode[] {
  return node.namedChildren.filter((child): child is TreeSitterNode => child !== null);
}

function createSymbol(
  type: string,
  name: string,
  node: TreeSitterNode,
  children: SymbolNode[] = []
): SymbolNode {
  return children.length > 0
    ? { type, name, line: node.startPosition.row + 1, children }
    : { type, name, line: node.startPosition.row + 1 };
}

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

export function extractPythonSymbols(
  node: TreeSitterNode,
  context: 'module' | 'class' = 'module'
): SymbolNode[] {
  const symbols: SymbolNode[] = [];

  for (const child of presentChildren(node)) {
    if (child.type === 'class_definition') {
      const name = getDeclarationName(child);
      if (!name) continue;

      const body = child.childForFieldName?.('body');
      const children = body ? extractPythonSymbols(body, 'class') : [];
      symbols.push(createSymbol('class', name, child, children));
      continue;
    }

    if (child.type === 'function_definition' || child.type === 'async_function_definition') {
      const name = getDeclarationName(child);
      if (!name) continue;

      const symbolType = context === 'class' ? 'method' : 'function';
      symbols.push(createSymbol(symbolType, name, child));
    }
  }

  return symbols;
}

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
