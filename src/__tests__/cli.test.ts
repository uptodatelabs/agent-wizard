import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { execSync, spawn } from 'child_process';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { mkdtemp, rm } from 'fs/promises';

const repoRoot = path.resolve(__dirname, '..', '..');
const cliPath = path.join(repoRoot, 'dist', 'cli.js');

/**
 * Run the built CLI in a subprocess with an isolated HOME so no real user
 * configuration is touched. Returns { code, stdout, stderr }.
 */
function runCli(args: string[], opts: { cwd?: string; home?: string } = {}): Promise<{ code: number | null; stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const env = {
      ...process.env,
      HOME: opts.home || os.tmpdir(),
      USERPROFILE: opts.home || os.tmpdir(),
      // Prevent interactive prompts in non-TTY environments
      CI: 'true',
    };
    const child = spawn(process.execPath, [cliPath, ...args], {
      cwd: opts.cwd || repoRoot,
      env,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (d) => (stdout += d.toString()));
    child.stderr.on('data', (d) => (stderr += d.toString()));
    child.on('error', reject);
    child.on('close', (code) => resolve({ code, stdout, stderr }));
  });
}

let homeDir: string;
let projectDir: string;

beforeAll(async () => {
  // Ensure the CLI build exists (fast: JS bundles only, no DTS)
  if (!(await fs.stat(cliPath).catch(() => null))) {
    execSync('npx tsup --no-dts', { cwd: repoRoot, stdio: 'ignore' });
  }
  homeDir = await mkdtemp(path.join(os.tmpdir(), 'aw-cli-home-'));
  projectDir = await mkdtemp(path.join(os.tmpdir(), 'aw-cli-proj-'));
});

afterAll(async () => {
  await rm(homeDir, { recursive: true, force: true });
  await rm(projectDir, { recursive: true, force: true });
});

describe('agent-wizard CLI (end-to-end)', () => {
  it('reports the version from package.json', async () => {
    const r = await runCli(['--version'], { home: homeDir });
    expect(r.code).toBe(0);
    expect(r.stdout.trim()).toBe('0.1.0');
  });

  it('detects a project', async () => {
    const r = await runCli(['detect'], { home: homeDir, cwd: projectDir });
    expect(r.code).toBe(0);
    expect(r.stdout).toContain('Project Information');
  });

  it('creates a profile non-interactively', async () => {
    const r = await runCli(['profile', 'create', 'demo', '-d', 'cli test'], { home: homeDir });
    expect(r.code).toBe(0);
    expect(r.stdout).toContain("Profile 'demo' created");

    const profileDir = path.join(homeDir, '.agent-wizard', 'profiles', 'demo');
    await expect(fs.readFile(path.join(profileDir, 'profile.yaml'), 'utf-8')).resolves.toContain('name: demo');
  });

  it('lists profiles', async () => {
    await runCli(['profile', 'create', 'demo', '-d', 'x'], { home: homeDir });
    const r = await runCli(['profile', 'list'], { home: homeDir });
    expect(r.code).toBe(0);
    expect(r.stdout).toContain('demo');
  });

  it('rejects an unsupported tool in agent add', async () => {
    await runCli(['profile', 'create', 'demo', '-d', 'x'], { home: homeDir });
    const r = await runCli(['agent', 'add', 'demo', 'not-a-tool'], { home: homeDir });
    expect(r.code).toBe(1);
    expect(r.stderr).toContain("Unsupported tool 'not-a-tool'");
    expect(r.stdout).toContain('Supported tools:');
  });

  it('syncs a profile to a tool and writes the config file', async () => {
    await runCli(['profile', 'create', 'syncp', '-d', 'x'], { home: homeDir });
    await runCli(['agent', 'add', 'syncp', 'openclaw'], { home: homeDir });

    const dry = await runCli(['sync', 'to-tools', 'syncp', '--dry-run'], { home: homeDir });
    expect(dry.code).toBe(0);
    expect(dry.stdout).toContain('will be created');
    // dry-run must not write anything
    await expect(fs.access(path.join(homeDir, '.openclaw', 'openclaw.json'))).rejects.toThrow();

    const real = await runCli(['sync', 'to-tools', 'syncp'], { home: homeDir });
    expect(real.code).toBe(0);
    expect(real.stdout).toContain('Synced to');
    await expect(fs.access(path.join(homeDir, '.openclaw', 'openclaw.json'))).resolves.toBeUndefined();
  });

  it('shows tool status', async () => {
    const r = await runCli(['status', 'list'], { home: homeDir });
    expect(r.code).toBe(0);
    expect(r.stdout).toContain('OpenClaw');
  });

  it('rejects a profile name with path separators', async () => {
    const r = await runCli(['profile', 'create', 'a/b', '-d', 'x'], { home: homeDir });
    expect(r.code).toBe(1);
    expect(r.stderr).toContain('path separators');
  });
});
