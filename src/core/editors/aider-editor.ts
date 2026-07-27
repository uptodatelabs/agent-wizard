import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import * as yaml from 'yaml';
import { AgentEditorPort, AgentListItem, AgentSettings, setByPath, deleteByPath, parseValue } from '../agent-editor';
import { backupFile } from '../backup';
import { AiderConfig } from '../../adapters/aider';

/**
 * Aider agent editing.
 *
 * Aider uses a single `.aider.conf.yml` config (model, edit-format, git options,
 * ...). We surface it as one editable agent whose raw settings are the entire
 * config object. Editing a key (e.g. `model`, `architect`) maps directly onto
 * the real file. Home-directory config is used as the canonical location.
 */
export class AiderAgentEditor implements AgentEditorPort {
  readonly tool = 'aider';
  private readonly agentId = 'aider';
  private configPath = path.join(os.homedir(), '.aider.conf.yml');
  private config: AiderConfig = {};

  private async load(): Promise<AiderConfig> {
    try {
      const content = await fs.readFile(this.configPath, 'utf-8');
      this.config = (yaml.parse(content) as AiderConfig) || {};
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
        name: 'Aider',
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
    throw new Error('Aider has a single config file; use set to edit keys');
  }

  async removeAgent(id: string): Promise<void> {
    throw new Error(`Cannot remove agent '${id}' (Aider has a single config file)`);
  }

  async save(): Promise<void> {
    await fs.mkdir(path.dirname(this.configPath), { recursive: true });
    await backupFile(this.configPath);
    await fs.writeFile(this.configPath, yaml.stringify(this.config));
  }
}
