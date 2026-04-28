import { beforeEach, describe, expect, test } from 'vitest';
import {
  clearParseCache,
  getCachedParse,
  setCachedParse,
  type ParseResult,
} from '../src/cache';

describe('content-addressable parse cache', () => {
  beforeEach(() => {
    clearParseCache();
  });

  test('returns null for unseen content', () => {
    expect(getCachedParse('unseen')).toBeNull();
  });

  test('returns stored parse result for identical content', () => {
    const content = 'export function greet() {}';
    const result: ParseResult = {
      symbols: [{ type: 'function', name: 'greet', line: 1 }],
      imports: [],
    };

    setCachedParse(content, result);

    expect(getCachedParse(content)).toEqual(result);
  });

  test('does not return entries for different content', () => {
    setCachedParse('function a() {}', {
      symbols: [{ type: 'function', name: 'a', line: 1 }],
      imports: [],
    });

    expect(getCachedParse('function b() {}')).toBeNull();
  });

  test('overwrites existing entry when same content is stored twice', () => {
    const content = 'function same() {}';

    setCachedParse(content, {
      symbols: [{ type: 'function', name: 'same', line: 1 }],
      imports: [],
    });

    const updated: ParseResult = {
      symbols: [{ type: 'function', name: 'same', line: 1 }],
      imports: ["import x from './x';"],
    };

    setCachedParse(content, updated);

    expect(getCachedParse(content)).toEqual(updated);
  });

  test('treats CRLF and LF as different content keys', () => {
    const lf = 'function a() {}\nfunction b() {}';
    const crlf = 'function a() {}\r\nfunction b() {}';

    setCachedParse(lf, {
      symbols: [{ type: 'function', name: 'a', line: 1 }],
      imports: [],
    });

    expect(getCachedParse(crlf)).toBeNull();
  });

  test('supports unicode and binary-like content', () => {
    const content = '// 你好\nconst bytes = "\x00\x01";';
    const result: ParseResult = {
      symbols: [{ type: 'const', name: 'bytes', line: 2 }],
      imports: [],
    };

    setCachedParse(content, result);

    expect(getCachedParse(content)).toEqual(result);
  });
});
