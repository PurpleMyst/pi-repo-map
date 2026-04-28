# Repo Map Extension

A Pi extension that automatically analyzes your project structure using tree-sitter and injects a "repo map" into the system prompt.

## Features

- **Tree-sitter parsing** for accurate symbol extraction
- **PageRank-based file ranking** - important files appear first
- **Multi-language support**: TypeScript, JavaScript, Python, Go, Rust, Java, C/C++, C#, Ruby, Swift, Kotlin, Dart, Lua, Zig, Elixir, Scala, PHP, Bash, Vue, Svelte
- **Automatic caching** with 30-second TTL
- **Configurable** via `.pi/repo-map.json`

## Installation

Install from GitHub with Pi:

```sh
pi install git:github.com/PurpleMyst/pi-repo-map
```

Restart Pi after installation if it is already running. Pi loads the extension from the `pi.extensions` entry in `package.json` on startup.

## Configuration

Create `.pi/repo-map.json` in your project root:

```json
{
  "enabled": true,
  "tokenBudget": 2048,
  "maxFiles": 500,
  "excludedDirs": ["node_modules", ".git", "dist"]
}
```

| Option | Default | Description |
|--------|---------|-------------|
| `enabled` | `true` | Enable/disable repo map injection |
| `tokenBudget` | `2048` | Max tokens for the repo map output |
| `maxFiles` | `500` | Maximum files to analyze |
| `excludedDirs` | (see below) | Additional directories to skip |

Default excluded directories:
- `node_modules`, `.git`, `dist`, `build`, `out`, `.next`, `.nuxt`
- `__pycache__`, `.venv`, `venv`, `vendor`, `.pi`, `.cache`
- `coverage`, `.turbo`, `target`, `bin`, `obj`, `.idea`, `.vscode`

## Usage

### Automatic Injection

The repo map is automatically injected into the system prompt when:
- A new session starts
- The current project directory changes
- The 30-second cache expires

### Commands

| Command | Description |
|---------|-------------|
| `/repo-map` | Generate and print the current repo map |

### Tools

| Tool | Description |
|------|-------------|
| `symbols` | Read a compact symbol outline for a single file |

### Flags

| Flag | Description |
|------|-------------|
| `--no-repo-map` | Disable repo map injection for the current session |

## Output Format

```
### Project Structure

<project_structure>
src/main.ts
│ function main
│ class App
│ method initialize

src/utils/helper.ts
│ function calculate
│ function format
</project_structure>
```

## How It Works

1. **File Discovery**: Walks the project directory, collecting supported source files
2. **Parsing**: Uses tree-sitter to extract symbols (functions, classes, etc.) and imports
3. **Graph Construction**: Builds a dependency graph from imports
4. **PageRank**: Ranks files by importance (files imported by many others rank higher)
5. **Rendering**: Outputs the repo map within the token budget, prioritizing important files

## Attribution

Based on tree-sitter parsing logic from [workflow-extension](https://github.com/popododo0720/workflow-extension).

## License

ISC License

Copyright (c) 2026 popododo0720

Permission to use, copy, modify, and/or distribute this software for any purpose with or without fee is hereby granted, provided that the above copyright notice and this permission notice appear in all copies.

THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES WITH REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR ANY SPECIAL, DIRECT, INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS, WHETHER IN AN ACTION OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION, ARISING OUT OF OR IN CONNECTION WITH THE USE OR PERFORMANCE OF THIS SOFTWARE.
