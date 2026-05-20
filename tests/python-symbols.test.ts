import { describe, test, expect } from 'vitest';
import { extractPythonSymbols } from '../src/languages/python';
import type { TreeSitterNode } from '../src/languages/types';

// ---------------------------------------------------------------------------
// Mock helpers — builds minimal tree-sitter Node shapes that the extraction
// functions actually touch (presentChildren, getDeclarationName, createSymbol).
// ---------------------------------------------------------------------------

function mockNode(overrides: Partial<ReturnType<typeof buildNode>> = {}): TreeSitterNode {
  const node = buildNode(overrides);
  return node as unknown as TreeSitterNode;
}

function buildNode(overrides: Partial<{
  type: string;
  namedChildren: TreeSitterNode[];
  childForFieldName: ((name: string) => TreeSitterNode | null) | undefined;
  child: (index: number) => TreeSitterNode | null;
  childCount: number;
  startPosition: { row: number; column: number };
  text: string;
  children: TreeSitterNode[];
}> = {}) {
  const defaultChildFn: (index: number) => TreeSitterNode | null = () => null;

  const namedChildren = overrides.namedChildren ?? [];
  const children = overrides.children ?? [];

  return {
    type: overrides.type ?? 'ERROR',
    namedChildren,
    childForFieldName: overrides.childForFieldName ?? (() => null),
    child: overrides.child ?? defaultChildFn,
    childCount: overrides.childCount ?? 0,
    startPosition: overrides.startPosition ?? { row: 0, column: 0 },
    text: overrides.text ?? '',
    children,
  };
}

// ---------------------------------------------------------------------------
// Helper to build an identifier child node with field-name lookup
// ---------------------------------------------------------------------------

function nameNode(name: string, row: number): TreeSitterNode {
  const node = mockNode({
    type: 'identifier',
    text: name,
    startPosition: { row, column: 4 },
  });
  return node;
}

function bodyNode(children: TreeSitterNode[] = []): TreeSitterNode {
  return mockNode({
    type: 'block',
    namedChildren: children,
  });
}

function functionDef(name: string, row: number): TreeSitterNode {
  const idNode = nameNode(name, row);
  const body = bodyNode();
  return mockNode({
    type: 'function_definition',
    namedChildren: [idNode, body],
    childForFieldName: (field: string) => {
      if (field === 'name') return idNode;
      if (field === 'body') return body;
      return null;
    },
    childCount: 2,
    startPosition: { row, column: 0 },
  });
}

function asyncFunctionDef(name: string, row: number): TreeSitterNode {
  const idNode = nameNode(name, row);
  const body = bodyNode();
  return mockNode({
    type: 'async_function_definition',
    namedChildren: [idNode, body],
    childForFieldName: (field: string) => {
      if (field === 'name') return idNode;
      if (field === 'body') return body;
      return null;
    },
    childCount: 2,
    startPosition: { row, column: 0 },
  });
}

function classDef(name: string, row: number, members: TreeSitterNode[] = []): TreeSitterNode {
  const idNode = nameNode(name, row);
  const body = bodyNode(members);
  return mockNode({
    type: 'class_definition',
    namedChildren: [idNode, ...(members.length ? [body] : [body])],
    childForFieldName: (field: string) => {
      if (field === 'name') return idNode;
      if (field === 'body') return body;
      return null;
    },
    childCount: 2,
    startPosition: { row, column: 0 },
  });
}

function decoratedDefinition(inner: TreeSitterNode, row: number): TreeSitterNode {
  const decorator = mockNode({
    type: 'decorator',
    text: '@some_decorator',
    startPosition: { row, column: 0 },
  });
  return mockNode({
    type: 'decorated_definition',
    namedChildren: [decorator, inner],
    childCount: 2,
    startPosition: { row, column: 0 },
  });
}

// ---------------------------------------------------------------------------

