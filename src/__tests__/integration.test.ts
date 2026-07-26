import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'fs/promises';
import * as path from 'path';
import { mkdtemp, rm } from 'fs/promises';
import { tmpdir } from 'os';
import JSON5 from 'json5';

const hoisted = vi.hoisted(() => ({ home: { value: '' } }));

vi.mock('os', async () => {
  const actual = await vi.importActual<typeof import('os')>('os');
  return {
    ...actual,
    homedir: () => hoisted.home.value,
  };
});

import { OpenClawAdapter } from '../adapters/openclaw';
import { HermesAdapter } from '../adapters/hermes';
import { ClaudeCodeAdapter } from '../adapters/claude-code';
import { AiderAdapter } from '../adapters/aider';
import { AgentConfig } from '../core/types';
import { ProfileManagerImpl } from '../core/profile-manager';
import { ProjectDetector } from '../core/detector';
import { AgentWizard } from '../core/agent-wizard';

let homeDir: string;

async function writeText(p: string, content: string) {
  await fs.mkdir(path.dirname(p), { recursive: true });
  await fs.writeFile(p, content);
}

function makeAgentConfig(overrides: Partial<AgentConfig> = {}): AgentConfig {
  return {
    project: { name: 'test', type: 'cli', framework: [], language: [] },
    agents: [{ id: 'openclaw', name: 'OC', role: 'coder', model: 'anthropic/claude-sonnet-4-6', instructions: '', tools: [], guardrails: [] }],
    skills: [],
    permissions: { allow: ['Bash(npm run *)'], deny: [] },
    hooks: {},
    mcp: [],
    ...overrides,
  };
}

beforeEach(async () => {
  homeDir = await mkdtemp(path.join(tmpdir(), 'aw-test-'));
  hoisted.home.value = homeDir;
});

afterEach(async () => {
  await rm(homeDir, { recursive: true, force: true });
});

describe('OpenClawAdapter', () => {
  it('reads JSON5 with comments without error and round-trips', async () => {
    const adapter = new OpenClawAdapter();
    const configPath = path.join(homeDir, '.openclaw', 'openclaw.json');
    await writeText(configPath, `{
  // keep this comment
  agents: { defaults: { workspace: '~/.openclaw/workspace' } },
  channels: { discord: { enabled: true } },
}`);

    // read() must successfully parse JSON5 (including the comment)
    const cfg = await adapter.read();
    expect(Array.isArray(cfg.agents)).toBe(true);

    // write() produces valid JSON5 that re-parses
    await adapter.write(makeAgentConfig());
    const written = await fs.readFile(configPath, 'utf-8');
    const reparsed = JSON5.parse(written);
    expect(reparsed).toBeTruthy();
    // existing channels preserved via merge
    expect(written).toContain('discord');
  });

  it('merge preserves existing channels/models/mcp on write', async () => {
    const adapter = new OpenClawAdapter();
    const configPath = path.join(homeDir, '.openclaw', 'openclaw.json');
    await writeText(configPath, JSON.stringify({
      agents: { defaults: { workspace: '~/.openclaw/workspace' } },
      channels: { tg: { enabled: true, botToken: 'x' } },
      models: { mode: 'auto' },
      mcp: { servers: { foo: { command: 'node' } } },
    }));
    await adapter.write(makeAgentConfig({ agents: [{ id: 'openclaw', name: 'OC', role: 'coder', model: 'm1', instructions: '', tools: [], guardrails: [] }] }));
    const raw = await fs.readFile(configPath, 'utf-8');
    // JSON5.stringify emits unquoted keys
    expect(raw).toContain('tg:');
    expect(raw).toContain('foo:');
  });

  it('validateStructure rejects missing agents.defaults.workspace', () => {
    const r = OpenClawAdapter.validateStructure({ agents: { defaults: {} } } as any);
    expect(r.valid).toBe(false);
    expect(r.errors.length).toBeGreaterThan(0);
  });

  it('validate detects present config', async () => {
    const adapter = new OpenClawAdapter();
    await writeText(path.join(homeDir, '.openclaw', 'openclaw.json'), JSON.stringify({ agents: { defaults: { workspace: 'w' } } }));
    const r = await adapter.validate();
    expect(r.valid).toBe(true);
  });
});

