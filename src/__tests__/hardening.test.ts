import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'fs/promises';
import * as path from 'path';
import { mkdtemp, rm } from 'fs/promises';
import { tmpdir } from 'os';
import { ProfileManagerImpl, validateProfileName } from '../core/profile-manager';
import { isSupportedTool } from '../core/tools';

const hoisted = vi.hoisted(() => ({ home: { value: '' } }));

vi.mock('os', async () => {
  const actual = await vi.importActual<typeof import('os')>('os');
  return {
    ...actual,
    homedir: () => hoisted.home.value,
  };
});

let homeDir: string;
let mgr: ProfileManagerImpl;

beforeEach(async () => {
  homeDir = await mkdtemp(path.join(tmpdir(), 'aw-hard-'));
  hoisted.home.value = homeDir;
  mgr = new ProfileManagerImpl();
});

afterEach(async () => {
  await rm(homeDir, { recursive: true, force: true });
});

describe('validateProfileName', () => {
  it('accepts normal names', () => {
    expect(validateProfileName('my-project')).toBeNull();
    expect(validateProfileName('team_2026')).toBeNull();
  });

  it('rejects path traversal attempts', () => {
    expect(validateProfileName('..')).not.toBeNull();
    expect(validateProfileName('../evil')).not.toBeNull();
    expect(validateProfileName('..\\evil')).not.toBeNull();
    expect(validateProfileName('a/b')).not.toBeNull();
    expect(validateProfileName('a\\b')).not.toBeNull();
    expect(validateProfileName('.')).not.toBeNull();
  });

  it('rejects empty and whitespace-only names', () => {
    expect(validateProfileName('')).not.toBeNull();
    expect(validateProfileName('   ')).not.toBeNull();
  });

  it('rejects leading/trailing whitespace', () => {
    expect(validateProfileName('  padded')).not.toBeNull();
  });
});

describe('ProfileManagerImpl name safety', () => {
  it('refuses to create a profile with a path-traversal name', async () => {
    await expect(mgr.writeProfile({
      name: '../escape',
      description: 'x',
      created: new Date().toISOString(),
      updated: new Date().toISOString(),
      agents: [],
      permissions: { allow: [], deny: [] },
    })).rejects.toThrow('path separators');
  });

  it('refuses to delete outside the profiles directory', async () => {
    await mgr.writeProfile({
      name: 'ok',
      description: 'x',
      created: new Date().toISOString(),
      updated: new Date().toISOString(),
      agents: [],
      permissions: { allow: [], deny: [] },
    });
    // Deleting '..' would target the parent of the profiles dir if unsanitized
    await expect(mgr.deleteProfile('..')).rejects.toThrow();
    // The valid profile still exists
    expect(await mgr.readProfile('ok')).not.toBeNull();
  });

  it('refuses to import a profile whose name escapes the directory', async () => {
    const evilYaml = [
      'name: "../pwned"',
      'description: "x"',
      'agents: []',
      'permissions:',
      '  allow: []',
      '  deny: []',
    ].join('\n');
    await expect(mgr.importProfile(evilYaml)).rejects.toThrow();
  });
});

describe('isSupportedTool', () => {
  it('accepts the six supported tools', () => {
    for (const t of ['openclaw', 'hermes', 'claude-code', 'cursor', 'copilot', 'aider']) {
      expect(isSupportedTool(t)).toBe(true);
    }
  });

  it('rejects unknown tools', () => {
    expect(isSupportedTool('bogus')).toBe(false);
    expect(isSupportedTool('')).toBe(false);
  });
});

describe('createAgentProfile tool validation', () => {
  it('rejects unknown tools', async () => {
    await mgr.writeProfile({
      name: 'p',
      description: 'x',
      created: new Date().toISOString(),
      updated: new Date().toISOString(),
      agents: [],
      permissions: { allow: [], deny: [] },
    });
    await expect(mgr.createAgentProfile('p', 'not-a-tool')).rejects.toThrow('Unsupported tool');
  });
});

describe('profile backup on write', () => {
  it('backs up an existing profile before overwriting', async () => {
    const profile = {
      name: 'bkp',
      description: 'v1',
      created: new Date().toISOString(),
      updated: new Date().toISOString(),
      agents: [],
      permissions: { allow: [], deny: [] },
    };
    await mgr.writeProfile(profile);
    await mgr.writeProfile({ ...profile, description: 'v2' });

    const dir = path.join(homeDir, '.agent-wizard', 'profiles', 'bkp');
    const files = await fs.readdir(dir);
    expect(files.some((f) => f.startsWith('profile.yaml.bak-'))).toBe(true);
  });
});
