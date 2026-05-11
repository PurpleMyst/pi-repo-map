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

export function extractJSImports(source: string): string[] {
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

export function extractPythonImports(source: string): string[] {
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

export function extractRustImports(source: string): string[] {
  const imports: string[] = [];
  for (const match of source.matchAll(/^\s*use\s+([^;]+);/gm)) {
    imports.push(...expandRustUseTree(match[1]));
  }
  return unique(imports);
}

export function extractDartImports(source: string): string[] {
  const imports: string[] = [];
  const pattern = /^\s*(?:import|export|part)\s+['"]([^'"]+)['"]/gm;
  for (const match of source.matchAll(pattern)) {
    imports.push(match[1]);
  }
  return unique(imports);
}
