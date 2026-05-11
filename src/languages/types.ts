import type { Node } from 'web-tree-sitter';

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

export type TreeSitterNode = Node;

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
