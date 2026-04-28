import { describe, expect, test } from 'vitest';
import * as path from 'path';
import { processGraph } from '../src/graph';

function file(root: string, relativePath: string) {
  return {
    path: path.join(root, relativePath),
    relativePath,
  };
}

function parseResults(entries: Array<[string, string[]]>) {
  return new Map(entries.map(([filePath, imports]) => [filePath, { imports }]));
}

describe('processGraph PageRank', () => {
  test('ranks JavaScript files imported with extensionless relative paths', () => {
    const root = path.resolve('/repo');
    const files = [file(root, 'src/a.js'), file(root, 'src/b.js'), file(root, 'src/c.js')];
    const results = parseResults([
      [files[0].path, ['./b']],
      [files[2].path, ['./b.js']],
    ]);

    const ranked = processGraph(files, results);

    expect(ranked[0].relativePath).toBe('src/b.js');
    expect(ranked[0].pagerank).toBeGreaterThan(ranked[1].pagerank);
  });

  test('ranks Python files imported by relative and absolute module paths', () => {
    const root = path.resolve('/repo');
    const files = [file(root, 'pkg/a.py'), file(root, 'pkg/b.py'), file(root, 'pkg/c.py')];
    const results = parseResults([
      [files[0].path, ['./b']],
      [files[2].path, ['pkg.b', 'pkg.b.Symbol']],
    ]);

    const ranked = processGraph(files, results);

    expect(ranked[0].relativePath).toBe('pkg/b.py');
    expect(ranked[0].pagerank).toBeGreaterThan(ranked[1].pagerank);
  });

  test('ranks Rust modules imported through crate paths', () => {
    const root = path.resolve('/repo');
    const files = [file(root, 'src/main.rs'), file(root, 'src/util.rs'), file(root, 'src/other.rs')];
    const results = parseResults([
      [files[0].path, ['crate::util::Thing']],
      [files[2].path, ['crate::util']],
    ]);

    const ranked = processGraph(files, results);

    expect(ranked[0].relativePath).toBe('src/util.rs');
    expect(ranked[0].pagerank).toBeGreaterThan(ranked[1].pagerank);
  });

  test('ranks Dart files imported with relative and package paths', () => {
    const root = path.resolve('/repo');
    const files = [
      file(root, 'lib/features/recipes/presentation/detail.dart'),
      file(root, 'lib/core/theme/alloro_theme.dart'),
      file(root, 'lib/features/recipes/domain/recipe.dart'),
      file(root, 'lib/features/recipes/presentation/widgets/recipe_detail_formatters.dart'),
      file(root, 'lib/features/recipes/presentation/widgets/recipe_detail_widgets.dart'),
      file(root, 'lib/other.dart'),
    ];
    const results = parseResults([
      [files[0].path, [
        '../../../core/theme/alloro_theme.dart',
        '../domain/recipe.dart',
        'widgets/recipe_detail_formatters.dart',
        'widgets/recipe_detail_widgets.dart',
      ]],
      [files[5].path, ['package:repo/core/theme/alloro_theme.dart']],
    ]);

    const ranked = processGraph(files, results);
    const topPaths = ranked.slice(0, 5).map(item => item.relativePath);

    expect(topPaths).toContain('lib/core/theme/alloro_theme.dart');
    expect(topPaths).toContain('lib/features/recipes/domain/recipe.dart');
    expect(topPaths).toContain('lib/features/recipes/presentation/widgets/recipe_detail_formatters.dart');
    expect(topPaths).toContain('lib/features/recipes/presentation/widgets/recipe_detail_widgets.dart');
    expect(ranked.find(item => item.relativePath === 'lib/core/theme/alloro_theme.dart')?.pagerank)
      .toBeGreaterThan(ranked.find(item => item.relativePath === 'lib/other.dart')?.pagerank ?? 0);
  });

  test('deduplicates repeated imports so one file cannot overweight an edge', () => {
    const root = path.resolve('/repo');
    const files = [file(root, 'a.js'), file(root, 'b.js')];
    const results = parseResults([
      [files[0].path, ['./b', './b.js', './b']],
    ]);

    const ranked = processGraph(files, results);
    const totalRank = ranked.reduce((sum, item) => sum + item.pagerank, 0);

    expect(ranked[0].relativePath).toBe('b.js');
    expect(totalRank).toBeCloseTo(1, 8);
  });
});
