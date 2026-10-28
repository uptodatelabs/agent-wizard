import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'fs/promises';
import * as path from 'path';
import { mkdtemp, rm } from 'fs/promises';
import { tmpdir } from 'os';
import JSON5 from 'json5';
import { OpenClawWizard } from '../core/openclaw-wizard';
import { createAgentEditor } from '../core/agent-editor';

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
  it('reads agents from agents.list (array shape) used by real OpenClaw configs', async () => {
    const adapter = new OpenClawAdapter();
    const configPath = path.join(homeDir, '.openclaw', 'openclaw.json');
    await writeText(configPath, `{
  agents: {
    defaults: { workspace: '~/.openclaw/ws', model: { primary: 'm1' } },
    list: [
      { id: 'main', tools: { profile: 'full' } },
      { id: 'coder', name: 'Coder', identity: { name: '코더', emoji: '💰' }, model: 'm2', workspace: '~/.openclaw/coder' }
    ]
  },
  channels: { tg: { enabled: true, token: 'SECRET' } }
}`);

    const cfg = await adapter.read();
    expect(cfg.agents.length).toBe(2);
    expect(cfg.agents.map((a) => a.id).sort()).toEqual(['coder', 'main']);
    expect(cfg.agents.find((a) => a.id === 'coder')?.model).toBe('m2');

    // write() must preserve the existing `list` shape (not convert to `entries`)
    await adapter.write(makeAgentConfig({ agents: [{ id: 'main', name: 'Main', role: 'coder', model: 'm1', instructions: '', tools: [], guardrails: [] }] }));
    const raw = await fs.readFile(configPath, 'utf-8');
    const reparsed = JSON5.parse(raw);
    expect(Array.isArray(reparsed.agents.list)).toBe(true);
    expect(reparsed.agents.list.map((a: any) => a.id).sort()).toEqual(['coder', 'main']);
    expect(reparsed.agents.entries).toBeUndefined();
    // existing channels + token preserved
    expect(reparsed.channels.tg.token).toBe('SECRET');
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
    // AiderAdapter resolves its file from process.cwd(). Point it at the temp
    // dir so the suite never drops .aider.conf.yml / .bak-* into the repo root.
    const cwdSpy = vi.spyOn(process, 'cwd').mockReturnValue(homeDir);
    try {
      const configPath = path.join(homeDir, '.aider.conf.yml');
      await writeText(configPath, 'model: gpt-4o\nmap-tokens: 1024\n');
      // agent without an explicit model -> existing model must be preserved
      await adapter.write(makeAgentConfig({ agents: [{ id: 'aider', name: 'A', role: 'coder', model: '', instructions: '', tools: [], guardrails: [] }] }));
      const raw = await fs.readFile(configPath, 'utf-8');
      expect(raw).toContain('gpt-4o');
      expect(raw).toContain('map-tokens');
    } finally {
      cwdSpy.mockRestore();
    }
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

  it('validate returns false when no config set', async () => {
    const aw = new AgentWizard();
    await aw.detect();
    expect(await aw.validate()).toBe(false);
  });

  it('getStatus returns dashboard data for all tools', async () => {
    const aw = new AgentWizard();
    const data = await aw.getStatus();
    expect(data.toolStatuses).toHaveLength(6);
    expect(typeof data.totalAgents).toBe('number');
  });

  it('writeConfig round-trips a config through a tool adapter', async () => {
    const aw = new AgentWizard();
    await aw.writeConfig({
      projectInfo: { name: 't', type: 'cli', frameworks: [], languages: [] },
      selectedTools: ['openclaw'],
      config: makeAgentConfig(),
    } as Parameters<typeof aw.writeConfig>[0]);

    const configPath = path.join(homeDir, '.openclaw', 'openclaw.json');
    // OpenClaw writes JSON5 (unquoted keys are valid JSON5)
    const written = JSON5.parse(await fs.readFile(configPath, 'utf-8'));
    expect(written.agents.entries.openclaw.identity.name).toBe('OC');
  });
});

