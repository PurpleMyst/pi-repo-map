// Based on workflow-extension (ISC License)
// Copyright (c) 2026 popododo0720

import * as crypto from 'crypto';

export interface ParseSymbol {
  type: string;
  name: string;
  line: number;
  children?: ParseSymbol[];
}

export interface ParseResult {
  symbols: ParseSymbol[];
  imports: string[];
}

type Cache = Map<string, ParseResult>;

// Session-scoped cache keyed by SHA-256 of file content
const parseCache: Cache = new Map();

function contentHash(content: string): string {
  return crypto.createHash('sha256').update(content, 'utf-8').digest('hex');
}

export function getCachedParse(content: string): ParseResult | null {
  return parseCache.get(contentHash(content)) ?? null;
}

export function setCachedParse(content: string, result: ParseResult): void {
  parseCache.set(contentHash(content), result);
}

export function clearParseCache(): void {
  parseCache.clear();
}
