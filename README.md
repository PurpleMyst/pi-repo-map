# Repo Map Extension

A Pi extension that analyzes the current project with tree-sitter and injects a compact "repo map" into the agent system prompt.

## Features

- **Automatic repo map injection** before an agent starts, unless disabled by config or `--no-repo-map`
- **Tree-sitter-backed symbol extraction** for fully supported languages
- **Import-aware PageRank file ranking** for languages with import extraction
- **Compact rendering** within a configurable token budget
- **Automatic caching** with a 30-second repo-map cache plus content-based parse caching
- **Progress UI** while collecting, parsing, graphing, and rendering when Pi UI support is available
- **Configurable** via `.pi/repo-map.json`
- **Single-file `symbols` tool** for quick symbol outlines

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
| `enabled` | `true` | Enable/disable repo map injection and the `/repo-map` command for the project |
| `tokenBudget` | `2048` | Approximate max tokens for rendered repo map output |
| `maxFiles` | `500` | Maximum supported source files to collect and analyze |
| `excludedDirs` | (see below) | Additional directory names to skip; user entries are added to defaults |

Default excluded directories:
- `node_modules`, `.git`, `dist`, `build`, `out`, `.next`, `.nuxt`
- `__pycache__`, `.venv`, `venv`, `vendor`, `.pi`, `.cache`
- `coverage`, `.turbo`, `target`, `bin`, `obj`, `.idea`, `.vscode`

Files larger than 100KB are skipped.

## Usage

### Automatic Injection

The repo map is automatically injected into the system prompt when an agent starts, unless:
- `--no-repo-map` is set
- `.pi/repo-map.json` has `"enabled": false`
- Pi is running in the user's home directory

A generated map is reused for 30 seconds when the current working directory is unchanged.

### Commands

| Command | Description |
|---------|-------------|
| `/repo-map` | Generate and print the current repo map |

### Tools

| Tool | Description |
|------|-------------|
| `symbols` | Read a compact symbol outline for a single file |

For files/languages without symbol extraction, the tool returns `(no symbols found)`.

### Flags

| Flag | Description |
|------|-------------|
| `--no-repo-map` | Disable repo map injection for the current session |

## Language Support

"Supported" means the file extension is collected by the repo-map scanner. It does **not** mean every language has full symbol extraction, import extraction, or dependency ranking support.

| Level | Languages/extensions | Behavior |
|-------|----------------------|----------|
| Fully supported | TypeScript (`.ts`), TSX (`.tsx`), JavaScript (`.js`, `.jsx`, `.mjs`, `.cjs`), Python (`.py`), Rust (`.rs`), Dart (`.dart`) | Parsed with tree-sitter; symbols and imports are extracted; imports can contribute to dependency ranking |
| Symbols only | Lua (`.lua`) | Parsed with tree-sitter and symbols are extracted, but imports are not extracted |
| Collected only | Go (`.go`), Java (`.java`), C/C++ (`.c`, `.cpp`, `.h`, `.hpp`), C# (`.cs`), Ruby (`.rb`), Swift (`.swift`), Kotlin (`.kt`, `.kts`), Zig (`.zig`), Elixir (`.ex`, `.exs`), Scala (`.scala`), PHP (`.php`), shell (`.sh`, `.bash`, `.zsh`), Vue (`.vue`), Svelte (`.svelte`) | Files can appear in the repo map, but no tree-sitter parser, symbols, or imports are currently extracted |

If a parser WASM is unavailable or tree-sitter fails on a file, that file is kept with an empty symbol/import result and a warning may be reported.

## Output Format

```
### Project Structure

<project_structure>
src/main.ts
│ function main (line 1)
│ class App (line 5)
│   method initialize (line 6)

src/utils/helper.ts
│ function calculate (line 1)
│ function format (line 8)
</project_structure>
```

Each file is rendered as a normalized relative path followed by up to 20 symbol lines. Extra symbols are summarized with `│ ... and N more`.

## How It Works

1. **File discovery**: Recursively walks the project directory, collecting supported source files up to `maxFiles`, skipping excluded directories and files over 100KB
2. **Parsing**: Loads tree-sitter parsers where available and extracts symbols/imports for languages that implement extractors
3. **Graph construction**: Builds a dependency graph from extracted imports that resolve to collected files
4. **PageRank**: Ranks files by importance so files imported by others tend to appear earlier
5. **Rendering**: Outputs files and symbols within the token budget, then injects the map into the prompt

## Attribution

Based on tree-sitter parsing logic from [workflow-extension](https://github.com/popododo0720/workflow-extension).

## License

ISC License

Copyright (c) 2026 popododo0720

Permission to use, copy, modify, and/or distribute this software for any purpose with or without fee is hereby granted, provided that the above copyright notice and this permission notice appear in all copies.

THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES WITH REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR ANY SPECIAL, DIRECT, INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS, WHETHER IN AN ACTION OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION, ARISING OUT OF OR IN CONNECTION WITH THE USE OR PERFORMANCE OF THIS SOFTWARE.
