import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'fs/promises';
import * as path from 'path';
import { mkdtemp, rm } from 'fs/promises';
import { tmpdir } from 'os';
import { backupFile } from '../core/backup';
import { ProfileSync } from '../core/sync';
import { ProfileManagerImpl } from '../core/profile-manager';
import { parseProfile } from '../schemas/profile-schema';
import { getAllAdapters } from '../adapters/index';
import { AiderAdapter } from '../adapters/aider';
import { HermesAdapter } from '../adapters/hermes';
import type { Profile, AgentProfile } from '../core/profile';
import type { AgentConfig } from '../core/types';

const hoisted = vi.hoisted(() => ({ home: { value: '' } }));

vi.mock('os', async () => {
  const actual = await vi.importActual<typeof import('os')>('os');
  return {
    ...actual,
    homedir: () => hoisted.home.value,
  };
});

let homeDir: string;
let cwdDir: string;
let cwdSpy: ReturnType<typeof vi.spyOn>;

beforeEach(async () => {
  homeDir = await mkdtemp(path.join(tmpdir(), 'aw-fix-home-'));
  cwdDir = await mkdtemp(path.join(tmpdir(), 'aw-fix-cwd-'));
  hoisted.home.value = homeDir;
  cwdSpy = vi.spyOn(process, 'cwd').mockReturnValue(cwdDir);
});

afterEach(async () => {
  cwdSpy.mockRestore();
  await rm(homeDir, { recursive: true, force: true });
  await rm(cwdDir, { recursive: true, force: true });
});

function makeAgent(overrides: Partial<AgentProfile> = {}): AgentProfile {
  return {
    id: 'openclaw',
    name: 'My Agent',
    tool: 'openclaw',
    enabled: true,
    settings: { model: 'anthropic/claude-sonnet-4-6', workspace: '~/.openclaw/workspace' },
    custom: {},
    ...overrides,
  };
}

function makeProfile(agents: AgentProfile[]): Profile {
  return {
    name: 'test',
    description: 'test profile',
    created: new Date().toISOString(),
    updated: new Date().toISOString(),
    agents,
    permissions: { allow: [], deny: [] },
  };
}

function makeAgentConfig(overrides: Partial<AgentConfig> = {}): AgentConfig {
  return {
    project: { name: 't', type: 'web', framework: [], language: [] },
    agents: [
      {
        id: 'agent',
        name: 'Tester',
        role: 'coder',
        model: 'x',
        instructions: '',
        tools: [],
        guardrails: [],
      },
    ],
    skills: [],
    permissions: { allow: [], deny: [] },
    hooks: {},
    mcp: [],
    ...overrides,
  };
}

describe('backupFile hardening (P0-2)', () => {
  it('throws when an existing path cannot be backed up instead of silently returning', async () => {
    // A directory is readable via fs.access but cannot be copied — the copy
    // failure must surface so the caller does not overwrite the original.
    const dirPath = path.join(cwdDir, 'not-a-file');
    await fs.mkdir(dirPath, { recursive: true });

    await expect(backupFile(dirPath)).rejects.toThrow();
  });

  it('still returns null (no throw) when the file does not exist yet', async () => {
    await expect(backupFile(path.join(cwdDir, 'missing.json'))).resolves.toBeNull();
  });

  it('prunes older backups so history does not grow without bound (P2-7)', async () => {
    const file = path.join(cwdDir, 'conf.json');
    await fs.writeFile(file, '{"a":1}');

    await backupFile(file, { keep: 2 });
    await backupFile(file, { keep: 2 });
    await backupFile(file, { keep: 2 });

    const backups = (await fs.readdir(cwdDir)).filter((f) => f.startsWith('conf.json.bak-'));
    expect(backups).toHaveLength(2);
  });
});

describe('profile schema validation (P2-3)', () => {
  it('normalises a profile with missing optional fields instead of crashing', () => {
    const { profile, result } = parseProfile({ name: 'handwritten' });
    expect(result.valid).toBe(true);
    expect(profile?.agents).toEqual([]);
    expect(profile?.permissions).toEqual({ allow: [], deny: [] });
  });

  it('rejects data without a name and reports the reason', () => {
    const { profile, result } = parseProfile({ agents: [] });
    expect(profile).toBeNull();
    expect(result.valid).toBe(false);
    expect(result.errors.join(' ')).toContain('name');
  });

  it('ignores unknown extra keys (passthrough) rather than failing', () => {
    const { profile, result } = parseProfile({ name: 'x', futureField: 1 });
    expect(result.valid).toBe(true);
    expect(profile?.name).toBe('x');
  });
});

