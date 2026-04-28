// Based on workflow-extension (ISC License)
// Copyright (c) 2026 popododo0720

interface RankedFile {
  path: string;
  relativePath: string;
  pagerank: number;
}

interface ParseSymbol {
  type: string;
  name: string;
  line: number;
  children?: ParseSymbol[];
}

const ESTIMATED_TOKEN_OVERHEAD = 50; // Headers, newlines, etc.

function flattenSymbolLines(symbols: ParseSymbol[], depth = 0): string[] {
  const lines: string[] = [];

  for (const symbol of symbols) {
    const indent = '  '.repeat(depth);
    lines.push(`│ ${indent}${symbol.type} ${symbol.name}`);

    if (symbol.children?.length) {
      lines.push(...flattenSymbolLines(symbol.children, depth + 1));
    }
  }

  return lines;
}

export function renderRepoMap(
  rankedFiles: RankedFile[],
  symbolsMap: Map<string, { symbols: ParseSymbol[] }>,
  tokenBudget: number
): string {
  const lines: string[] = [];
  let tokensUsed = 0;

  for (const file of rankedFiles) {
    const result = symbolsMap.get(file.path);
    const symbols = result?.symbols || [];

    const normalizedPath = file.relativePath.replace(/\\/g, '/');

    const fileLine = normalizedPath;
    const fileTokens = Math.ceil(fileLine.length / 4) + 1;

    const flattened = flattenSymbolLines(symbols);
    let symbolTokens = 0;
    for (const line of flattened) {
      symbolTokens += Math.ceil(line.length / 4) + 1;
    }

    const totalFileTokens = fileTokens + symbolTokens + ESTIMATED_TOKEN_OVERHEAD;

    if (tokensUsed + totalFileTokens > tokenBudget) {
      break;
    }

    tokensUsed += totalFileTokens;
    lines.push(normalizedPath);

    const maxSymbols = 20;
    const limitedSymbols = flattened.slice(0, maxSymbols);

    for (const line of limitedSymbols) {
      lines.push(line);
    }

    if (flattened.length > maxSymbols) {
      lines.push(`│ ... and ${flattened.length - maxSymbols} more`);
    }

    lines.push('');
  }

  return lines.join('\n').trim();
}

export function injectRepoMap(repoMap: string): string {
  if (!repoMap.trim()) return '';

  return `
# Project Structure

<project_structure>
${repoMap}
</project_structure>
`;
}
