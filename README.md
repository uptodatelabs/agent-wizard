# AgentWizard

AI coding assistant configuration wizard. Set up your AI tools in minutes, not hours.

[![npm version](https://img.shields.io/npm/v/agent-wizard.svg)](https://www.npmjs.com/package/agent-wizard)
[![License: Apache-2.0](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](https://opensource.org/licenses/Apache-2.0)

## Overview

AgentWizard is a CLI tool that helps you configure and manage AI coding assistants across multiple platforms. Instead of manually setting up each tool, AgentWizard provides a unified interface to configure, manage, and sync your AI assistant settings.

### Why AgentWizard?

- **Multiple Tools, One Interface**: Configure Claude Code, Cursor, GitHub Copilot, Aider, OpenClaw, and Hermes from a single CLI
- **Smart Detection**: Automatically detect your project type, tech stack, and existing AI tool configurations
- **Profile Management**: Create and manage profiles for different projects or workflows
- **Real-time Dashboard**: Monitor the status of all your AI assistants in one place
- **Sync Capabilities**: Keep your configurations in sync across different tools
- **Non-destructive**: Existing tool configuration is always preserved (merged, never overwritten)

## Installation

### Prerequisites

- Node.js 18.0.0 or higher
- npm (comes with Node.js)

### Install

```bash
npm install -g agent-wizard
```

### Verify Installation

```bash
agent-wizard --version
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

### 3. Check Status

```bash
agent-wizard status list
```

Shows the status of all supported tools and their configurations.

### 4. Launch Dashboard

```bash
agent-wizard dashboard
```

Opens an interactive dashboard to monitor all your AI assistants.

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

### Agent Management

| Command | Description |
|---------|-------------|
| `agent-wizard agent add <profile> <tool>` | Add agent to profile |
| `agent-wizard agent remove <profile> <agentId>` | Remove agent from profile |
| `agent-wizard agent config <profile> <agentId> <key> <value>` | Update agent setting (dot-notation keys supported, e.g. `terminal.timeout`) |
| `agent-wizard agent list <profile>` | List agents in profile |

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
supported tool implements the same `AgentEditorPort`, so the commands below work for
any tool once its adapter implements the port. Currently `openclaw` is supported; other
tools return a clear "does not support agent editing yet" message until their adapter
implements the port (incremental rollout).

| Command | Description |
|---------|-------------|
| `agent-wizard agents list <tool>` | List agents for a tool |
| `agent-wizard agents show <tool> <id>` | Show one agent's full config (raw JSON) |
| `agent-wizard agents add <tool> <id>` | Add an agent (`-n/--name`, `-m/--model`, `-w/--workspace`) |
| `agent-wizard agents set <tool> <id> <key> <value>` | Set a key (dot-notation; JSON parsed when possible) |
| `agent-wizard agents unset <tool> <id> <key>` | Delete a key from an agent |
| `agent-wizard agents remove <tool> <id>` | Remove an agent |

Example (tool-agnostic):

```bash
agent-wizard agents list openclaw
agent-wizard agents set openclaw coder tools.profile '"full"'
agent-wizard agents show openclaw coder
```

### Dashboard — interactive agent editing

`agent-wizard dashboard` now supports a 3-level navigation for **any tool that
implements the agent editor port**:

1. **Tool grid** — `↑↓` to select a tool, `Enter` to open its agents
2. **Agent list** — `↑↓` to select an agent, `Enter` to edit it
3. **Agent editor** — shows the agent's full raw settings as a flat key list; you can
   - `e` edit a key's value
   - `a` add a new key (dot-notation, e.g. `tools.profile`)
   - `d` delete a key
   - `q`/`Enter` to go back one level

All edits are written back non-destructively (existing keys and unrelated config
preserved).

### Status & Monitoring

| Command | Description |
|---------|-------------|
| `agent-wizard status list` | Show status of all tools |
| `agent-wizard status show <tool>` | Show detailed status for a specific tool |
| `agent-wizard dashboard` | Launch interactive dashboard |

### Sync

| Command | Description |
|---------|-------------|
| `agent-wizard sync to-tools <profile>` | Merge profile settings into tool configurations |
| `agent-wizard sync from-tools` | Import existing tool configurations into a new profile |

## Supported Tools

| Tool | Config Format | Config Location | Status |
|------|---------------|-----------------|--------|
| **OpenClaw** | JSON5 | `~/.openclaw/openclaw.json` | ✅ Supported |
| **Hermes** | YAML | `~/.hermes/config.yaml` | ✅ Supported |
| **Claude Code** | JSON | `~/.claude/settings.json` (user) or `.claude/settings.json` (project) | ✅ Supported |
| **Cursor** | Markdown (.mdc) | `.cursor/rules/` | ✅ Supported |
| **GitHub Copilot** | Markdown | `.github/copilot-instructions.md` | ✅ Supported |
| **Aider** | YAML | `.aider.conf.yml` (cwd or home) | ✅ Supported |

### Notes on configuration locations

- **OpenClaw**, **Hermes**, and **Claude Code** are user-global tools. AgentWizard reads/writes their config in your home directory (`~`). Claude Code also supports a project-scoped `.claude/settings.json` for detection.
- **Cursor**, **GitHub Copilot**, and **Aider** are project-scoped. AgentWizard reads/writes them relative to the current working directory.

## Non-destructive configuration

AgentWizard never destroys your existing tool configuration:

- When writing to OpenClaw, Hermes, Claude Code, or Aider, the existing file is read first and your new settings are **merged** into it. Untouched keys (channels, providers, mcp servers, hooks, sandbox, env, etc.) are preserved.
- For Cursor, AgentWizard writes dedicated `agent-wizard-*.mdc` rule files, leaving your other rules untouched.
- For Copilot, pre-existing custom instructions above the AgentWizard-managed section are preserved.
- User-supplied secrets (API keys, bot tokens) in config files are left as-is; AgentWizard does not regenerate or overwrite them.

## `validate` behavior

`agent-wizard validate` checks each detected tool's configuration for structural correctness (required fields, correct types) — not just whether the file can be parsed. Example checks: OpenClaw requires `agents.defaults.workspace`; Claude Code requires `permissions.allow`/`deny` to be arrays when present; Cursor rule files must have valid `---` frontmatter.

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

# Merge profile settings into tools (preserves existing tool config)
agent-wizard sync to-tools my-project
```

### Using the Dashboard

```bash
# Launch the dashboard
agent-wizard dashboard

# Navigation:
# - Arrow keys: Navigate between tools
# - Enter: View details
# - r: Refresh status
# - q: Quit
```

## Project Structure

```
agent-wizard/
├── src/
│   ├── adapters/           # Tool-specific adapters (detect/read/write/validate + merge)
│   │   ├── openclaw.ts
│   │   ├── hermes.ts
│   │   ├── claude-code.ts
│   │   ├── cursor.ts
│   │   ├── copilot.ts
│   │   └── aider.ts
│   ├── core/               # Core functionality
│   │   ├── types.ts
│   │   ├── detector.ts
│   │   ├── wizard.ts
│   │   ├── agent-wizard.ts
│   │   ├── profile.ts
│   │   ├── profile-manager.ts
│   │   ├── sync.ts
│   │   ├── status.ts
│   │   └── status-adapter.ts
│   ├── dashboard/          # Ink dashboard
│   │   ├── index.tsx
│   │   └── components/
│   ├── cli/                # CLI entry point
│   │   └── index.ts
│   └── __tests__/          # Tests
│       ├── basic.test.ts
│       └── integration.test.ts
├── dist/                   # Compiled output
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

# Run tests
npm test
```

### Available Scripts

| Script | Description |
|--------|-------------|
| `npm run build` | Build the project (CJS + ESM + type declarations) |
| `npm run dev` | Watch mode for development |
| `npm test` | Run tests (vitest) |
| `npm run test:run` | Run tests once |
| `npm run typecheck` | Type checking (tsc --noEmit) |
| `npm run lint` | Linting (ESLint 9 flat config) |

### Architecture

AgentWizard follows a modular architecture:

- **Adapters**: Each supported tool has its own adapter that handles configuration reading/writing/validation with non-destructive merging
- **Core**: Shared functionality like project detection, profile management, status monitoring, and sync
- **Dashboard**: Interactive TUI built with Ink (React for CLIs)
- **CLI**: Command-line interface built with Commander.js

## Contributing

Contributions are welcome! Please follow these steps:

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

### Development Guidelines

- Write tests for new features
- Keep `npm run lint`, `npm run typecheck`, and `npm test` green
- Update documentation as needed

## License

This project is licensed under the Apache License 2.0 - see the [LICENSE](LICENSE) file for details.

## Support

- **Issues**: [GitHub Issues](https://github.com/uptodatelabs/agent-wizard/issues)
- **Discussions**: [GitHub Discussions](https://github.com/uptodatelabs/agent-wizard/discussions)