describe('several agents for the same tool (P1-3)', () => {
  it('gives a second same-tool agent a unique id instead of rejecting it', async () => {
    const mgr = new ProfileManagerImpl();
    await mgr.writeProfile({
      name: 'p',
      description: 'p',
      created: new Date().toISOString(),
      updated: new Date().toISOString(),
      agents: [],
      permissions: { allow: [], deny: [] },
    });

    const first = await mgr.createAgentProfile('p', 'claude-code');
    const second = await mgr.createAgentProfile('p', 'claude-code', 'Architect');
    const third = await mgr.createAgentProfile('p', 'claude-code', 'Architect');

    expect(first.id).toBe('claude-code');
    expect(second.id).not.toBe(first.id);
    expect(third.id).not.toBe(second.id);

    const profile = await mgr.readProfile('p');
    expect(profile?.agents.map((a) => a.id)).toEqual([first.id, second.id, third.id]);
  });

  it('trims a stray newline in default-profile.txt (P2-8)', async () => {
    const mgr = new ProfileManagerImpl();
    await mgr.writeProfile({
      name: 'named',
      description: 'd',
      created: new Date().toISOString(),
      updated: new Date().toISOString(),
      agents: [],
      permissions: { allow: [], deny: [] },
    });
    await fs.mkdir(path.join(homeDir, '.agent-wizard'), { recursive: true });
    await fs.writeFile(path.join(homeDir, '.agent-wizard', 'default-profile.txt'), 'named\n');

    const profile = await mgr.getDefaultProfile();
    expect(profile.name).toBe('named');
    expect(profile.agents).toEqual([]);
  });
});

describe('sync writes per agent instead of last-write-wins (P0-3)', () => {
  it('writes one Cursor rule file per agent', async () => {
    const sync = new ProfileSync();
    const profile = makeProfile([
      makeAgent({
        id: 'fast',
        name: 'Fast',
        tool: 'cursor',
        settings: { instructions: 'be fast' },
      }),
      makeAgent({
        id: 'arch',
        name: 'Architect',
        tool: 'cursor',
        settings: { instructions: 'design first' },
      }),
    ]);

    const result = await sync.syncProfileToTools(profile);
    expect(result.failed).toHaveLength(0);

    const rulesDir = path.join(cwdDir, '.cursor', 'rules');
    const files = (await fs.readdir(rulesDir)).filter((f) => f.endsWith('.mdc')).sort();
    expect(files).toHaveLength(2);

    const contents = await Promise.all(
      files.map((f) => fs.readFile(path.join(rulesDir, f), 'utf-8')),
    );
    expect(contents.join('\n')).toContain('be fast');
    expect(contents.join('\n')).toContain('design first');
  });

  it('accumulates Copilot managed sections for two agents in one file', async () => {
    const sync = new ProfileSync();
    const profile = makeProfile([
      makeAgent({ id: 'fast', name: 'Fast', tool: 'copilot', settings: { instructions: 'fast rules' } }),
      makeAgent({ id: 'arch', name: 'Architect', tool: 'copilot', settings: { instructions: 'arch rules' } }),
    ]);

    await sync.syncProfileToTools(profile);

    const filePath = path.join(cwdDir, '.github', 'copilot-instructions.md');
    const content = await fs.readFile(filePath, 'utf-8');
    expect(content).toContain('<!-- agent-wizard:fast -->');
    expect(content).toContain('<!-- agent-wizard:arch -->');
    expect(content).toContain('fast rules');
    expect(content).toContain('arch rules');
  });

  it('reports unchanged tools separately from synced ones (P3)', async () => {
    const sync = new ProfileSync();
    const profile = makeProfile([makeAgent()]);

    await sync.syncProfileToTools(profile);
    const second = await sync.syncProfileToTools(profile);

    expect(second.success).toHaveLength(0);
    expect(second.unchanged).toContain('openclaw');
    expect(second.preview[0].action).toBe('unchanged');
  });

  it('keeps key order irrelevant when deciding "unchanged" (P1-5)', async () => {
    const sync = new ProfileSync();
    const configPath = path.join(homeDir, '.openclaw', 'openclaw.json');
    await fs.mkdir(path.dirname(configPath), { recursive: true });
    // Same data as the first sync will produce, but with a different key order.
    await fs.writeFile(
      configPath,
      JSON.stringify(
        {
          tools: { allow: [], deny: [] },
          agents: {
            defaults: {
              model: { primary: 'anthropic/claude-sonnet-4-6' },
              workspace: '~/.openclaw/workspace',
            },
            entries: { openclaw: { identity: { name: 'My Agent' } } },
          },
        },
        null,
        2,
      ),
    );

    const result = await sync.syncProfileToTools(makeProfile([makeAgent()]), { dryRun: true });
    expect(result.preview[0].action).toBe('unchanged');
  });
});

