import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'fs/promises';
import * as path from 'path';
import { mkdtemp, rm } from 'fs/promises';
import { tmpdir } from 'os';
import { ProfileSync } from '../core/sync';
import { Profile } from '../core/profile';

const hoisted = vi.hoisted(() => ({ home: { value: '' } }));

vi.mock('os', async () => {
  const actual = await vi.importActual<typeof import('os')>('os');
  return {
    ...actual,
    homedir: () => hoisted.home.value,
  };
});

let homeDir: string;
let sync: ProfileSync;

function makeProfile(overrides: Partial<Profile> = {}): Profile {
  return {
    name: 'test',
    description: 'test profile',
    created: new Date().toISOString(),
    updated: new Date().toISOString(),
    agents: [
      {
        id: 'openclaw',
        name: 'My Agent',
        tool: 'openclaw',
        enabled: true,
        settings: { model: 'anthropic/claude-sonnet-4-6', workspace: '~/.openclaw/workspace' },
        custom: {},
      },
    ],
    permissions: { allow: ['Bash(npm run *)'], deny: [] },
    ...overrides,
  };
}

beforeEach(async () => {
  homeDir = await mkdtemp(path.join(tmpdir(), 'aw-sync-'));
  hoisted.home.value = homeDir;
  sync = new ProfileSync();
});

afterEach(async () => {
  await rm(homeDir, { recursive: true, force: true });
});

describe('ProfileSync dry-run', () => {
  it('reports create/modify/unchanged without writing any file', async () => {
    const profile = makeProfile();
    const result = await sync.syncProfileToTools(profile, { dryRun: true });

    // Nothing written
    await expect(fs.access(path.join(homeDir, '.openclaw', 'openclaw.json'))).rejects.toThrow();

    expect(result.preview).toHaveLength(1);
    expect(result.preview[0]).toMatchObject({ tool: 'openclaw', action: 'create' });
    expect(result.preview[0].path).toContain('.openclaw');
    expect(result.success).toHaveLength(0);
    expect(result.failed).toHaveLength(0);
  });

  it('marks existing unchanged configs as unchanged', async () => {
    const profile = makeProfile();
    // First sync for real, then dry-run again -> nothing should change
    await sync.syncProfileToTools(profile);
    const result = await sync.syncProfileToTools(profile, { dryRun: true });

    expect(result.preview[0].action).toBe('unchanged');
  });

  it('marks modified configs as modify', async () => {
    const profile = makeProfile();
    await sync.syncProfileToTools(profile);

    const changed = makeProfile({
      agents: [
        {
          id: 'openclaw',
          name: 'My Agent',
          tool: 'openclaw',
          enabled: true,
          settings: { model: 'anthropic/claude-opus-4-6', workspace: '~/.openclaw/workspace' },
          custom: {},
        },
      ],
    });
    const result = await sync.syncProfileToTools(changed, { dryRun: true });
    expect(result.preview[0].action).toBe('modify');
  });
});

describe('ProfileSync write', () => {
  it('creates config and a backup when file existed before', async () => {
    const profile = makeProfile();
    await sync.syncProfileToTools(profile);

    const configPath = path.join(homeDir, '.openclaw', 'openclaw.json');
    const first = JSON.parse(await fs.readFile(configPath, 'utf-8'));
    expect(first.agents.entries.openclaw.identity.name).toBe('My Agent');

    // Modify and re-sync -> backup of the previous file must exist
    const changed = makeProfile({
      agents: [
        {
          id: 'openclaw',
          name: 'Renamed',
          tool: 'openclaw',
          enabled: true,
          settings: { model: 'anthropic/claude-opus-4-6', workspace: '~/.openclaw/workspace' },
          custom: {},
        },
      ],
    });
    await sync.syncProfileToTools(changed);

    const second = JSON.parse(await fs.readFile(configPath, 'utf-8'));
    expect(second.agents.entries.openclaw.identity.name).toBe('Renamed');

    const backups = (await fs.readdir(path.join(homeDir, '.openclaw')))
      .filter((f) => f.startsWith('openclaw.json.bak-'));
    expect(backups.length).toBeGreaterThanOrEqual(1);

    // Backup content preserves the previous version
    const backupContent = JSON.parse(await fs.readFile(path.join(homeDir, '.openclaw', backups[0]), 'utf-8'));
    expect(backupContent.agents.entries.openclaw.identity.name).toBe('My Agent');
  });

  it('preserves unknown top-level keys (channels/models/mcp) on write', async () => {
    const configPath = path.join(homeDir, '.openclaw', 'openclaw.json');
    await fs.mkdir(path.dirname(configPath), { recursive: true });
    await fs.writeFile(
      configPath,
      JSON.stringify({
        channels: { slack: { enabled: true, botToken: 'xoxb-secret' } },
        models: { providers: { anthropic: { apiKey: 'sk-abc' } } },
        mcp: { servers: { filesystem: { command: 'npx', args: ['-y', '@modelcontextprotocol/server-filesystem'] } } },
        agents: { defaults: { workspace: '~/.openclaw/workspace', model: { primary: 'old-model' } }, entries: {} },
      }, null, 2),
    );

    const profile = makeProfile();
    await sync.syncProfileToTools(profile);

    const after = JSON.parse(await fs.readFile(configPath, 'utf-8'));
    expect(after.channels.slack.botToken).toBe('xoxb-secret');
    expect(after.models.providers.anthropic.apiKey).toBe('sk-abc');
    expect(after.mcp.servers.filesystem.command).toBe('npx');
    expect(after.agents.entries.openclaw.identity.name).toBe('My Agent');
  });
});

describe('ProfileSync error handling', () => {
  it('reports unsupported tools as failed with a reason instead of silently succeeding', async () => {
    const profile = makeProfile({
      agents: [
        {
          id: 'bogus',
          name: 'Bogus',
          tool: 'bogus-tool',
          enabled: true,
          settings: {},
          custom: {},
        },
      ],
    });

    const result = await sync.syncProfileToTools(profile);
    expect(result.success).toHaveLength(0);
    expect(result.failed).toHaveLength(1);
    expect(result.failed[0]).toMatchObject({ tool: 'bogus-tool' });
    expect(result.failed[0].reason).toContain('Unsupported tool');
  });

  it('skips disabled agents entirely', async () => {
    const profile = makeProfile({
      agents: [
        {
          id: 'openclaw',
          name: 'Off',
          tool: 'openclaw',
          enabled: false,
          settings: {},
          custom: {},
        },
      ],
    });

    const result = await sync.syncProfileToTools(profile);
    expect(result.preview).toHaveLength(0);
    expect(result.success).toHaveLength(0);
    expect(result.failed).toHaveLength(0);
  });
});
