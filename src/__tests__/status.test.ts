import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'fs/promises';
import * as path from 'path';
import { mkdtemp, rm, chmod } from 'fs/promises';
import { tmpdir } from 'os';
import { findExecutable } from '../core/tool-check';
import { StatusAdapter } from '../core/status-adapter';

const hoisted = vi.hoisted(() => ({ home: { value: '' } }));

vi.mock('os', async () => {
  const actual = await vi.importActual<typeof import('os')>('os');
  return {
    ...actual,
    homedir: () => hoisted.home.value,
  };
});

let homeDir: string;
let binDir: string;
let originalPath: string | undefined;
let originalPathExt: string | undefined;

beforeEach(async () => {
  homeDir = await mkdtemp(path.join(tmpdir(), 'aw-status-'));
  binDir = await mkdtemp(path.join(tmpdir(), 'aw-bin-'));
  hoisted.home.value = homeDir;
  originalPath = process.env.PATH;
  originalPathExt = process.env.PATHEXT;
});

afterEach(async () => {
  if (originalPath !== undefined) process.env.PATH = originalPath;
  if (originalPathExt !== undefined) process.env.PATHEXT = originalPathExt;
  await rm(homeDir, { recursive: true, force: true });
  await rm(binDir, { recursive: true, force: true });
});

async function writeJson(p: string, content: unknown) {
  await fs.mkdir(path.dirname(p), { recursive: true });
  await fs.writeFile(p, JSON.stringify(content, null, 2));
}

describe('findExecutable', () => {
  it('finds a binary on PATH', async () => {
    const exeName = process.platform === 'win32' ? 'openclaw.cmd' : 'openclaw';
    const exePath = path.join(binDir, exeName);
    await fs.writeFile(exePath, '#!/bin/sh\n');
    if (process.platform !== 'win32') {
      await chmod(exePath, 0o755).catch(() => {});
    }
    process.env.PATH = binDir;

    expect(findExecutable(['openclaw'])).not.toBeNull();
  });

  it('returns null when binary is not on PATH', () => {
    process.env.PATH = binDir;
    expect(findExecutable(['definitely-not-a-real-tool'])).toBeNull();
  });
});

describe('StatusAdapter', () => {
  it('reports error for an unparseable OpenClaw config', async () => {
    await writeJson(path.join(homeDir, '.openclaw', 'openclaw.json'), '{{{{ not json');

    const adapter = new StatusAdapter();
    const status = await adapter.getToolStatus('openclaw');
    expect(status?.status).toBe('error');
    expect(status?.configValid).toBe(false);
  });

  it('reports configured (valid config, no binary on PATH)', async () => {
    process.env.PATH = binDir; // binDir has no openclaw binary
    await writeJson(path.join(homeDir, '.openclaw', 'openclaw.json'), {
      agents: { defaults: { workspace: '~/.openclaw/workspace' }, entries: { oc: { identity: { name: 'OC' } } } },
    });

    const adapter = new StatusAdapter();
    const status = await adapter.getToolStatus('openclaw');
    expect(status?.status).toBe('configured');
    expect(status?.configValid).toBe(true);
  });

  it('reports active when a valid config exists and the binary is on PATH', async () => {
    const exeName = process.platform === 'win32' ? 'openclaw.cmd' : 'openclaw';
    const exePath = path.join(binDir, exeName);
    await fs.writeFile(exePath, '#!/bin/sh\n');
    if (process.platform !== 'win32') {
      await chmod(exePath, 0o755).catch(() => {});
    }
    process.env.PATH = binDir;

    await writeJson(path.join(homeDir, '.openclaw', 'openclaw.json'), {
      agents: { defaults: { workspace: '~/.openclaw/workspace' }, entries: { oc: { identity: { name: 'OC' } } } },
    });

    const adapter = new StatusAdapter();
    const status = await adapter.getToolStatus('openclaw');
    expect(status?.status).toBe('active');
  });

  it('reports not-configured when no config exists', async () => {
    const adapter = new StatusAdapter();
    const status = await adapter.getToolStatus('hermes');
    expect(status?.status).toBe('not-configured');
    expect(status?.configValid).toBeNull();
  });

  it('returns null for an unknown tool', async () => {
    const adapter = new StatusAdapter();
    expect(await adapter.getToolStatus('not-a-tool')).toBeNull();
  });
});