describe('wizard answers actually reach the config file (P1-1)', () => {
  it('writes the Aider architect answer from Agent.settings', async () => {
    const adapter = new AiderAdapter();
    const config = makeAgentConfig({
      agents: [
        {
          id: 'aider',
          name: 'A',
          role: 'coder',
          model: 'sonnet',
          instructions: '',
          tools: [],
          guardrails: [],
          settings: { architect: true },
        },
      ],
    });

    await adapter.write(config);

    const raw = await fs.readFile(path.join(cwdDir, '.aider.conf.yml'), 'utf-8');
    expect(raw).toContain('architect: true');
  });

  it('lets the Hermes reasoning_effort answer override the existing value', async () => {
    const adapter = new HermesAdapter();
    const configPath = path.join(homeDir, '.hermes', 'config.yaml');
    await fs.mkdir(path.dirname(configPath), { recursive: true });
    await fs.writeFile(configPath, 'agent:\n  reasoning_effort: low\n');

    const config = makeAgentConfig({
      agents: [
        {
          id: 'hermes',
          name: 'Hermes',
          role: 'coder',
          model: 'anthropic/claude-opus-4.6',
          instructions: 'be helpful',
          tools: [],
          guardrails: [],
          settings: { reasoning_effort: 'high' },
        },
      ],
    });

    await adapter.write(config);

    const raw = await fs.readFile(configPath, 'utf-8');
    expect(raw).toContain('reasoning_effort: high');
    expect(raw).toContain('be helpful');
  });
});

describe('adapter registry (P2-1)', () => {
  it('exposes every supported tool from one place with a label', () => {
    const registry = getAllAdapters();
    expect(registry.map((r) => r.tool)).toEqual([
      'openclaw',
      'hermes',
      'claude-code',
      'cursor',
      'copilot',
      'aider',
    ]);
    for (const entry of registry) {
      expect(entry.label.length).toBeGreaterThan(0);
      expect(entry.adapter.name).toBe(entry.tool);
    }
  });
});

describe('adapters create a restore point before overwriting (P0-1)', () => {
  it('backs up an existing Aider config written via the init/configure path', async () => {
    const adapter = new AiderAdapter();
    // First write creates the file (nothing to back up yet).
    await adapter.write(makeAgentConfig());
    const configPath = path.join(cwdDir, '.aider.conf.yml');

    // Simulate a user-owned config that must not be lost.
    await fs.writeFile(configPath, 'model: gpt-4o\nmap-tokens: 1024\n');

    await adapter.write(makeAgentConfig());

    const backups = (await fs.readdir(cwdDir)).filter((f) =>
      f.startsWith('.aider.conf.yml.bak-'),
    );
    expect(backups).toHaveLength(1);
    expect(await fs.readFile(path.join(cwdDir, backups[0]), 'utf-8')).toContain('gpt-4o');
  });

  it('exposes one serializer for OpenClaw so both write paths agree', async () => {
    const { OpenClawAdapter } = await import('../adapters/openclaw');
    const adapter = new OpenClawAdapter();
    // Default style is the documented JSON5 on-disk format.
    const json5Text = adapter.serialize({ agents: { defaults: { workspace: 'w' } } });
    expect(json5Text).toContain('workspace');
    // Strict style is plain JSON (readable by JSON.parse) — used by sync.
    const strictText = adapter.serialize({ agents: { defaults: { workspace: 'w' } } }, 'strict');
    expect(() => JSON.parse(strictText)).not.toThrow();
  });

  it('writes openclaw.json through the adapter serializer on the sync path too', async () => {
    const sync = new ProfileSync();
    await sync.syncProfileToTools(makeProfile([makeAgent()]));

    const configPath = path.join(homeDir, '.openclaw', 'openclaw.json');
    const raw = await fs.readFile(configPath, 'utf-8');

    const { OpenClawAdapter } = await import('../adapters/openclaw');
    const adapter = new OpenClawAdapter();

    // Byte-identical to the adapter's own strict output: sync no longer keeps a
    // second JSON.stringify copy that could drift from the adapter's format.
    expect(adapter.serialize(JSON.parse(raw), 'strict')).toBe(raw);
    // OpenClaw (JSON5 reader) must accept what sync wrote.
    const JSON5 = (await import('json5')).default;
    expect(() => JSON5.parse(raw)).not.toThrow();
  });
});
