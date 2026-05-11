// Based on workflow-extension (ISC License)
// Copyright (c) 2026 popododo0720

export interface RepoMapConfig {
  enabled: boolean;
  tokenBudget: number;
  maxFiles: number;
  excludedDirs: string[];
}

const DEFAULT_EXCLUDED_DIRS = [
  'node_modules',
  '.git',
  'dist',
  'build',
  'out',
  '.next',
  '.nuxt',
  '__pycache__',
  '.venv',
  'venv',
  'vendor',
  '.pi',
  '.cache',
  'coverage',
  '.turbo',
  'target',
  'bin',
  'obj',
  '.idea',
  '.vscode',
];

const DEFAULT_CONFIG: RepoMapConfig = {
  enabled: true,
  tokenBudget: 2048,
  maxFiles: 500,
  excludedDirs: DEFAULT_EXCLUDED_DIRS,
};

export async function loadConfig(cwd: string): Promise<RepoMapConfig> {
  const configPath = `${cwd}/.pi/repo-map.json`;

  try {
    const fs = await import('fs/promises');
    const content = await fs.readFile(configPath, 'utf-8');
    const userConfig = JSON.parse(content);

    // Scalar options override defaults. excludedDirs is additive so projects can
    // add local exclusions without accidentally re-including default skip dirs.
    return {
      ...DEFAULT_CONFIG,
      ...userConfig,
      excludedDirs: [
        ...DEFAULT_CONFIG.excludedDirs,
        ...(userConfig.excludedDirs || []),
      ],
    };
  } catch {
    return DEFAULT_CONFIG;
  }
}
