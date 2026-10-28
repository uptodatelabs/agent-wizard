# AgentWizard

AI coding assistant configuration wizard. Set up your AI tools in minutes, not hours.

[![npm version](https://img.shields.io/npm/v/agent-wizard.svg)](https://www.npmjs.com/package/agent-wizard)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![CI](https://github.com/uptodatelabs/agent-wizard/actions/workflows/ci.yml/badge.svg)](https://github.com/uptodatelabs/agent-wizard/actions/workflows/ci.yml)
[![Ko-fi](https://img.shields.io/badge/Ko--fi-FF5E5B?style=for-the-badge&logo=ko-fi&logoColor=white)](https://ko-fi.com/uptodatelabs)
[![GitHub Sponsors](https://img.shields.io/badge/Sponsor-AgentWizard-ea4aaa?style=for-the-badge&logo=githubsponsors&logoColor=white)](https://github.com/sponsors/uptodatelabs)

## Overview

AgentWizard is a CLI tool that helps you configure and manage AI coding assistants across multiple platforms. Instead of manually setting up each tool, AgentWizard provides a unified interface to configure, manage, and sync your AI assistant settings.

### Why AgentWizard?

- **Multiple Tools, One Interface**: Configure Claude Code, Cursor, GitHub Copilot, Aider, OpenClaw, and Hermes from a single CLI
- **Smart Detection**: Automatically detect your project type, tech stack, and existing AI tool configurations
- **Profile Management**: Create and manage profiles for different projects or workflows
- **Interactive Dashboard**: A design-token based Ink TUI for monitoring and editing every agent in one place
- **Sync Capabilities**: Keep your configurations in sync across different tools
- **Non-destructive**: Existing tool configuration is always preserved (merged, never overwritten), and every write is preceded by a timestamped backup

## Installation

### Prerequisites

- **Node.js 20.0.0 or higher** (`engines.node` in `package.json` enforces `>=20.0.0`; CI runs on Node 20 and 22)
- npm (comes with Node.js)

### Install

```bash
npm install -g agent-wizard
```

### Verify Installation

```bash
agent-wizard --version
```

### Run without installing

```bash
npx agent-wizard detect
```

## Quick Start

### 1. Detect Your Project

```bash
agent-wizard detect
```

This will scan your project and show:

- Project type (web, mobile, CLI, library, api, unknown)
- Programming languages
- Frameworks
- Existing AI tool configurations (detected from each tool's real config location)

### 2. Initialize Configuration

```bash
agent-wizard init
```

This launches an interactive wizard that will:

1. Detect your project
2. Ask which AI tools you want to configure
3. Guide you through settings for each tool
4. Apply the configuration (merging into each tool's existing config)

> `agent-wizard configure` runs the exact same interactive flow as `init`.

> `init` and `configure` require an interactive terminal. In CI or a piped shell they exit with a non-zero code and a clear message instead of silently doing nothing. Use `profile create` + `agent add` + `sync to-tools` for non-interactive setups.

### 3. Check Status

```bash
agent-wizard status list
```

Shows the status of all supported tools and their configurations.

### 4. Launch the Dashboard

```bash
agent-wizard dashboard
```

Opens an interactive TUI to monitor and edit all of your AI assistants.

## CLI Commands

### Core Commands

| Command | Description |
|---------|-------------|
| `agent-wizard init` | Initialize project configuration (interactive wizard) |
| `agent-wizard detect` | Detect project type and tech stack |
| `agent-wizard configure` | Interactive configuration wizard (same flow as `init`) |
| `agent-wizard validate` | Validate configuration for all detected tools |
| `agent-wizard list` | List detected configurations |

### Profile Management

| Command | Description |
|---------|-------------|
| `agent-wizard profile list` | List all profiles |
| `agent-wizard profile create <name>` | Create a new profile |
| `agent-wizard profile show <name>` | Show profile details |
| `agent-wizard profile delete <name>` | Delete a profile |
| `agent-wizard profile use <name>` | Set default profile |
| `agent-wizard profile export <name>` | Export profile to stdout |
| `agent-wizard profile import` | Import profile from stdin |

Profile names are validated before use: empty names, path separators (`/`, `\`), `.`/`..`, control characters, and leading/trailing whitespace are rejected. This keeps `profile delete`/`import` from ever touching anything outside the profiles directory.

Profile files are also validated on read against a runtime schema (zod), so a hand-edited or truncated profile fails with a clear message instead of propagating `undefined` into a tool config.

### Agent Management

| Command | Description |
|---------|-------------|
| `agent-wizard agent add <profile> <tool>` | Add agent to profile |
| `agent-wizard agent remove <profile> <agentId>` | Remove agent from profile |
| `agent-wizard agent config <profile> <agentId> <key> <value>` | Update agent setting (dot-notation keys supported, e.g. `terminal.timeout`) |
| `agent-wizard agent list <profile>` | List agents in profile |

Adding the same tool twice to one profile is supported: the second agent is stored with a suffixed id (`tool-2`, `tool-3`, …) so both keep independent settings.

### OpenClaw Direct Agent Management

Manage agents in your real OpenClaw config (`~/.openclaw/openclaw.json`) directly — without going through a profile. Supports the `agents.list` (array) and `agents.entries` (record) shapes, and preserves every other key (`channels`, `models`, `mcp`, ...) on write.

| Command | Description |
|---------|-------------|
| `agent-wizard openclaw configure` | **Interactive wizard**: lists agents, then add / remove / edit each one (known fields + any custom key via dot-notation). Requires a TTY. |
| `agent-wizard openclaw list` | List configured agents |
| `agent-wizard openclaw show <id>` | Show one agent's full config (JSON) |
| `agent-wizard openclaw add <id>` | Add an agent (`-n/--name`, `-m/--model`, `-w/--workspace`) |
| `agent-wizard openclaw set <id> <key> <value>` | Set a key (dot-notation, e.g. `tools.profile` or `identity.emoji`); value is parsed as JSON when possible |
| `agent-wizard openclaw unset <id> <key>` | Delete a key from an agent |
| `agent-wizard openclaw remove <id>` | Remove an agent |

Example — add a custom field and read it back:

```bash
agent-wizard openclaw add researcher -n "Researcher" -m "anthropic/claude-opus"
agent-wizard openclaw set researcher subagents.max 8
agent-wizard openclaw show researcher
# => { "id": "researcher", "name": "Researcher", "model": "anthropic/claude-opus", "subagents": { "max": 8 } }
```

### Common Agent Editor (all tools)

`agent-wizard agents <subcommand> <tool> ...` is the **tool-agnostic** editor. Every
supported tool implements the same `AgentEditorPort`, so the same commands work for
all of them.

**Supported tools and their agent model:**

| Tool | Agent unit | Add/Remove? |
|------|-----------|-------------|
| `openclaw` | each entry in `agents.list` (rich JSON object) | ✅ |
| `hermes` | each `agent.personalities` entry (name → instructions) | ✅ |
| `claude-code` | the single `settings.json` (user scope) | key edit only |
| `cursor` | each `.cursor/rules/agent-wizard-*.mdc` file | ✅ |
| `copilot` | `copilot-instructions.md` + `.github/instructions/*.instructions.md` | ✅ |
| `aider` | the single `.aider.conf.yml` | key edit only |

Every write creates a timestamped backup (`<file>.bak-YYYYMMDD-HHMMSS`) before
overwriting, and preserves unrelated keys (non-destructive).

| Command | Description |
|---------|-------------|
| `agent-wizard agents list <tool>` | List agents for a tool |
| `agent-wizard agents show <tool> <id>` | Show one agent's full config (raw JSON) |
| `agent-wizard agents add <tool> <id>` | Add an agent (`-n/--name`, `-m/--model`, `-w/--workspace`) |
| `agent-wizard agents set <tool> <id> <key> <value>` | Set a key (dot-notation; JSON parsed when possible) |
| `agent-wizard agents unset <tool> <id> <key>` | Delete a key from an agent |
| `agent-wizard agents remove <tool> <id>` | Remove an agent |

Examples (any tool):

```bash
agent-wizard agents list hermes
agent-wizard agents set hermes coder instructions '"You are a senior backend engineer."'
agent-wizard agents set claude-code user model '"claude-sonnet"'
agent-wizard agents add cursor my-rule -n "My Rule"
agent-wizard agents show openclaw coder
```

> **Multiple agents per tool are kept separate.** Cursor gets one rule file per agent
> (`agent-wizard-<id>.mdc`), and Copilot writes each agent into its own
> `<!-- agent-wizard:<id> -->`…`<!-- /agent-wizard:<id> -->` block inside
> `copilot-instructions.md`. Editing one agent never overwrites another, and any
> content you wrote outside those blocks is preserved.

### Dashboard

`agent-wizard dashboard` is an interactive TUI built on Ink, styled through the design
tokens in [`src/tui/theme.ts`](src/tui/theme.ts). The full specification lives in
[`docs/TUI_DESIGN.md`](docs/TUI_DESIGN.md).

**Layout**

- **≥ 96 columns** — two panes: the tool list on the left, the selected tool's card on the right.
- **< 96 columns** — collapses to a single column so nothing is clipped.
- The first load shows a skeleton with the final layout height (no frame jump); background
  refreshes show a header spinner instead.
- Status refreshes automatically every 30 seconds, or immediately with `r`.
- Transient results appear in a toast that clears itself after a few seconds.

**Keys**

| View | Keys |
|------|------|
| Tools | `↑`/`↓` navigate · `Enter` open agents · `a` action palette · `r` refresh · `?` help · `q` quit |
| Agents | `↑`/`↓` select · `Enter` edit settings · `a` action palette · `Esc` back to tools · `r` refresh · `?` help |
| Editor | `↑`/`↓` select setting · `e` edit value · `a` add key (dot-notation, e.g. `tools.profile`) · `d` delete key · `Esc` back to agents · `?` help |
| Global | `?` toggle help · `Ctrl+C` quit immediately |

All edits are written back non-destructively (existing keys and unrelated config
preserved). Input is scoped to the active view, so typing `q` into a field cannot also
navigate away.

### Status & Monitoring

| Command | Description |
|---------|-------------|
| `agent-wizard status list` | Show status of all tools |
| `agent-wizard status show <tool>` | Show detailed status for a specific tool |
| `agent-wizard dashboard` | Launch interactive dashboard |

**Status semantics** — status is derived from real checks, not file presence alone:

| Status | Meaning |
|--------|---------|
| `active` | Config exists, is schema-valid, **and** the tool's CLI binary is on your PATH |
| `configured` | Config exists and is valid (binary not detected) |
| `error` | Config exists but failed to parse or failed schema validation |
| `not-configured` | No config file found |

> GitHub Copilot has no standalone CLI binary, so a valid Copilot config reports `configured`. `status show <tool>` also reports `configValid` (`Yes` / `No` / `N/A`) so you can tell "absent" from "broken".

### Sync

| Command | Description |
|---------|-------------|
| `agent-wizard sync to-tools <profile>` | Merge profile settings into tool configurations |
| `agent-wizard sync to-tools <profile> --dry-run` | Preview exactly what would be written (create / modify / unchanged) **without touching any file** |
| `agent-wizard sync from-tools` | Import existing tool configurations into a new profile |

Every write is preceded by an automatic timestamped backup (`<file>.bak-YYYYMMDD-HHMMSS`), and existing config files are merged — never replaced wholesale. Use `--dry-run` to inspect the change before applying:

```bash
# Preview first
agent-wizard sync to-tools my-project --dry-run
#   ＋ openclaw: ~/.openclaw/openclaw.json (will be created)
#   ↻ claude-code: ~/.claude/settings.json (will be modified)
#   ＝ aider: .aider.conf.yml (unchanged)

# Then apply
agent-wizard sync to-tools my-project
```

If any tool fails to sync, the command exits with a non-zero code and prints the reason per tool.

## Supported Tools

| Tool | Config Format | Config Location | Status |
|------|---------------|-----------------|--------|
| **OpenClaw** | JSON5 | `~/.openclaw/openclaw.json` | ✅ Supported |
| **Hermes** | YAML | `~/.hermes/config.yaml` | ✅ Supported |
| **Claude Code** | JSON | `~/.claude/settings.json` (user) or `.claude/settings.json` (project) | ✅ Supported |
| **Cursor** | Markdown (.mdc) | `.cursor/rules/` | ✅ Supported |
| **GitHub Copilot** | Markdown | `.github/copilot-instructions.md`, `.github/instructions/*.instructions.md` | ✅ Supported |
| **Aider** | YAML | `.aider.conf.yml` (cwd or home) | ✅ Supported |

### Notes on configuration locations

- **OpenClaw**, **Hermes**, and **Claude Code** are user-global tools. AgentWizard reads/writes their config in your home directory (`~`). Claude Code also supports a project-scoped `.claude/settings.json` for detection.
- **Cursor**, **GitHub Copilot**, and **Aider** are project-scoped. AgentWizard reads/writes them **relative to the current working directory**, so running the CLI inside a different project targets that project's files.

## Non-destructive configuration

AgentWizard never destroys your existing tool configuration:

- When writing to OpenClaw, Hermes, Claude Code, or Aider, the existing file is read first and your new settings are **merged** into it. Untouched keys (channels, providers, mcp servers, hooks, sandbox, env, etc.) are preserved.
- For Cursor, AgentWizard writes dedicated `agent-wizard-*.mdc` rule files, leaving your other rules untouched.
- For Copilot, pre-existing custom instructions outside the AgentWizard-managed blocks are preserved.
- User-supplied secrets (API keys, bot tokens) in config files are left as-is; AgentWizard does not regenerate or overwrite them.

### Backup safety

- Every configuration write is preceded by a timestamped copy (`<file>.bak-YYYYMMDD-HHMMSS`), so any change can be reverted by hand.
- **A failed backup aborts the write.** If the backup cannot be created (permissions, disk full, …), AgentWizard stops with an error rather than overwriting your config with no restore point.
- Retention is bounded: the newest **10** backups per file are kept and older ones are pruned. Only files matching AgentWizard's own `.bak-<timestamp>[-N]` pattern are ever deleted.
- Declining the confirmation prompt in the wizard (or cancelling) leaves the filesystem untouched — including when AgentWizard is used as a library.

## `validate` behavior

`agent-wizard validate` checks each detected tool's configuration against a **zod schema** (required fields, correct types) — not just whether the file can be parsed. Example checks: OpenClaw requires `agents.defaults.workspace`; Claude Code requires `permissions.allow`/`deny` to be arrays when present; Cursor `.mdc` rule files and Copilot `.instructions.md` files must have valid frontmatter with correctly-typed fields. Unknown keys are ignored (tool configs legitimately gain new fields), so validation flags real breakage without false positives.

## Configuration Examples

### Creating a Profile

```bash
# Create a new profile
agent-wizard profile create my-project

# Add agents to the profile
agent-wizard agent add my-project claude-code
agent-wizard agent add my-project cursor

# Configure agent settings (dot-notation key)
agent-wizard agent config my-project claude-code model claude-sonnet-4-20250514

# View the profile
agent-wizard profile show my-project
```

### Syncing Configurations

```bash
# Import existing configurations
agent-wizard sync from-tools

# Preview what would change (writes nothing)
agent-wizard sync to-tools my-project --dry-run

# Merge profile settings into tools (preserves existing tool config, creates backups)
agent-wizard sync to-tools my-project
```

### Using the Dashboard

```bash
# Launch the dashboard
agent-wizard dashboard

# Navigation (see the table above for the full list):
# - ↑/↓      move within the current list
# - Enter    drill in (tools → agents → editor)
# - a        contextual action palette
# - Esc      back one level
# - r        refresh status now (otherwise every 30s)
# - ?        full keyboard help
# - q        quit (in the tool list)
```

## Environment Variables

| Variable | Default | Effect |
|----------|---------|--------|
| `AGENT_WIZARD_BACKUP_KEEP` | `10` | Backups retained per config file. `0` disables pruning. |
| `NO_COLOR` | unset | When set, the dashboard renders without colour. Colour is also disabled automatically when stdout is not a TTY, so piping to a file or `tee` stays readable. |

## Project Structure

```
agent-wizard/
├── src/
│   ├── adapters/           # Tool-specific adapters (detect/read/write/validate + merge)
│   │   ├── index.ts        # single adapter registry
│   │   ├── openclaw.ts
│   │   ├── hermes.ts
│   │   ├── claude-code.ts
│   │   ├── cursor.ts
│   │   ├── copilot.ts
│   │   └── aider.ts
│   ├── core/               # Core functionality
│   │   ├── types.ts
│   │   ├── models.ts       # model catalogue
│   │   ├── detector.ts
│   │   ├── wizard.ts
│   │   ├── agent-wizard.ts # library facade
│   │   ├── profile.ts
│   │   ├── profile-manager.ts
│   │   ├── sync.ts         # merge-based sync + --dry-run
│   │   ├── backup.ts       # timestamped backups + retention
│   │   ├── tool-check.ts   # PATH binary detection for status
│   │   ├── tools.ts        # supported-tool registry
│   │   ├── status.ts
│   │   ├── status-adapter.ts
│   │   ├── agent-editor.ts # tool-agnostic agent editor port
│   │   ├── agent-wizard.ts
│   │   └── editors/        # per-tool editor implementations
│   ├── schemas/            # zod schemas for tool configs + profiles
│   │   ├── tool-schemas.ts
│   │   └── profile-schema.ts
│   ├── tui/                # design system for the dashboard
│   │   ├── theme.ts        # semantic colour/glyph/spacing tokens
│   │   ├── keymap.ts       # single source of truth for shortcuts + help
│   │   ├── components/     # Panel, Header, GradientText, ToolList, Spinner, ...
│   │   └── hooks/          # useListNavigation, useSpinner, useTerminalSize, useToast
│   ├── dashboard/          # Ink dashboard
│   │   ├── index.tsx
│   │   └── components/
│   ├── cli/                # CLI entry point
│   │   └── index.ts
│   └── __tests__/          # Tests (unit + integration + CLI E2E + TUI)
├── dist/                   # Compiled output
├── docs/                   # Design notes and work reports (not published)
├── package.json
├── tsconfig.json
└── README.md
```

## Development

### Setup

```bash
# Clone the repository
git clone https://github.com/uptodatelabs/agent-wizard.git
cd agent-wizard

# Install dependencies
npm install

# Build the project
npm run build

# Run the test suite once
npm test
```

### Available Scripts

| Script | Description |
|--------|-------------|
| `npm run build` | Build the project (CJS + ESM + type declarations) |
| `npm run dev` | Watch mode for development |
| `npm test` | Run the test suite **once** (`vitest run`) |
| `npm run test:watch` | Run tests in watch mode |
| `npm run test:coverage` | Run tests with coverage report |
| `npm run typecheck` | Type checking (`tsc --noEmit`) |
| `npm run lint` | Linting (ESLint 9 flat config, zero warnings allowed) |
| `npm run verify` | Full gate: lint + typecheck + test + build |

### Architecture

AgentWizard follows a layered architecture:

- **Adapters**: Each supported tool has its own adapter that handles configuration reading/writing/validation with non-destructive merging. A single registry (`src/adapters/index.ts`) is the only place a tool is added.
- **Core**: Shared functionality like project detection, profile management, status monitoring, sync, and the agent editor port.
- **TUI**: A design-token layer (`src/tui/`) — semantic colours, glyphs, spacing, keymap and hooks — that the dashboard is built from. Components never name raw colours, so retheming happens in one file.
- **Dashboard**: Interactive TUI built with Ink (React for CLIs).
- **CLI**: Command-line interface built with Commander.js.

## Contributing

Contributions are welcome! Please follow these steps:

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

### Development Guidelines

- Write tests for new features
- Keep `npm run verify` green (lint + typecheck + test + build) before pushing
- Add colour/glyph/spacing to `src/tui/theme.ts` rather than inlining it in a component
- Add a shortcut to `src/tui/keymap.ts` rather than handling it separately in the UI
- Update documentation as needed

## Support & Donate

AgentWizard is **free and open source** (MIT). If it saves you time, consider
supporting the project — every coffee helps keep it maintained:

[![Ko-fi](https://img.shields.io/badge/Ko--fi-FF5E5B?style=for-the-badge&logo=ko-fi&logoColor=white)](https://ko-fi.com/uptodatelabs)
[![GitHub Sponsors](https://img.shields.io/badge/Sponsor-AgentWizard-ea4aaa?style=for-the-badge&logo=githubsponsors&logoColor=white)](https://github.com/sponsors/uptodatelabs)

- **Issues**: [GitHub Issues](https://github.com/uptodatelabs/agent-wizard/issues)
- **Discussions**: [GitHub Discussions](https://github.com/uptodatelabs/agent-wizard/discussions)
- **More ways to support**: [docs/SUPPORT.md](docs/SUPPORT.md)

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.
