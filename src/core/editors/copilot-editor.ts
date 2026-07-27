import * as fs from 'fs/promises';
import * as path from 'path';
import { AgentEditorPort, AgentListItem, AgentSettings, setByPath, deleteByPath, parseValue } from '../agent-editor';
import { backupFile } from '../backup';

interface CopilotPathInstruction {
  name: string;
  applyTo: string;
  content: string;
  excludeAgent?: string;
}

/**
 * GitHub Copilot agent editing.
 *
 * Copilot instructions live in `.github/copilot-instructions.md` (repository-wide)
 * and `.github/instructions/*.instructions.md` (path-specific). Each of these is
 * surfaced as one editable agent:
 *   - id "repo-wide"  -> the repository-wide instructions
 *   - id "<name>"     -> a path-specific instruction file
 * Raw settings: { applyTo, content } (applyTo only meaningful for path-specific).
 */
export class CopilotAgentEditor implements AgentEditorPort {
  readonly tool = 'copilot';
  private readonly repoWideId = 'repo-wide';
  private instructionsDir: string;
  private instructionsFile: string;
  private pathInstructionsDir: string;

  constructor(baseDir?: string) {
    const base = baseDir ?? process.cwd();
    this.instructionsDir = path.join(base, '.github');
    this.instructionsFile = path.join(base, '.github', 'copilot-instructions.md');
    this.pathInstructionsDir = path.join(base, '.github', 'instructions');
  }

  private parsePathInstruction(fileName: string, content: string): CopilotPathInstruction | null {
    const m = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
    if (!m) return null;
    const fm = m[1];
    const body = m[2].trim();
    const applyTo = fm.match(/applyTo:\s*"?([^"\n]*)"?\s*$/m)?.[1] ?? '**/*';
    const exclude = fm.match(/excludeAgent:\s*"?([^"\n]*)"?\s*$/m)?.[1];
    const name = fileName.replace(/\.instructions\.md$/, '');
    return { name, applyTo, content: body, excludeAgent: exclude };
  }

  private toPathInstructionFile(inst: CopilotPathInstruction): string {
    let fm = `applyTo: "${inst.applyTo}"`;
    if (inst.excludeAgent) fm += `\nexcludeAgent: "${inst.excludeAgent}"`;
    return `---\n${fm}\n---\n\n${inst.content}\n`;
  }

  async listAgents(): Promise<AgentListItem[]> {
    const agents: AgentListItem[] = [];
    try {
      const content = await fs.readFile(this.instructionsFile, 'utf-8');
      agents.push({ id: this.repoWideId, name: 'Repository-wide', summary: `${content.length} chars` });
    } catch {
      /* no repo-wide yet */
    }
    try {
      const files = await fs.readdir(this.pathInstructionsDir);
      for (const f of files.filter((x) => x.endsWith('.instructions.md'))) {
        const content = await fs.readFile(path.join(this.pathInstructionsDir, f), 'utf-8');
        const parsed = this.parsePathInstruction(f, content);
        if (parsed) agents.push({ id: parsed.name, name: parsed.name, summary: `applyTo=${parsed.applyTo}` });
      }
    } catch {
      /* no path instructions dir */
    }
    if (agents.length === 0) {
      agents.push({ id: this.repoWideId, name: 'Repository-wide', summary: 'no instructions yet' });
    }
    return agents;
  }

  async getAgentRaw(id: string): Promise<AgentSettings> {
    if (id === this.repoWideId) {
      try {
        const content = await fs.readFile(this.instructionsFile, 'utf-8');
        return { applyTo: '**/*', content };
      } catch {
        return { applyTo: '**/*', content: '' };
      }
    }
    try {
      const content = await fs.readFile(path.join(this.pathInstructionsDir, `${id}.instructions.md`), 'utf-8');
      const parsed = this.parsePathInstruction(`${id}.instructions.md`, content);
      if (!parsed) throw new Error(`Agent '${id}' not found`);
      return parsed as unknown as AgentSettings;
    } catch {
      throw new Error(`Agent '${id}' not found`);
    }
  }

  async setAgentKey(id: string, key: string, value: string): Promise<void> {
    const current = (await this.getAgentRaw(id)) as Record<string, unknown>;
    setByPath(current, key, parseValue(value));
    await this.writeAgent(id, current as unknown as { applyTo: string; content: string });
  }

  async unsetAgentKey(id: string, key: string): Promise<void> {
    const current = (await this.getAgentRaw(id)) as Record<string, unknown>;
    deleteByPath(current, key);
    await this.writeAgent(id, current as unknown as { applyTo: string; content: string });
  }

  private async writeAgent(id: string, data: { applyTo: string; content: string }): Promise<void> {
    if (id === this.repoWideId) {
      await fs.mkdir(path.dirname(this.instructionsFile), { recursive: true });
      await backupFile(this.instructionsFile);
      await fs.writeFile(this.instructionsFile, data.content || '');
    } else {
      await fs.mkdir(this.pathInstructionsDir, { recursive: true });
      const fp = path.join(this.pathInstructionsDir, `${id}.instructions.md`);
      await backupFile(fp);
      await fs.writeFile(fp, this.toPathInstructionFile({ name: id, applyTo: data.applyTo, content: data.content }));
    }
  }

  async addAgent(id: string, defaults?: AgentSettings): Promise<void> {
    if (id === this.repoWideId) throw new Error('Repository-wide agent already exists');
    const fp = path.join(this.pathInstructionsDir, `${id}.instructions.md`);
    try {
      await fs.access(fp);
      throw new Error(`Agent '${id}' already exists`);
    } catch {
      /* ok, does not exist */
    }
    await this.writeAgent(id, {
      applyTo: (defaults?.applyTo as string) ?? '**/*',
      content: (defaults?.content as string) ?? '',
    });
  }

  async removeAgent(id: string): Promise<void> {
    if (id === this.repoWideId) throw new Error('Cannot remove repository-wide instructions');
    const fp = path.join(this.pathInstructionsDir, `${id}.instructions.md`);
    try {
      await backupFile(fp);
      await fs.unlink(fp);
    } catch {
      throw new Error(`Agent '${id}' not found`);
    }
  }

  async save(): Promise<void> {
    // Each mutation writes its own file; nothing to flush here.
  }
}
