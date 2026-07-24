# AgentWizard

AI coding assistant configuration wizard. Set up your AI tools in minutes, not hours.

[![npm version](https://img.shields.io/npm/v/agent-wizard.svg)](https://www.npmjs.com/package/agent-wizard)
[![License: Apache-2.0](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](https://opensource.org/licenses/Apache-2.0)
[![Downloads](https://img.shields.io/npm/dm/agent-wizard.svg)](https://www.npmjs.com/package/agent-wizard)

## Overview

AgentWizard is a CLI tool that helps you configure and manage AI coding assistants across multiple platforms. Instead of manually setting up each tool, AgentWizard provides a unified interface to configure, manage, and sync your AI assistant settings.

### Why AgentWizard?

- **Multiple Tools, One Interface**: Configure Claude Code, Cursor, GitHub Copilot, Aider, OpenClaw, and Hermes from a single CLI
- **Smart Detection**: Automatically detect your project type, tech stack, and existing AI tool configurations
- **Profile Management**: Create and manage profiles for different projects or workflows
- **Real-time Dashboard**: Monitor the status of all your AI assistants in one place
- **Sync Capabilities**: Keep your configurations in sync across different tools

## Features

### Core Features

- **Multi-tool Support**: Configure 6+ AI coding assistants
- **Smart Detection**: Automatically detect project type and tech stack
- **Interactive Wizard**: Step-by-step configuration with sensible defaults
- **Configuration Validation**: Verify your settings before applying

### Profile Management

- **Create Profiles**: Save different configurations for different projects
- **Switch Profiles**: Quickly switch between configurations
- **Export/Import**: Share profiles with your team
- **Agent-specific Settings**: Configure each agent individually

### Dashboard & Monitoring

- **Real-time Status**: See which tools are configured and active
- **Agent Details**: View detailed information about each agent
- **Interactive UI**: Navigate with keyboard, refresh in real-time

### Sync & Integration

- **Bi-directional Sync**: Push profile settings to tools, or import from existing configurations
- **Cross-tool Compatibility**: Settings work across all supported tools
- **Version Control Friendly**: Configuration files work with Git

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
- Project type (web, mobile, CLI, library)
- Programming languages
- Frameworks
- Existing AI tool configurations

### 2. Initialize Configuration

```bash
agent-wizard init
```

This launches an interactive wizard that will:
1. Detect your project
2. Ask which AI tools you want to configure
3. Guide you through settings for each tool
4. Apply the configuration

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
| `agent-wizard init` | Initialize project configuration |
| `agent-wizard detect` | Detect project type and tech stack |
| `agent-wizard configure` | Interactive configuration wizard |
| `agent-wizard validate` | Validate configuration for all tools |
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
| `agent-wizard agent config <profile> <agentId> <key> <value>` | Update agent setting |
| `agent-wizard agent list <profile>` | List agents in profile |

### Status & Monitoring

| Command | Description |
|---------|-------------|
| `agent-wizard status list` | Show status of all tools |
| `agent-wizard status show <tool>` | Show detailed status for a specific tool |
| `agent-wizard dashboard` | Launch interactive dashboard |

### Sync

| Command | Description |
|---------|-------------|
| `agent-wizard sync to-tools <profile>` | Sync profile settings to tool configurations |
| `agent-wizard sync from-tools` | Import existing tool configurations to a new profile |

## Supported Tools

| Tool | Config Format | Config Location | Status |
|------|---------------|-----------------|--------|
| **OpenClaw** | JSON5 | `~/.openclaw/openclaw.json` | ✅ Supported |
| **Hermes** | YAML | `~/.hermes/config.yaml` | ✅ Supported |
| **Claude Code** | JSON | `~/.claude/settings.json` | ✅ Supported |
| **Cursor** | Markdown (.mdc) | `.cursor/rules/` | ✅ Supported |
| **GitHub Copilot** | Markdown | `.github/copilot-instructions.md` | ✅ Supported |
| **Aider** | YAML | `.aider.conf.yml` | ✅ Supported |

## Configuration Examples

### Creating a Profile

```bash
# Create a new profile
agent-wizard profile create my-project

# Add agents to the profile
agent-wizard agent add my-project claude-code
agent-wizard agent add my-project cursor

# Configure agent settings
agent-wizard agent config my-project claude-code model claude-3-5-sonnet
agent-wizard agent config my-project cursor alwaysApply true

# View the profile
agent-wizard profile show my-project
```

### Syncing Configurations

```bash
# Import existing configurations
agent-wizard sync from-tools

# Export profile to tools
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
│   ├── adapters/           # Tool-specific adapters
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
│       └── basic.test.ts
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
| `npm run build` | Build the project |
| `npm run dev` | Watch mode for development |
| `npm test` | Run tests |
| `npm run typecheck` | Type checking |
| `npm run lint` | Linting |

### Architecture

AgentWizard follows a modular architecture:

- **Adapters**: Each supported tool has its own adapter that handles configuration reading/writing
- **Core**: Shared functionality like project detection, profile management, and status monitoring
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
- Follow existing code style
- Update documentation as needed
- Keep commits atomic and well-described

## License

This project is licensed under the Apache License 2.0 - see the [LICENSE](LICENSE) file for details.

## Support

- **Documentation**: [agentwizard.dev](https://agentwizard.dev)
- **Issues**: [GitHub Issues](https://github.com/uptodatelabs/agent-wizard/issues)
- **Discussions**: [GitHub Discussions](https://github.com/uptodatelabs/agent-wizard/discussions)

## Acknowledgments

- [Ink](https://github.com/vadimdemedes/ink) - React for CLIs
- [Commander.js](https://github.com/tj/commander.js) - CLI framework
- [Chalk](https://github.com/chalk/chalk) - Terminal styling
- All the AI coding assistant teams for their amazing tools
