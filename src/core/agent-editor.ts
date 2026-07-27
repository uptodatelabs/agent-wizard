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
  summary?: string;
  /** true when this agent is a built-in/default entry for the tool (e.g. a
   *  Hermes built-in personality). Optional — tools that don't distinguish
   *  built-in vs custom agents simply omit it. */
  builtin?: boolean;
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

/** Read a nested value via dot-notation path (e.g. "identity.emoji"). */
export function getByPath(obj: unknown, path: string): unknown {
  return path.split('.').reduce<unknown>((acc, key) => {
    if (acc && typeof acc === 'object' && key in (acc as Record<string, unknown>)) {
      return (acc as Record<string, unknown>)[key];
    }
    return undefined;
  }, obj);
}

/** Set a nested value via dot-notation path, creating intermediate objects. */
export function setByPath(obj: Record<string, unknown>, path: string, value: unknown): void {
  const keys = path.split('.');
  let cur = obj;
  for (let i = 0; i < keys.length - 1; i++) {
    const k = keys[i];
    if (typeof cur[k] !== 'object' || cur[k] === null) {
      cur[k] = {};
    }
    cur = cur[k] as Record<string, unknown>;
  }
  cur[keys[keys.length - 1]] = value;
}

/** Delete a nested value via dot-notation path. */
export function deleteByPath(obj: Record<string, unknown>, path: string): void {
  const keys = path.split('.');
  let cur = obj;
  for (let i = 0; i < keys.length - 1; i++) {
    const k = keys[i];
    if (typeof cur[k] !== 'object' || cur[k] === null) return;
    cur = cur[k] as Record<string, unknown>;
  }
  delete cur[keys[keys.length - 1]];
}

/** Parse a raw string value as JSON when possible, else keep as string. */
export function parseValue(raw: string): unknown {
  const trimmed = raw.trim();
  if (
    (trimmed.startsWith('{') && trimmed.endsWith('}')) ||
    (trimmed.startsWith('[') && trimmed.endsWith(']')) ||
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    trimmed === 'true' ||
    trimmed === 'false' ||
    trimmed === 'null' ||
    /^-?\d+(\.\d+)?$/.test(trimmed)
  ) {
    try {
      return JSON.parse(trimmed);
    } catch {
      return raw;
    }
  }
  return raw;
}

import { OpenClawWizard } from './openclaw-wizard';
import { HermesAgentEditor } from './editors/hermes-editor';
import { ClaudeCodeAgentEditor } from './editors/claude-code-editor';
import { CursorAgentEditor } from './editors/cursor-editor';
import { CopilotAgentEditor } from './editors/copilot-editor';
import { AiderAgentEditor } from './editors/aider-editor';

/**
 * Get an agent editor for the given tool. Returns null when the tool has no
 * agent-editing support yet (so callers can gracefully skip unsupported tools).
 */
export function createAgentEditor(tool: string): AgentEditorPort | null {
  switch (tool) {
    case 'openclaw':
      return new OpenClawWizard();
    case 'hermes':
      return new HermesAgentEditor();
    case 'claude-code':
      return new ClaudeCodeAgentEditor();
    case 'cursor':
      return new CursorAgentEditor();
    case 'copilot':
      return new CopilotAgentEditor();
    case 'aider':
      return new AiderAgentEditor();
    default:
      return null;
  }
}