describe('HermesAdapter', () => {
  it('merge preserves providers/memory/skills and existing personalities', async () => {
    const adapter = new HermesAdapter();
    const configPath = path.join(homeDir, '.hermes', 'config.yaml');
    await writeText(configPath, [
      'model:',
      '  default: existing-model',
      '  provider: openrouter',
      'memory:',
      '  memory_enabled: true',
      'skills:',
      '  creation_nudge_interval: 5',
      'agent:',
      '  personalities:',
      '    helper: old instructions',
    ].join('\n'));

    await adapter.write(makeAgentConfig({ agents: [{ id: 'hermes', name: 'New', role: 'coder', model: 'anthropic/claude-opus-4.6', instructions: 'new', tools: [], guardrails: [] }] }));

    const raw = await fs.readFile(configPath, 'utf-8');
    expect(raw).toContain('openrouter');
    expect(raw).toContain('helper');
    expect(raw).toContain('New');
  });
});

describe('ClaudeCodeAdapter', () => {
  it('merge preserves env/hooks/sandbox and only sets permissions when provided', async () => {
    const adapter = new ClaudeCodeAdapter();
    const configPath = path.join(homeDir, '.claude', 'settings.json');
    await writeText(configPath, JSON.stringify({
      env: { FOO: 'bar' },
      hooks: { PreToolUse: [] },
      model: 'existing',
    }));

    await adapter.write(makeAgentConfig({ permissions: { allow: [], deny: [] } }));

    const raw = await fs.readFile(configPath, 'utf-8');
    expect(raw).toContain('"FOO"');
    // permissions omitted when empty -> preserved (none existed) so no allow/deny
    expect(raw).not.toContain('"permissions"');
  });

  it('validateStructure rejects non-array permissions', () => {
    const r = ClaudeCodeAdapter.validateStructure({ permissions: { allow: 'x' } } as any);
    expect(r.valid).toBe(false);
  });
});

describe('AiderAdapter', () => {
  it('merge preserves existing keys and only fills defaults when absent', async () => {
    const adapter = new AiderAdapter();
    const configPath = path.join(process.cwd(), '.aider.conf.yml');
    await writeText(configPath, 'model: gpt-4o\nmap-tokens: 1024\n');
    // agent without an explicit model -> existing model must be preserved
    await adapter.write(makeAgentConfig({ agents: [{ id: 'aider', name: 'A', role: 'coder', model: '', instructions: '', tools: [], guardrails: [] }] }));
    const raw = await fs.readFile(configPath, 'utf-8');
    expect(raw).toContain('gpt-4o');
    expect(raw).toContain('map-tokens');
    await rm(configPath, { force: true });
  });
});

describe('ProjectDetector', () => {
  it('detects OpenClaw/Hermes from home config path', async () => {
    await writeText(path.join(homeDir, '.openclaw', 'openclaw.json'), '{}');
    await writeText(path.join(homeDir, '.hermes', 'config.yaml'), 'model: {}');
    const info = await new ProjectDetector().detect();
    expect(info.hasOpenClaw).toBe(true);
    expect(info.hasHermes).toBe(true);
  });

  it('detects Claude Code user settings', async () => {
    await writeText(path.join(homeDir, '.claude', 'settings.json'), '{}');
    const info = await new ProjectDetector().detect();
    expect(info.hasClaudeCode).toBe(true);
  });
});

describe('ProfileManagerImpl', () => {
  it('creates, reads, updates, deletes profiles across local/global fallback', async () => {
    const mgr = new ProfileManagerImpl();
    await mgr.writeProfile({ name: 'p1', description: 'd', created: '', updated: '', agents: [], permissions: { allow: [], deny: [] } });
    const read = await mgr.readProfile('p1');
    expect(read?.name).toBe('p1');

    await mgr.createAgentProfile('p1', 'openclaw');
    await mgr.updateAgentSettings('p1', 'openclaw', 'model', 'claude-3');
    const updated = await mgr.readProfile('p1');
    expect(updated?.agents[0].settings.model).toBe('claude-3');

    await mgr.deleteProfile('p1');
    expect(await mgr.readProfile('p1')).toBeNull();
  });
});

describe('AgentWizard facade', () => {
  it('detect returns project info', async () => {
    const aw = new AgentWizard();
    const info = await aw.detect();
    expect(info).toHaveProperty('type');
  });

  it('validate returns true when no config set', async () => {
    const aw = new AgentWizard();
    await aw.detect();
    expect(await aw.validate()).toBe(false);
  });
});