describe('OpenClawWizard', () => {
  const wiz = new OpenClawWizard();
  let cfgPath = '';

  beforeEach(async () => {
    cfgPath = path.join(homeDir, '.openclaw', 'openclaw.json');
    wiz.setConfigPath(cfgPath);
    await writeText(
      cfgPath,
      `{
  agents: {
    defaults: { workspace: '~/.openclaw/ws', model: { primary: 'm0' } },
    list: [
      { id: 'main', tools: { profile: 'full' } },
      { id: 'coder', name: 'Coder', identity: { name: '코더', emoji: '💰' }, model: 'm2', workspace: '~/.oc/coder' }
    ]
  },
  channels: { tg: { enabled: true, token: 'SECRET' } },
  models: { providers: { x: {} } }
}`
    );
  });

  it('reads agents from agents.list and preserves list shape on write', async () => {
    const cfg = await wiz.loadConfig();
    const agents = wiz.getAgents(cfg);
    expect(agents.map((a) => a.id).sort()).toEqual(['coder', 'main']);
    expect(wiz.getAgent(cfg, 'coder')?.model).toBe('m2');

    wiz.addAgentInConfig(cfg, 'newbie');
    wiz.setAgentKeyInConfig(cfg, 'newbie', 'tools.profile', '"full"');
    await wiz.saveConfig(cfg);

    const reparsed = JSON5.parse(await fs.readFile(cfgPath, 'utf-8'));
    expect(Array.isArray(reparsed.agents.list)).toBe(true);
    expect(reparsed.agents.list.map((a: any) => a.id).sort()).toEqual(['coder', 'main', 'newbie']);
    // custom key + nested values written
    const nb = reparsed.agents.list.find((a: any) => a.id === 'newbie');
    expect(nb.tools.profile).toBe('full');
    // unrelated top-level keys preserved
    expect(reparsed.channels.tg.token).toBe('SECRET');
    expect(reparsed.models.providers.x).toBeTruthy();
  });

  it('set/unset custom keys (dot-notation) mutate the real agent object', async () => {
    const cfg = await wiz.loadConfig();
    wiz.setAgentKeyInConfig(cfg, 'coder', 'subagents.max', '8');
    wiz.setAgentKeyInConfig(cfg, 'coder', 'identity.theme', '"korean"');
    wiz.unsetAgentKeyInConfig(cfg, 'coder', 'workspace');
    await wiz.saveConfig(cfg);

    const reparsed = JSON5.parse(await fs.readFile(cfgPath, 'utf-8'));
    const coder = reparsed.agents.list.find((a: any) => a.id === 'coder');
    expect(coder.subagents.max).toBe(8);
    expect(coder.identity.theme).toBe('korean');
    expect(coder.workspace).toBeUndefined();
  });

  it('removeAgent deletes by id and preserves remaining agents', async () => {
    const cfg = await wiz.loadConfig();
    wiz.removeAgentInConfig(cfg, 'main');
    await wiz.saveConfig(cfg);
    const reparsed = JSON5.parse(await fs.readFile(cfgPath, 'utf-8'));
    expect(reparsed.agents.list.map((a: any) => a.id)).toEqual(['coder']);
  });

  it('supports agents.entries (record) shape too', async () => {
    await writeText(
      cfgPath,
      `{ agents: { defaults: { workspace: 'w' }, entries: { a1: { name: 'A1' }, a2: { name: 'A2' } } }, channels: {} }`
    );
    const cfg = await wiz.loadConfig();
    expect(wiz.getAgents(cfg).map((a) => a.id).sort()).toEqual(['a1', 'a2']);
    wiz.setAgentKeyInConfig(cfg, 'a1', 'model', 'mX');
    await wiz.saveConfig(cfg);
    const reparsed = JSON5.parse(await fs.readFile(cfgPath, 'utf-8'));
    expect(reparsed.agents.entries.a1.model).toBe('mX');
    expect(reparsed.agents.list).toBeUndefined();
  });
});

describe('AgentEditorPort (common interface)', () => {
  let cfgPath = '';

  beforeEach(async () => {
    cfgPath = path.join(homeDir, '.openclaw', 'openclaw.json');
    await writeText(
      cfgPath,
      `{
  agents: { defaults: { workspace: 'w' }, list: [ { id: 'main', name: 'Main', model: 'm0' }, { id: 'coder', model: 'm2' } ] },
  channels: { tg: { token: 'SECRET' } }
}`
    );
  });

  it('createAgentEditor returns an editor for every supported tool', () => {
    for (const tool of ['openclaw', 'hermes', 'claude-code', 'cursor', 'copilot', 'aider']) {
      const ed = createAgentEditor(tool);
      expect(ed).not.toBeNull();
      expect(ed?.tool).toBe(tool);
    }
    expect(createAgentEditor('unknown-tool')).toBeNull();
  });

  it('port methods load + persist through the real file (no config arg needed)', async () => {
    const ed = createAgentEditor('openclaw')!;
    const list = await ed.listAgents();
    expect(list.map((a) => a.id).sort()).toEqual(['coder', 'main']);

    const raw = await ed.getAgentRaw('coder');
    expect((raw as any).model).toBe('m2');

    await ed.setAgentKey('coder', 'identity.emoji', '"🤖"');
    await ed.unsetAgentKey('coder', 'model');
    await ed.addAgent('helper', { name: 'Helper', model: 'm9' });

    const reparsed = JSON5.parse(await fs.readFile(cfgPath, 'utf-8'));
    const coder = reparsed.agents.list.find((a: any) => a.id === 'coder');
    expect(coder.identity.emoji).toBe('🤖');
    expect(coder.model).toBeUndefined();
    expect(reparsed.agents.list.map((a: any) => a.id).sort()).toEqual(['coder', 'helper', 'main']);
    // unrelated keys preserved
    expect(reparsed.channels.tg.token).toBe('SECRET');
  });
});
