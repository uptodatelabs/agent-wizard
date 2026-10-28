import { SUPPORTED_TOOLS, SupportedTool } from '../core/tools';
import { OpenClawAdapter } from './openclaw';
import { HermesAdapter } from './hermes';
import { ClaudeCodeAdapter } from './claude-code';
import { CursorAdapter } from './cursor';
import { CopilotAdapter } from './copilot';
import { AiderAdapter } from './aider';

/**
 * Minimal structural contract every adapter satisfies. Declared here (instead
 * of requiring adapters to share a base class) so existing adapters keep their
 * own extra methods (`readScope`, `writeRule`, ...) without friction.
 */
export interface ToolAdapter {
  name: string;
  configPath: string;
  format: string;
  detect(): Promise<boolean>;
  read(): Promise<import('../core/types').AgentConfig>;
  write(config: import('../core/types').AgentConfig): Promise<void>;
  validate(): Promise<{ valid: boolean; errors: string[] }>;
}

export interface RegisteredAdapter {
  /** Canonical tool id (matches SUPPORTED_TOOLS). */
  tool: SupportedTool;
  /** Human-readable label used by the CLI. */
  label: string;
  adapter: ToolAdapter;
}

const LABELS: Record<SupportedTool, string> = {
  openclaw: 'OpenClaw',
  hermes: 'Hermes',
  'claude-code': 'Claude Code',
  cursor: 'Cursor',
  copilot: 'GitHub Copilot',
  aider: 'Aider',
};

function createAdapter(tool: SupportedTool): ToolAdapter {
  switch (tool) {
    case 'openclaw':
      return new OpenClawAdapter();
    case 'hermes':
      return new HermesAdapter();
    case 'claude-code':
      return new ClaudeCodeAdapter();
    case 'cursor':
      return new CursorAdapter();
    case 'copilot':
      return new CopilotAdapter();
    case 'aider':
      return new AiderAdapter();
  }
}

/**
 * Single registry for all supported adapters.
 *
 * Before this existed, `cli/index.ts` (`validate`, `list`), `agent-wizard.ts`
 * and `status-adapter.ts` each hard-coded their own array of six adapters, so
 * adding a tool meant editing five places and it was easy to forget one.
 */
export function getAllAdapters(): RegisteredAdapter[] {
  return SUPPORTED_TOOLS.map((tool) => ({
    tool,
    label: LABELS[tool],
    adapter: createAdapter(tool),
  }));
}

export { OpenClawAdapter, HermesAdapter, ClaudeCodeAdapter, CursorAdapter, CopilotAdapter, AiderAdapter };
