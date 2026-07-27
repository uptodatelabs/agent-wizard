import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';

const TMP = path.join(os.tmpdir(), 'aw-all-tools-' + Date.now());
const homeValue = { value: TMP };

vi.mock('os', async () => {
  const actual = (await vi.importActual('os')) as typeof import('os');
  return {
    ...actual,
    homedir: () => homeValue.value,
  };
});

import { createAgentEditor } from '../core/agent-editor';

describe('AgentEditorPort — all supported tools', () => {
  beforeEach(async () => {
    await fs.mkdir(TMP, { recursive: true });
  });

  afterEach(async () => {
    await fs.rm(TMP, { recursive: true, force: true });
  });

  it('hermes: personalities as agents (list/get/set/add/remove + backup)', async () => {
    const hermesDir = path.join(TMP, '.hermes');
    await fs.mkdir(hermesDir, { recursive: true });
    await fs.writeFile(
      path.join(hermesDir, 'config.yaml'),
      'model:\n  default: gpt-4\nagent:\n  personalities:\n    coder: "You are a coder."\n    reviewer: "You review."\n'
    );

    const ed = createAgentEditor('hermes')!;
    const list = await ed.listAgents();
    expect(list.map((a) => a.id).sort()).toEqual(['coder', 'reviewer']);
    // builtin classification: coder/reviewer are not in the Hermes built-in set
    expect(list.every((a) => a.builtin === false)).toBe(true);

    const raw = await ed.getAgentRaw('coder');
    expect((raw as any).instructions).toBe('You are a coder.');

    await ed.setAgentKey('coder', 'instructions', '"edited"');
    await ed.addAgent('tester', { instructions: 'new' });
    const rep = (await import('yaml')).parse(await fs.readFile(path.join(hermesDir, 'config.yaml'), 'utf-8'));
    expect(Object.keys(rep.agent.personalities).sort()).toEqual(['coder', 'reviewer', 'tester']);
    expect(rep.agent.personalities.coder).toBe('edited');

    await ed.removeAgent('tester');
    await ed.save();
    const rep2 = (await import('yaml')).parse(await fs.readFile(path.join(hermesDir, 'config.yaml'), 'utf-8'));
    expect(Object.keys(rep2.agent.personalities).sort()).toEqual(['coder', 'reviewer']);
    expect(rep2.model.default).toBe('gpt-4'); // untouched key preserved
  });

  it('claude-code: settings object as one agent (set key + backup)', async () => {
    const dir = path.join(TMP, '.claude');
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(path.join(dir, 'settings.json'), JSON.stringify({ model: 'claude-opus', permissions: { allow: ['Read'] } }, null, 2));

    const ed = createAgentEditor('claude-code')!;
    const list = await ed.listAgents();
    // Dashboard passes the agent id from status.agents ('default'); CLI uses 'user'.
    // Both must work since Claude Code is a single settings scope.
    expect(list[0].id).toBe('default');

    // Dashboard path (id 'default')
    await ed.setAgentKey('default', 'model', '"claude-sonnet"');
    await ed.save();
    const rep = JSON.parse(await fs.readFile(path.join(dir, 'settings.json'), 'utf-8'));
    expect(rep.model).toBe('claude-sonnet');
    expect(rep.permissions.allow).toEqual(['Read']); // preserved

    // CLI path (id 'user') also accepted
    await ed.setAgentKey('user', 'model', '"claude-opus"');
    const rep2 = JSON.parse(await fs.readFile(path.join(dir, 'settings.json'), 'utf-8'));
    expect(rep2.model).toBe('claude-opus');
  });

  it('aider: config file as one agent (set key + backup)', async () => {
    await fs.writeFile(path.join(TMP, '.aider.conf.yml'), 'model: gpt-4\nauto-commits: true\n');
    const ed = createAgentEditor('aider')!;
    const list = await ed.listAgents();
    expect(list[0].id).toBe('default');
    // Dashboard passes 'default'; CLI passes 'aider' — both accepted
    await ed.setAgentKey('default', 'model', '"gpt-4o"');
    await ed.save();
    const rep = (await import('yaml')).parse(await fs.readFile(path.join(TMP, '.aider.conf.yml'), 'utf-8'));
    expect(rep.model).toBe('gpt-4o');
    expect(rep['auto-commits']).toBe(true); // preserved
  });

  it('cursor: .mdc rule files as agents (set/add/remove + backup)', async () => {
    const rulesDir = path.join(TMP, '.cursor', 'rules');
    await fs.mkdir(rulesDir, { recursive: true });
    await fs.writeFile(
      path.join(rulesDir, 'rule1.mdc'),
      '---\ndescription: "Rule one"\nglobs: **/*\nalwaysApply: false\n---\n\nBody of rule one.\n'
    );
    const ed = createAgentEditor('cursor') as any;
    // Point the editor at TMP via its baseDir constructor option
    const CursorEditor = ed.constructor;
    const editor = new CursorEditor(TMP);

    const list = await editor.listAgents();
    expect(list.map((a: any) => a.id)).toContain('rule1.mdc');

    await editor.setAgentKey('rule1', 'description', '"Updated"');
    await editor.addAgent('rule2', { description: 'R2', content: 'x' });
    const files = (await fs.readdir(rulesDir)).filter((f) => !f.includes('.bak-'));
    expect(files.sort()).toEqual(['rule1.mdc', 'rule2.mdc']);

    await editor.removeAgent('rule2');
    expect((await fs.readdir(rulesDir)).filter((f) => !f.includes('.bak-')).sort()).toEqual(['rule1.mdc']);
  });

  it('copilot: instructions as agents (set/add/remove + backup)', async () => {
    const gh = path.join(TMP, '.github');
    await fs.mkdir(gh, { recursive: true });
    await fs.writeFile(path.join(gh, 'copilot-instructions.md'), '# Repo instructions\n');
    const ed = createAgentEditor('copilot') as any;
    const CopilotEditor = ed.constructor;
    const editor = new CopilotEditor(TMP);

    const list = await editor.listAgents();
    expect(list.map((a: any) => a.id)).toContain('repo-wide');

    await editor.setAgentKey('repo-wide', 'content', 'New repo content');
    await editor.addAgent('backend', { applyTo: 'src/**', content: 'be' });
    const instDir = path.join(gh, 'instructions');
    expect((await fs.readdir(instDir)).filter((f) => !f.includes('.bak-')).sort()).toEqual(['backend.instructions.md']);

    await editor.removeAgent('backend');
    expect((await fs.readdir(instDir)).filter((f) => !f.includes('.bak-')).length).toBe(0);
  });
});
