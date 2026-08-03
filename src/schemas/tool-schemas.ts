import { z } from 'zod';

/**
 * Tool configuration schemas (zod).
 *
 * These describe the *on-disk* configuration files each AI tool reads, not the
 * internal AgentConfig model. They power:
 *  - adapter `validate()` / static `validateStructure()`
 *  - status reporting (`configValid`)
 *
 * Schemas are deliberately permissive about unknown keys (`.passthrough()`)
 * because these files are user-owned and tools routinely add new fields.
 * Validation targets the fields AgentWizard manages plus type-correctness of
 * the critical structure — catching real breakage without false positives.
 */

const stringArray = z.array(z.string());

/** `~/.openclaw/openclaw.json` (JSON5). */
export const openclawConfigSchema = z
  .object({
    agents: z
      .object({
        defaults: z
          .object({
            workspace: z.string().min(1, 'must be a non-empty string'),
            model: z
              .object({
                primary: z.string().min(1, 'must be a non-empty string'),
              })
              .passthrough()
              .optional(),
            skills: stringArray.optional(),
          })
          .passthrough(),
        entries: z.record(z.unknown()).optional(),
        list: z.array(z.unknown()).optional(),
      })
      .passthrough(),
    tools: z
      .object({
        allow: stringArray.optional(),
        deny: stringArray.optional(),
      })
      .passthrough()
      .optional(),
    channels: z.record(z.unknown()).optional(),
    models: z.unknown().optional(),
    mcp: z.unknown().optional(),
  })
  .passthrough();

/** `~/.hermes/config.yaml`. */
export const hermesConfigSchema = z
  .object({
    model: z
      .object({
        default: z.string().optional(),
        provider: z.string().optional(),
      })
      .passthrough()
      .optional(),
    providers: z.record(z.unknown()).optional(),
    terminal: z.object({}).passthrough().optional(),
    compression: z.object({}).passthrough().optional(),
    memory: z.object({}).passthrough().optional(),
    skills: z.object({}).passthrough().optional(),
    agent: z
      .object({
        max_turns: z.number().optional(),
        verbose: z.boolean().optional(),
        reasoning_effort: z.string().optional(),
        personalities: z.record(z.string()).optional(),
      })
      .passthrough()
      .optional(),
  })
  .passthrough();

/** `~/.claude/settings.json` / `.claude/settings.local.json`. */
export const claudeCodeSettingsSchema = z
  .object({
    $schema: z.string().optional(),
    model: z.string().optional(),
    permissions: z
      .object({
        allow: stringArray.optional(),
        deny: stringArray.optional(),
      })
      .passthrough()
      .optional(),
    env: z.record(z.string()).optional(),
    hooks: z.object({}).passthrough().optional(),
    sandbox: z.object({}).passthrough().optional(),
    attribution: z.object({}).passthrough().optional(),
    autoMemoryEnabled: z.boolean().optional(),
    companyAnnouncements: stringArray.optional(),
  })
  .passthrough();

/** `.aider.conf.yml`. */
export const aiderConfigSchema = z
  .object({
    model: z.string().optional(),
    architect: z.boolean().optional(),
    'editor-model': z.string().optional(),
    'auto-commits': z.boolean().optional(),
    'attribute-co-authored-by': z.boolean().optional(),
    git: z.boolean().optional(),
    lint: z.boolean().optional(),
    'auto-lint': z.boolean().optional(),
  })
  .passthrough();

/** Frontmatter of a Cursor `.cursor/rules/*.mdc` file. */
export const cursorMdcFrontmatterSchema = z
  .object({
    description: z.string().optional(),
    globs: z.union([z.string(), stringArray]).optional(),
    alwaysApply: z.boolean().optional(),
  })
  .passthrough();

/** Frontmatter of a Copilot `.github/instructions/*.instructions.md` file. */
export const copilotPathInstructionSchema = z
  .object({
    applyTo: z.string().optional(),
    excludeAgent: z.string().optional(),
  })
  .passthrough();

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

/** Run a zod schema and format issues as readable, path-prefixed messages. */
export function validateWithSchema(schema: z.ZodType, value: unknown): ValidationResult {
  const result = schema.safeParse(value);
  if (result.success) {
    return { valid: true, errors: [] };
  }
  const errors = result.error.issues.map((issue) => {
    const where = issue.path.length > 0 ? `"${issue.path.join('.')}"` : 'config';
    return `${where}: ${issue.message}`;
  });
  return { valid: false, errors };
}