describe('Python symbol extraction', () => {
  test('extracts bare function_definition', () => {
    const moduleNode = mockNode({
      type: 'module',
      namedChildren: [functionDef('hello', 0)],
    });

    const symbols = extractPythonSymbols(moduleNode);
    expect(symbols).toEqual([{ type: 'function', name: 'hello', line: 1 }]);
  });

  test('extracts bare async function_definition', () => {
    const moduleNode = mockNode({
      type: 'module',
      namedChildren: [asyncFunctionDef('fetch_data', 0)],
    });

    const symbols = extractPythonSymbols(moduleNode);
    expect(symbols).toEqual([{ type: 'function', name: 'fetch_data', line: 1 }]);
  });

  test('extracts bare class_definition', () => {
    const moduleNode = mockNode({
      type: 'module',
      namedChildren: [classDef('MyClass', 0)],
    });

    const symbols = extractPythonSymbols(moduleNode);
    expect(symbols).toEqual([{ type: 'class', name: 'MyClass', line: 1 }]);
  });

  test('extracts decorated function_definition — THE BUG', () => {
    const inner = functionDef('hello', 1);
    const decorated = decoratedDefinition(inner, 0);

    const moduleNode = mockNode({
      type: 'module',
      namedChildren: [decorated],
    });

    const symbols = extractPythonSymbols(moduleNode);

    // Currently extractPythonSymbols does NOT look inside
    // decorated_definition nodes, so this will FAIL — hello is
    // not extracted.  Once the fix is in place, hello should appear.
    expect(symbols).toEqual([{ type: 'function', name: 'hello', line: 2 }]);
  });

  test('extracts decorated async function_definition', () => {
    const inner = asyncFunctionDef('background_task', 1);
    const decorated = decoratedDefinition(inner, 0);

    const moduleNode = mockNode({
      type: 'module',
      namedChildren: [decorated],
    });

    const symbols = extractPythonSymbols(moduleNode);
    expect(symbols).toEqual([{ type: 'function', name: 'background_task', line: 2 }]);
  });

  test('extracts decorated class_definition', () => {
    const inner = classDef('Singleton', 1);
    const decorated = decoratedDefinition(inner, 0);

    const moduleNode = mockNode({
      type: 'module',
      namedChildren: [decorated],
    });

    const symbols = extractPythonSymbols(moduleNode);
    expect(symbols).toEqual([{ type: 'class', name: 'Singleton', line: 2 }]);
  });

  test('extracts decorated function inside a class', () => {
    const methodDef = functionDef('route', 1);
    const decoratedMethod = decoratedDefinition(methodDef, 0);
    const cls = classDef('Controller', 0, [decoratedMethod]);

    const moduleNode = mockNode({
      type: 'module',
      namedChildren: [cls],
    });

    const symbols = extractPythonSymbols(moduleNode);
    expect(symbols).toEqual([
      {
        type: 'class',
        name: 'Controller',
        line: 1,
        children: [
          { type: 'method', name: 'route', line: 2 },
        ],
      },
    ]);
  });

  test('extracts multiple decorators stacked on same definition', () => {
    const inner = functionDef('multi_decorated', 2);
    const decorator1 = mockNode({ type: 'decorator', text: '@app.route("/")', startPosition: { row: 0, column: 0 } });
    const decorator2 = mockNode({ type: 'decorator', text: '@auth.required', startPosition: { row: 1, column: 0 } });
    const decorated = mockNode({
      type: 'decorated_definition',
      namedChildren: [decorator1, decorator2, inner],
      childCount: 3,
      startPosition: { row: 0, column: 0 },
    });

    const moduleNode = mockNode({
      type: 'module',
      namedChildren: [decorated],
    });

    const symbols = extractPythonSymbols(moduleNode);
    expect(symbols).toEqual([{ type: 'function', name: 'multi_decorated', line: 3 }]);
  });

  test('mixes bare and decorated definitions', () => {
    const bare = functionDef('bare', 0);
    const decorated = decoratedDefinition(functionDef('decorated', 2), 1);

    const moduleNode = mockNode({
      type: 'module',
      namedChildren: [bare, decorated],
    });

    const symbols = extractPythonSymbols(moduleNode);
    expect(symbols).toEqual([
      { type: 'function', name: 'bare', line: 1 },
      { type: 'function', name: 'decorated', line: 3 },
    ]);
  });
});
