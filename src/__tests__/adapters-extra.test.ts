import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'fs/promises';
import * as path from 'path';
import { mkdtemp, rm } from 'fs/promises';
import { tmpdir } from 'os';
import { CursorAdapter } from '../adapters/cursor';
import { CopilotAdapter } from '../adapters/copilot';
import { AiderAdapter } from '../adapters/aider';
import { AgentConfig } from '../core/types';

let cwdDir: string;
let cwdSpy: ReturnType<typeof vi.spyOn>;

function makeConfig(overrides: Partial<AgentConfig> = {}): AgentConfig {
  return {
    project: { name: 't', type: 'web', framework: [], language: [] },
    agents: [
      { id: 'agent', name: 'Tester', role: 'coder', model: 'x', instructions: 'Do the thing', tools: [], guardrails: [] },
    ],
    skills: [],
    permissions: { allow: ['Bash(npm run *)'], deny: [] },
    hooks: {},
    mcp: [],
    ...overrides,
  };
}

beforeEach(async () => {
  cwdDir = await mkdtemp(path.join(tmpdir(), 'aw-adapter-'));
  cwdSpy = vi.spyOn(process, 'cwd').mockReturnValue(cwdDir);
});

afterEach(async () => {
  cwdSpy.mockRestore();
  await rm(cwdDir, { recursive: true, force: true });
});

describe('CursorAdapter', () => {
  it('writes and reads .mdc rule files', async () => {
    const adapter = new CursorAdapter();
    await adapter.write(makeConfig());

    const rulesDir = path.join(cwdDir, '.cursor', 'rules');
    const files = await fs.readdir(rulesDir);
    expect(files.some((f) => f.endsWith('.mdc'))).toBe(true);

    const readBack = await adapter.read();
    expect(readBack.agents.length).toBeGreaterThan(0);
    expect(readBack.agents[0].instructions).toContain('Do the thing');
  });

  it('validate passes on a well-formed rule file', async () => {
    const adapter = new CursorAdapter();
    await adapter.write(makeConfig());
    const result = await adapter.validate();
    expect(result.valid).toBe(true);
  });

  it('validate fails on malformed frontmatter', async () => {
    const adapter = new CursorAdapter();
    const rulesDir = path.join(cwdDir, '.cursor', 'rules');
    await fs.mkdir(rulesDir, { recursive: true });
    await fs.writeFile(path.join(rulesDir, 'broken.mdc'), 'no frontmatter here');
    const result = await adapter.validate();
    expect(result.valid).toBe(false);
  });
});

describe('CopilotAdapter', () => {
  it('writes and reads repository instructions', async () => {
    const adapter = new CopilotAdapter();
    await adapter.write(makeConfig());

    const instructionsPath = path.join(cwdDir, '.github', 'copilot-instructions.md');
    const content = await fs.readFile(instructionsPath, 'utf-8');
    expect(content).toContain('Do the thing');

    const readBack = await adapter.read();
    expect(readBack.agents.length).toBeGreaterThan(0);
  });

  it('validate passes when instructions exist', async () => {
    const adapter = new CopilotAdapter();
    await adapter.write(makeConfig());
    expect((await adapter.validate()).valid).toBe(true);
  });

  it('validate fails when no instructions exist', async () => {
    const adapter = new CopilotAdapter();
    expect((await adapter.validate()).valid).toBe(false);
  });
});

describe('AiderAdapter', () => {
  it('writes and reads .aider.conf.yml', async () => {
    const adapter = new AiderAdapter();
    await adapter.write(makeConfig());

    const configPath = path.join(cwdDir, '.aider.conf.yml');
    const content = await fs.readFile(configPath, 'utf-8');
    expect(content).toContain('model: x');

    const readBack = await adapter.read();
    expect(readBack.agents[0].model).toBe('x');
  });

  it('validate passes on a written config', async () => {
    const adapter = new AiderAdapter();
    await adapter.write(makeConfig());
    expect((await adapter.validate()).valid).toBe(true);
  });
});
