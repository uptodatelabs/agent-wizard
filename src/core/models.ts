/**
 * Model catalogs for the interactive wizard.
 *
 * Previously each `configureXxx()` in `wizard.ts` inlined its own model list,
 * so refreshing a model name meant editing several places (and they drifted:
 * Hermes offered `anthropic/claude-opus-4.6` while OpenClaw offered
 * `anthropic/claude-opus-4-6`). Keeping them here makes the refresh point one
 * file — and lets `profile-manager.getAgentDefaultSettings()` reuse the same
 * first-choice model as the wizard instead of hard-coding it twice.
 */

/** First entry is used as the default model when a profile is created. */
export const OPENCLAW_MODELS = [
  'anthropic/claude-sonnet-4-6',
  'anthropic/claude-opus-4-6',
  'openai/gpt-4o',
  'openai/gpt-4-turbo',
] as const;

export const HERMES_MODELS = [
  'anthropic/claude-opus-4.6',
  'anthropic/claude-sonnet-4.6',
  'openai/gpt-4o',
  'openai/gpt-4-turbo',
] as const;

export const CLAUDE_CODE_MODELS = [
  'claude-sonnet-4-20250514',
  'claude-opus-4-20250514',
  'claude-haiku-3-20240307',
] as const;

export const AIDER_MODELS = [
  'sonnet',
  'opus',
  'haiku',
  'gpt-4o',
  'gpt-4-turbo',
  'deepseek/deepseek-chat',
] as const;

export const HERMES_REASONING_EFFORTS = ['low', 'medium', 'high'] as const;

/** Default model per tool (single source for wizard + profile defaults). */
export const DEFAULT_MODELS: Record<string, string> = {
  openclaw: OPENCLAW_MODELS[0],
  hermes: HERMES_MODELS[0],
  'claude-code': CLAUDE_CODE_MODELS[0],
  cursor: 'cursor-default',
  copilot: 'copilot-default',
  aider: AIDER_MODELS[0],
};
