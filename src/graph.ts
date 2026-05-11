// Based on workflow-extension (ISC License)
// Copyright (c) 2026 popododo0720

import * as path from 'path';
import type { FileInfo } from './collector';
import { resolveImportForFile } from './languages';

interface GraphNode {
  filePath: string;
  imports: string[];
  pagerank: number;
}

type FileGraph = Map<string, GraphNode>;

const DAMPING = 0.85;
const ITERATIONS = 30;

function getRootDir(files: FileInfo[]): string {
  const first = files[0];
  if (!first) return path.resolve('.');

  return path.resolve(first.path.substring(0, first.path.length - first.relativePath.length));
}

function buildGraph(
  files: FileInfo[],
  parseResults: Map<string, { imports: string[] }>
): FileGraph {
  const graph: FileGraph = new Map();
  const rootDir = getRootDir(files);
  const knownFiles = new Set(files.map(file => path.resolve(file.path)));

  for (const file of files) {
    const filePath = path.resolve(file.path);
    graph.set(filePath, {
      filePath,
      imports: [],
      pagerank: 1,
    });
  }

  for (const file of files) {
    const filePath = path.resolve(file.path);
    const node = graph.get(filePath);
    const result = parseResults.get(file.path) ?? parseResults.get(filePath);
    if (!node || !result) continue;

    const imports = new Set<string>();
    for (const importPath of result.imports) {
      // Parsers extract language-level import specifiers, but resolving them needs
      // the project root and collected-file set, both of which are graph concerns.
      const resolved = resolveImportForFile(importPath, filePath, rootDir, knownFiles);
      if (resolved && resolved !== filePath) {
        imports.add(resolved);
      }
    }
    node.imports = Array.from(imports);
  }

  return graph;
}

function applyPageRank(graph: FileGraph): void {
  const nodes = Array.from(graph.values());
  const n = nodes.length;
  if (n === 0) return;

  const incoming = new Map<string, GraphNode[]>();
  for (const node of nodes) {
    incoming.set(node.filePath, []);
  }

  for (const node of nodes) {
    for (const imported of node.imports) {
      incoming.get(imported)?.push(node);
    }
  }

  for (const node of nodes) {
    node.pagerank = 1 / n;
  }

  for (let iter = 0; iter < ITERATIONS; iter++) {
    const danglingSum = nodes
      .filter(node => node.imports.length === 0)
      .reduce((sum, node) => sum + node.pagerank, 0);

    const newRanks = new Map<string, number>();
    for (const node of nodes) {
      const incomingRank = (incoming.get(node.filePath) ?? [])
        .reduce((sum, other) => sum + other.pagerank / other.imports.length, 0);

      newRanks.set(
        node.filePath,
        (1 - DAMPING) / n + DAMPING * (danglingSum / n + incomingRank)
      );
    }

    for (const node of nodes) {
      node.pagerank = newRanks.get(node.filePath) ?? 0;
    }
  }
}

export type RankedFile = FileInfo & { pagerank: number };

export function processGraph(
  files: FileInfo[],
  parseResults: Map<string, { imports: string[] }>
): RankedFile[] {
  const graph = buildGraph(files, parseResults);
  applyPageRank(graph);

  return files.map(file => {
    const filePath = path.resolve(file.path);
    const node = graph.get(filePath);
    return {
      ...file,
      pagerank: node?.pagerank ?? 0,
    };
  }).sort((a, b) => b.pagerank - a.pagerank);
}
