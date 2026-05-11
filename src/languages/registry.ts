import type { LanguageConfig } from './types';
import {
  resolveDartImport,
} from './dart';
import {
  resolveJSImport,
} from './js';
import {
  resolvePythonImport,
} from './python';
import {
  resolveRustImport,
} from './rust';
import {
  resolveDefaultImport,
  resolveUnknownImport,
} from './utils';
import {
  extractDartImports,
} from './dart';
import {
  extractJSImports,
} from './js';
import {
  extractPythonImports,
} from './python';
import {
  extractRustImports,
} from './rust';
import {
  extractDartSymbols,
} from './dart';
import {
  extractJSSymbols,
} from './js';
import {
  extractLuaSymbols,
} from './lua';
import {
  extractPythonSymbols,
} from './python';
import {
  extractRustSymbols,
} from './rust';


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

export function getLanguageByFilePath(filePath: string): LanguageConfig | undefined {
  const dotIndex = filePath.lastIndexOf('.');
  if (dotIndex === -1) return undefined;

  return EXTENSION_TO_LANGUAGE.get(filePath.slice(dotIndex).toLowerCase());
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
