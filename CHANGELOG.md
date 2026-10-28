# Changelog

All notable changes to this project are documented in this file.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and this
project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.2.0] — 2026-10-28

Dashboard and safety release. The dashboard was rebuilt on a design-token system, and
every finding from the internal code analysis (P0–P3) was applied.

### Added

- **Design-token UI system** (`src/tui/`): semantic colour/glyph/spacing tokens, a
  keymap that generates both the footer hints and the `?` help overlay, and reusable
  primitives (`Panel`, `Header`, `GradientText`, `ToolList`, `StatusBadge`, `Spinner`,
  `Skeleton`, `ToastBar`, `HelpOverlay`, `ActionPalette`).
- Dashboard rebuild: two-pane layout at ≥96 columns, skeleton on first load, background
  spinner on refresh, toast notifications, scoped input per view, contextual action
  palette, and keyboard help overlay.
- Colour resolution that honours `NO_COLOR`, downgrades on non-TTY output, and uses
  truecolor only when `COLORTERM=truecolor`.
- `AGENT_WIZARD_BACKUP_KEEP` to bound backup retention (default 10).
- Runtime validation of profile files with zod (`schemas/profile-schema.ts`).
- Single adapter registry (`adapters/index.ts`); the CLI resolves tools from it instead
  of hardcoding them.
- Regression tests for each applied finding.

### Fixed

- **Backups are now created on every write path.** Configuration adapters wrote without
  a restore point; they now back up first, including the scoped Claude Code settings path.
- **A failed backup aborts the write** instead of silently proceeding, so a permission or
  disk error can no longer destroy a config that had no restore point.
- **Cursor and Copilot no longer collide when a tool has multiple agents.** Cursor writes
  `agent-wizard-<id>.mdc` per agent; Copilot upserts a delimited block per agent,
  preserving surrounding user content. Previously a fixed filename made the last write
  win.
- Wizard answers are no longer discarded — architect mode and reasoning effort are
  persisted and consumed by the Aider and Hermes adapters.
- `reviewConfig` returns a boolean instead of calling `process.exit(0)`, so the library
  can no longer terminate the host process. Cancelling a review writes nothing.
- Adding the same tool twice to a profile now produces distinct agent ids (`tool`,
  `tool-2`, …) instead of overwriting the first.
- Project detection recognises `@nestjs/core`, `@angular/core`, and `@tauri-apps/api`
  (the previous string matching never matched the real package names), and scans nested
  directories with a depth limit and an ignore list.
- Config comparison ignores key order, so an unchanged config is reported as `unchanged`
  instead of `modify`.
- Status parsing reuses the adapter's Cursor rule parser instead of reimplementing it.
- Dashboard errors render as state rather than `console.error`, which corrupted the Ink
  frame.
- OpenClaw serialization goes through one function (`serialize(value, style)`) instead of
  two divergent `JSON.stringify` implementations.
- The default profile file is trimmed before use, so a trailing newline no longer
  produces an invalid profile name.
- Backups no longer accumulate without limit.

### Changed

- `npm test` runs the suite once (`vitest run`); watch mode moved to `npm run test:watch`.
  Previously `npm test` never exited, which broke CI and scripted checks.
- `ink` is pinned to `^6.5.1` and `engines.node` to `>=20.0.0`, which is what that major
  version actually requires. CI exercises Node 20 and 22.
- README corrected: Node.js 20+ (was 18), accurate dashboard key bindings, backup
  retention and abort-on-backup-failure behaviour, per-agent Cursor/Copilot files.

## [0.1.0] — 2026-08-03

### Added

- Initial release: six tool adapters (OpenClaw, Hermes, Claude Code, Cursor, GitHub
  Copilot, Aider) with detection, validation, and non-destructive merging.
- Project detection (type, languages, frameworks).
- Profile management and `sync to-tools` / `sync from-tools` with `--dry-run`.
- Tool-agnostic agent editor (`agents` subcommands) and direct OpenClaw management.
- Status reporting with `active` / `configured` / `error` / `not-configured` semantics.
- Ink dashboard.

[0.2.0]: https://github.com/uptodatelabs/agent-wizard/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/uptodatelabs/agent-wizard/releases/tag/v0.1.0
