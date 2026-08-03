import { describe, it, expect } from 'vitest';
import {
  openclawConfigSchema,
  hermesConfigSchema,
  claudeCodeSettingsSchema,
  aiderConfigSchema,
  cursorMdcFrontmatterSchema,
  validateWithSchema,
} from '../schemas/tool-schemas';
import { OpenClawAdapter } from '../adapters/openclaw';
import { HermesAdapter } from '../adapters/hermes';
import { ClaudeCodeAdapter } from '../adapters/claude-code';
import { AiderAdapter } from '../adapters/aider';

describe('tool schemas', () => {
  describe('openclaw', () => {
    it('accepts a well-formed config', () => {
      const result = validateWithSchema(openclawConfigSchema, {
        agents: { defaults: { workspace: '~/.openclaw/workspace', model: { primary: 'x' } }, entries: {} },
      });
      expect(result.valid).toBe(true);
    });

    it('accepts unknown top-level keys (channels/models/mcp)', () => {
      const result = validateWithSchema(openclawConfigSchema, {
        agents: { defaults: { workspace: 'w' } },
        channels: { slack: { botToken: 'x' } },
        models: { providers: {} },
        mcp: { servers: {} },
      });
      expect(result.valid).toBe(true);
    });

    it('rejects a config missing agents.defaults.workspace', () => {
      const result = OpenClawAdapter.validateStructure({ agents: { defaults: {} } });
      expect(result.valid).toBe(false);
      expect(result.errors.join(' ')).toContain('workspace');
    });

    it('rejects agents.defaults.workspace that is not a string', () => {
      const result = OpenClawAdapter.validateStructure({ agents: { defaults: { workspace: 42 as any } } });
      expect(result.valid).toBe(false);
    });
  });

  describe('hermes', () => {
    it('accepts a well-formed config', () => {
      const result = validateWithSchema(hermesConfigSchema, {
        model: { default: 'x', provider: 'auto' },
        agent: { max_turns: 60, personalities: { a: 'instructions' } },
        compression: { enabled: true },
      });
      expect(result.valid).toBe(true);
    });

    it('accepts an empty/minimal config (all sections optional)', () => {
      const result = HermesAdapter.validateStructure({});
      expect(result.valid).toBe(true);
    });

    it('rejects personalities with non-string values', () => {
      const result = HermesAdapter.validateStructure({ agent: { personalities: { a: 42 as any } } });
      expect(result.valid).toBe(false);
    });
  });

  describe('claude-code', () => {
    it('accepts a well-formed settings file', () => {
      const result = validateWithSchema(claudeCodeSettingsSchema, {
        $schema: 'https://json.schemastore.org/claude-code-settings.json',
        model: 'claude-sonnet-4-5',
        permissions: { allow: ['Bash(npm run *)'], deny: [] },
        env: { FOO: 'bar' },
        hooks: {},
        sandbox: { enabled: true },
      });
      expect(result.valid).toBe(true);
    });

    it('rejects non-array permissions', () => {
      const result = ClaudeCodeAdapter.validateStructure({ permissions: { allow: 'Bash(*)', deny: [] } });
      expect(result.valid).toBe(false);
    });

    it('rejects env values that are not strings', () => {
      const result = ClaudeCodeAdapter.validateStructure({ env: { FOO: 42 as any } });
      expect(result.valid).toBe(false);
    });
  });

  describe('aider', () => {
    it('accepts a well-formed config', () => {
      const result = validateWithSchema(aiderConfigSchema, {
        model: 'sonnet',
        architect: true,
        'editor-model': 'opus',
        'auto-commits': true,
        git: true,
      });
      expect(result.valid).toBe(true);
    });

    it('rejects a non-boolean architect value', () => {
      const result = AiderAdapter.validateStructure({ model: 'sonnet', architect: 'yes' as any });
      expect(result.valid).toBe(false);
    });

    it('rejects an empty config as "No Aider configuration found"', () => {
      const result = AiderAdapter.validateStructure({});
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('No Aider configuration');
    });
  });

  describe('cursor frontmatter', () => {
    it('accepts valid frontmatter fields', () => {
      const result = validateWithSchema(cursorMdcFrontmatterSchema, {
        description: 'My rule',
        globs: '**/*.ts',
        alwaysApply: false,
      });
      expect(result.valid).toBe(true);
    });

    it('accepts globs as an array', () => {
      const result = validateWithSchema(cursorMdcFrontmatterSchema, {
        description: 'r',
        globs: ['**/*.ts', '**/*.tsx'],
        alwaysApply: true,
      });
      expect(result.valid).toBe(true);
    });

    it('rejects a non-boolean alwaysApply', () => {
      const result = validateWithSchema(cursorMdcFrontmatterSchema, { alwaysApply: 'yes' });
      expect(result.valid).toBe(false);
    });
  });
});
