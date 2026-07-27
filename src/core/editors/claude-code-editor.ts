import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { AgentEditorPort, AgentListItem, AgentSettings, setByPath, deleteByPath, parseValue } from '../agent-editor';
import { backupFile } from '../backup';
import { ClaudeCodeSettings } from '../../adapters/claude-code';

/**
 * Claude Code agent editing.
 *
 * Claude Code has no multi-agent concept in settings.json — it is a single
 * settings object (model, permissions, hooks, sandbox, ...). We surface it as
 * one editable agent whose raw settings are the entire settings object. Editing
 * a key (e.g. `model`, `permissions.allow`) maps directly onto the real file.
 */
export class ClaudeCodeAgentEditor implements AgentEditorPort {
  readonly tool = 'claude-code';
  private readonly agentId = 'user';
  private configPath = path.join(os.homedir(), '.claude', 'settings.json');
  private config: ClaudeCodeSettings = {};

  private async load(): Promise<ClaudeCodeSettings> {
    try {
      const content = await fs.readFile(this.configPath, 'utf-8');
      this.config = (JSON.parse(content) as ClaudeCodeSettings) || {};
    } catch {
      this.config = {};
    }
    return this.config;
  }

  async listAgents(): Promise<AgentListItem[]> {
    const cfg = await this.load();
    return [
      {
        id: this.agentId,
        name: 'Claude Code (user scope)',
        summary: cfg.model ? `model=${cfg.model}` : 'no model set',
      },
    ];
  }

  async getAgentRaw(id: string): Promise<AgentSettings> {
    const cfg = await this.load();
    if (id !== this.agentId) throw new Error(`Agent '${id}' not found`);
    return cfg as unknown as AgentSettings;
  }

  async setAgentKey(id: string, key: string, value: string): Promise<void> {
    if (id !== this.agentId) throw new Error(`Agent '${id}' not found`);
    const cfg = await this.load();
    setByPath(cfg as unknown as Record<string, unknown>, key, parseValue(value));
    await this.save();
  }

  async unsetAgentKey(id: string, key: string): Promise<void> {
    if (id !== this.agentId) throw new Error(`Agent '${id}' not found`);
    const cfg = await this.load();
    deleteByPath(cfg as unknown as Record<string, unknown>, key);
    await this.save();
  }

  async addAgent(_id: string, _defaults?: AgentSettings): Promise<void> {
    throw new Error('Claude Code has a single settings scope; use set to edit keys');
  }

  async removeAgent(id: string): Promise<void> {
    throw new Error(`Cannot remove agent '${id}' (Claude Code has a single settings scope)`);
  }

  async save(): Promise<void> {
    await fs.mkdir(path.dirname(this.configPath), { recursive: true });
    await backupFile(this.configPath);
    await fs.writeFile(this.configPath, JSON.stringify(this.config, null, 2));
  }
}
