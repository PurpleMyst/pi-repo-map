import { describe, expect, test } from 'vitest';
import * as path from 'path';
import { getLanguageByFilePath, LANGUAGE_REGISTRY, resolveImportForFile } from '../src/languages';

function repoPath(root: string, relativePath: string): string {
  return path.join(root, relativePath);
}

describe('language registry', () => {
  test('provides source-of-truth hooks for supported parsed languages', () => {
    for (const language of LANGUAGE_REGISTRY.filter(language => language.wasmFile)) {
      expect(language.resolveImport).toEqual(expect.any(Function));
      expect(language.extractSymbols).toEqual(expect.any(Function));
    }
  });

  test('exposes import extraction from the registry', () => {
    const dart = getLanguageByFilePath('lib/main.dart');

    expect(dart?.extractImports?.(`
      import 'dart:math';
      import './helper.dart';
      export 'src/widget.dart';
      part 'parts/model.dart';
    `)).toEqual([
      'dart:math',
      './helper.dart',
      'src/widget.dart',
      'parts/model.dart',
    ]);
  });

  test('resolves Dart relative, package, and SDK imports through the registry', () => {
    const root = path.resolve('/repo');
    const importer = repoPath(root, 'lib/features/recipes/presentation/detail.dart');
    const theme = repoPath(root, 'lib/core/theme/alloro_theme.dart');
    const formatter = repoPath(root, 'lib/features/recipes/presentation/widgets/recipe_detail_formatters.dart');
    const knownFiles = new Set([importer, theme, formatter]);

    expect(resolveImportForFile(
      '../../../core/theme/alloro_theme.dart',
      importer,
      root,
      knownFiles
    )).toBe(theme);
    expect(resolveImportForFile(
      'widgets/recipe_detail_formatters.dart',
      importer,
      root,
      knownFiles
    )).toBe(formatter);
    expect(resolveImportForFile(
      'package:repo/core/theme/alloro_theme.dart',
      importer,
      root,
      knownFiles
    )).toBe(theme);
    expect(resolveImportForFile('dart:math', importer, root, knownFiles)).toBeNull();
  });
});
