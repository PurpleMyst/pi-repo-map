import * as path from 'path';

export type LanguageId =
  | 'typescript'
  | 'tsx'
  | 'javascript'
  | 'python'
  | 'rust'
  | 'lua'
  | 'dart'
  | 'plain';

export interface SymbolNode {
  type: string;
  name: string;
  line: number;
  children?: SymbolNode[];
}

type TreeSitterNode = import('web-tree-sitter').Node;

export interface ImportResolutionContext {
  importPath: string;
  importerPath: string;
  rootDir: string;
  knownFiles: Set<string>;
}

export type ImportResolver = (context: ImportResolutionContext) => string | null;
export type SymbolExtractor = (node: TreeSitterNode) => SymbolNode[];
export type ImportExtractor = (source: string) => string[];

export interface LanguageConfig {
  id: LanguageId;
  extensions: string[];
  wasmFile?: string;
  resolveImport: ImportResolver;
  extractSymbols?: SymbolExtractor;
  extractImports?: ImportExtractor;
}

const JS_RESOLVE_EXTENSIONS = [
  '', '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs',
  '/index.ts', '/index.tsx', '/index.js', '/index.jsx',
];

const DEFAULT_RESOLVE_EXTENSIONS = [
  '', '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.py', '.rs', '.dart',
  '/index.ts', '/index.js', '/__init__.py', '/mod.rs',
];

const resolveUnknownImport = createPathImportResolver(['']);
const resolveJSImport = createPathImportResolver(JS_RESOLVE_EXTENSIONS);
const resolveDefaultImport = createPathImportResolver(DEFAULT_RESOLVE_EXTENSIONS);
const resolvePythonImport = createPythonImportResolver(['', '.py', '/__init__.py']);
const resolveRustImport = createRustImportResolver(['', '.rs', '/mod.rs']);
const resolveDartImport = createDartImportResolver(['', '.dart']);

export const LANGUAGE_REGISTRY: LanguageConfig[] = [
  {
    id: 'typescript',
    extensions: ['.ts'],
    wasmFile: 'tree-sitter-typescript.wasm',
    resolveImport: resolveJSImport,
    extractSymbols: extractJSSymbols,
    extractImports: extractJSImports,
  },
  {
    id: 'tsx',
    extensions: ['.tsx'],
    wasmFile: 'tree-sitter-tsx.wasm',
    resolveImport: resolveJSImport,
    extractSymbols: extractJSSymbols,
    extractImports: extractJSImports,
  },
  {
    id: 'javascript',
    extensions: ['.js', '.jsx', '.mjs', '.cjs'],
    wasmFile: 'tree-sitter-javascript.wasm',
    resolveImport: resolveJSImport,
    extractSymbols: extractJSSymbols,
    extractImports: extractJSImports,
  },
  {
    id: 'python',
    extensions: ['.py'],
    wasmFile: 'tree-sitter-python.wasm',
    resolveImport: resolvePythonImport,
    extractSymbols: extractPythonSymbols,
    extractImports: extractPythonImports,
  },
  {
    id: 'rust',
    extensions: ['.rs'],
    wasmFile: 'tree-sitter-rust.wasm',
    resolveImport: resolveRustImport,
    extractSymbols: extractRustSymbols,
    extractImports: extractRustImports,
  },
  {
    id: 'lua',
    extensions: ['.lua'],
    wasmFile: 'tree-sitter-lua.wasm',
    resolveImport: resolveDefaultImport,
    extractSymbols: extractLuaSymbols,
  },
  {
    id: 'dart',
    extensions: ['.dart'],
    wasmFile: 'tree-sitter-dart.wasm',
    resolveImport: resolveDartImport,
    extractSymbols: extractDartSymbols,
    extractImports: extractDartImports,
  },
  {
    id: 'plain',
    extensions: [
      '.go',
      '.java',
      '.c', '.cpp', '.h', '.hpp',
      '.cs',
      '.rb',
      '.swift',
      '.kt', '.kts',
      '.zig',
      '.ex', '.exs',
      '.scala',
      '.php',
      '.sh', '.bash', '.zsh',
      '.vue', '.svelte',
    ],
    resolveImport: resolveDefaultImport,
  },
];

const EXTENSION_TO_LANGUAGE = new Map<string, LanguageConfig>();

for (const language of LANGUAGE_REGISTRY) {
  for (const extension of language.extensions) {
    EXTENSION_TO_LANGUAGE.set(extension, language);
  }
}

export const SUPPORTED_EXTENSIONS = new Set(EXTENSION_TO_LANGUAGE.keys());

