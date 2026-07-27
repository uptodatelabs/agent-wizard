import * as fs from 'fs/promises';
import * as path from 'path';
import { AgentEditorPort, AgentListItem, AgentSettings, setByPath, deleteByPath, parseValue } from '../agent-editor';
import { backupFile } from '../backup';

interface CursorRule {
  description: string;
  globs: string | string[];
  alwaysApply: boolean;
  content: string;
}

/**
 * Cursor agent editing.
 *
 * In Cursor, "agents" are `.mdc` rule files under `.cursor/rules/`. Each rule
 * file is surfaced as one editable agent whose raw settings are the parsed
 * frontmatter + body. We manage these as individual files (non-destructive:
 * only the managed files are rewritten, other .mdc files are left untouched).
 */
export class CursorAgentEditor implements AgentEditorPort {
  readonly tool = 'cursor';
  private rulesDir: string;

  constructor(baseDir?: string) {
    this.rulesDir = path.join(baseDir ?? process.cwd(), '.cursor', 'rules');
  }

  private parseMdc(content: string): CursorRule | null {
    const m = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
    if (!m) return null;
    const fm = m[1];
    const body = m[2].trim();
    const desc = fm.match(/description:\s*"?([^"\n]*)"?\s*$/m)?.[1] ?? '';
    const globs = fm.match(/globs:\s*(.*?)\s*$/m)?.[1] ?? '**/*';
    const always = fm.match(/alwaysApply:\s*(true|false)/m)?.[1] === 'true';
    return { description: desc, globs, alwaysApply: always, content: body };
  }

  private toMdc(rule: CursorRule): string {
    const globsStr = Array.isArray(rule.globs) ? rule.globs.join(', ') : rule.globs;
    return `---\ndescription: "${rule.description}"\nglobs: ${globsStr}\nalwaysApply: ${rule.alwaysApply}\n---\n\n${rule.content}\n`;
  }

  private ruleFileName(id: string): string {
    return id.endsWith('.mdc') ? id : `${id}.mdc`;
  }

  private async readRule(id: string): Promise<CursorRule | null> {
    try {
      const content = await fs.readFile(path.join(this.rulesDir, this.ruleFileName(id)), 'utf-8');
      return this.parseMdc(content);
    } catch {
      return null;
    }
  }

  private async writeRule(id: string, rule: CursorRule): Promise<void> {
    await fs.mkdir(this.rulesDir, { recursive: true });
    const fp = path.join(this.rulesDir, this.ruleFileName(id));
    await backupFile(fp);
    await fs.writeFile(fp, this.toMdc(rule));
  }

  async listAgents(): Promise<AgentListItem[]> {
    let files: string[] = [];
    try {
      files = await fs.readdir(this.rulesDir);
    } catch {
      return [];
    }
    const mdc = files.filter((f) => f.endsWith('.mdc'));
    if (mdc.length === 0) return [{ id: 'cursor-agent', name: 'Cursor Agent', summary: 'no rules yet' }];
    return mdc.map((f) => ({
      id: f,
      name: f.replace(/\.mdc$/, ''),
      summary: 'cursor rule',
    }));
  }

  async getAgentRaw(id: string): Promise<AgentSettings> {
    const rule = await this.readRule(id);
    if (!rule) throw new Error(`Agent '${id}' not found`);
    return rule as unknown as AgentSettings;
  }

  async setAgentKey(id: string, key: string, value: string): Promise<void> {
    const rule = await this.readRule(id);
    if (!rule) throw new Error(`Agent '${id}' not found`);
    const target = rule as unknown as Record<string, unknown>;
    setByPath(target, key, parseValue(value));
    await this.writeRule(id, rule);
  }

  async unsetAgentKey(id: string, key: string): Promise<void> {
    const rule = await this.readRule(id);
    if (!rule) throw new Error(`Agent '${id}' not found`);
    deleteByPath(rule as unknown as Record<string, unknown>, key);
    await this.writeRule(id, rule);
  }

  async addAgent(id: string, defaults?: AgentSettings): Promise<void> {
    if (await this.readRule(id)) throw new Error(`Agent '${id}' already exists`);
    const rule: CursorRule = {
      description: (defaults?.description as string) ?? id,
      globs: (defaults?.globs as string) ?? '**/*',
      alwaysApply: (defaults?.alwaysApply as boolean) ?? false,
      content: (defaults?.content as string) ?? '',
    };
    await this.writeRule(id, rule);
  }

  async removeAgent(id: string): Promise<void> {
    const fp = path.join(this.rulesDir, this.ruleFileName(id));
    try {
      await backupFile(fp);
      await fs.unlink(fp);
    } catch {
      throw new Error(`Agent '${id}' not found`);
    }
  }

  async save(): Promise<void> {
    // Cursor rules are saved per-file on each mutation; nothing to flush here.
  }
}
