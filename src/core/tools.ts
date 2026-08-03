/** The canonical list of tools AgentWizard supports. */
export const SUPPORTED_TOOLS = [
  'openclaw',
  'hermes',
  'claude-code',
  'cursor',
  'copilot',
  'aider',
] as const;

export type SupportedTool = (typeof SUPPORTED_TOOLS)[number];

export function isSupportedTool(tool: string): tool is SupportedTool {
  return (SUPPORTED_TOOLS as readonly string[]).includes(tool);
}