export function getLanguageByExtension(extension: string): LanguageConfig | undefined {
  return EXTENSION_TO_LANGUAGE.get(extension.toLowerCase());
}

export function getLanguageByFilePath(filePath: string): LanguageConfig | undefined {
  const dotIndex = filePath.lastIndexOf('.');
  if (dotIndex === -1) return undefined;

  return getLanguageByExtension(filePath.slice(dotIndex).toLowerCase());
}

export function resolveImportForFile(
  importPath: string,
  importerPath: string,
  rootDir: string,
  knownFiles: Set<string>
): string | null {
  const languageConfig = getLanguageByFilePath(importerPath);
  return (languageConfig?.resolveImport ?? resolveUnknownImport)({
    importPath,
    importerPath,
    rootDir,
    knownFiles,
  });
}

function isInside(childPath: string, parentPath: string): boolean {
  const relative = path.relative(parentPath, childPath);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

function tryCandidates(
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

function tryImportBases(
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

function createPathImportResolver(extensions: string[]): ImportResolver {
  return ({ importPath, importerPath, rootDir, knownFiles }) => {
    const fromDir = path.dirname(importerPath);
    const normalizedImport = importPath.replace(/^@\//, '').replace(/\//g, path.sep);
    const bases = importPath.startsWith('.')
      ? [path.resolve(fromDir, normalizedImport)]
      : [path.resolve(rootDir, normalizedImport), path.resolve(rootDir, 'src', normalizedImport)];

    return tryImportBases(bases, extensions, rootDir, knownFiles);
  };
}

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

function extractJSSymbols(
  node: TreeSitterNode,
  context: 'module' | 'class' | 'interface' = 'module'
): SymbolNode[] {
  const symbols: SymbolNode[] = [];

  for (const child of node.namedChildren) {
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
  for (const child of node.namedChildren) {
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

function extractPythonSymbols(
  node: TreeSitterNode,
  context: 'module' | 'class' = 'module'
): SymbolNode[] {
  const symbols: SymbolNode[] = [];

  for (const child of node.namedChildren) {
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

function extractRustSymbols(
  node: TreeSitterNode,
  context: 'module' | 'impl' | 'trait' = 'module'
): SymbolNode[] {
  const symbols: SymbolNode[] = [];

  for (const child of node.namedChildren) {
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

  const variableNode = node.namedChildren.find(child => child.type === 'variable');
  if (variableNode) {
    return variableNode.text.trim();
  }

  return getDeclarationName(node);
}

function extractLuaSymbols(node: TreeSitterNode): SymbolNode[] {
  const symbols: SymbolNode[] = [];

  for (const child of node.namedChildren) {
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
    const signature = node.namedChildren.find(child =>
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

function extractDartSymbols(
  node: TreeSitterNode,
  context: 'module' | 'class' = 'module'
): SymbolNode[] {
  const symbols: SymbolNode[] = [];

  for (const child of node.namedChildren) {
    if (child.type === 'class_definition') {
      const name = getDeclarationName(child);
      if (!name) continue;

      const body = child.namedChildren.find(node => node.type === 'class_body');
      const children = body ? extractDartSymbols(body, 'class') : [];
      symbols.push(createSymbol('class', name, child, children));
      continue;
    }

    if (child.type === 'mixin_declaration') {
      const name = getDeclarationName(child);
      if (!name) continue;

      const body = child.namedChildren.find(node => node.type === 'class_body');
      const children = body ? extractDartSymbols(body, 'class') : [];
      symbols.push(createSymbol('mixin', name, child, children));
      continue;
    }

    if (child.type === 'extension_declaration') {
      const name = getDeclarationName(child) ?? '<anonymous>';
      const body = child.namedChildren.find(node => node.type === 'extension_body');
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
      const signature = child.namedChildren.find(node =>
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
      for (const declaration of child.namedChildren) {
        const name = getDeclarationName(declaration);
        if (name) symbols.push(createSymbol('const', name, declaration));
      }
    }
  }

  return symbols;
}

function unique(values: string[]): string[] {
  return Array.from(new Set(values));
}

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

function extractJSImports(source: string): string[] {
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

function extractPythonImports(source: string): string[] {
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

function extractRustImports(source: string): string[] {
  const imports: string[] = [];
  for (const match of source.matchAll(/^\s*use\s+([^;]+);/gm)) {
    imports.push(...expandRustUseTree(match[1]));
  }
  return unique(imports);
}

function extractDartImports(source: string): string[] {
  const imports: string[] = [];
  const pattern = /^\s*(?:import|export|part)\s+['"]([^'"]+)['"]/gm;
  for (const match of source.matchAll(pattern)) {
    imports.push(match[1]);
  }
  return unique(imports);
}
