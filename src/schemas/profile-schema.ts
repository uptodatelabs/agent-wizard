import { z } from 'zod';
import { validateWithSchema, ValidationResult } from './tool-schemas';
import type { Profile } from '../core/profile';

/**
 * Runtime schema for saved profiles (`profile.yaml`).
 *
 * `profile-manager` used to cast the parsed YAML straight to `Profile`
 * (`yaml.parse(content) as Profile`) with no runtime check. A hand-edited or
 * truncated file then made `profile.agents.length` throw a `TypeError` and the
 * whole CLI fail — one corrupt profile took down every command.
 *
 * Parsing through this schema means missing/ill-typed fields are normalised
 * (agents → [], permissions → {allow:[],deny:[]}) instead of crashing.
 */
export const agentProfileSchema = z
  .object({
    id: z.string().min(1),
    name: z.string().min(1),
    tool: z.string().min(1),
    enabled: z.boolean().default(true),
    settings: z.record(z.unknown()).default({}),
    custom: z.record(z.unknown()).default({}),
  })
  .passthrough();

export const profileSchema = z
  .object({
    name: z.string().min(1),
    description: z.string().default(''),
    created: z.string().default(() => new Date().toISOString()),
    updated: z.string().default(() => new Date().toISOString()),
    agents: z.array(agentProfileSchema).default([]),
    permissions: z
      .object({
        allow: z.array(z.string()).default([]),
        deny: z.array(z.string()).default([]),
      })
      .default({ allow: [], deny: [] }),
  })
  .passthrough();

/** Validate parsed profile data, returning a normalised `Profile` when valid. */
export function parseProfile(data: unknown): { profile: Profile | null; result: ValidationResult } {
  const result = validateWithSchema(profileSchema, data);
  if (!result.valid) {
    return { profile: null, result };
  }
  return { profile: profileSchema.parse(data) as unknown as Profile, result };
}
