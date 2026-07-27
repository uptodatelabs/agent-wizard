/**
 * Tool-agnostic agent editor port.
 *
 * Every supported tool (OpenClaw, Hermes, Claude Code, ...) exposes its agents
 * through this same interface so the dashboard and CLI can edit any agent the
 * same way — regardless of the underlying config format.
 *
 * An "agent" is abstracted as a JSON tree of settings. Adapters are responsible
 * for mapping their native format (record, array, markdown file, ...) onto this
 * tree and back, preserving unknown keys on write (non-destructive).
 */

export type AgentSettings = Record<string, unknown>;

export interface AgentListItem {
  id: string;
  name?: string;
  /** Short human-readable summary, e.g. "model=gpt-4, workspace=~/x" */
  summary?: string;
}

export interface AgentEditorPort {
  /** The tool identifier this editor targets (e.g. 'openclaw'). */
  readonly tool: string;

  /** List agents with their raw settings preserved. */
  listAgents(): Promise<AgentListItem[]>;

  /** Return one agent's full settings as a JSON tree. */
  getAgentRaw(id: string): Promise<AgentSettings>;

  /** Set a key (dot-notation) on an agent. Value parsed as JSON when possible. */
  setAgentKey(id: string, key: string, value: string): Promise<void>;

  /** Delete a key (dot-notation) from an agent. */
  unsetAgentKey(id: string, key: string): Promise<void>;

  /** Add a new agent with the given id and optional defaults. */
  addAgent(id: string, defaults?: AgentSettings): Promise<void>;

  /** Remove an agent by id. */
  removeAgent(id: string): Promise<void>;

  /** Persist all pending changes (non-destructive merge with existing config). */
  save(): Promise<void>;
}

import { OpenClawWizard } from './openclaw-wizard';

/**
 * Get an agent editor for the given tool. Returns null when the tool has no
 * agent-editing support yet (so callers can gracefully skip unsupported tools).
 */
export function createAgentEditor(tool: string): AgentEditorPort | null {
  switch (tool) {
    case 'openclaw':
      return new OpenClawWizard();
    default:
      return null;
  }
}
