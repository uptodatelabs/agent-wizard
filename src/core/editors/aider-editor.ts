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
 *
 * The agent id is ignored (any id accepted) because there is only one config
 * file — this keeps the CLI and dashboard interchangeable.
 */
export class AiderAgentEditor implements AgentEditorPort {
  readonly tool = 'aider';
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
        id: 'default',
        name: 'Aider',
        summary: cfg.model ? `model=${cfg.model}` : 'no model set',
      },
    ];
  }

  async getAgentRaw(_id: string): Promise<AgentSettings> {
    const cfg = await this.load();
    return cfg as unknown as AgentSettings;
  }

  async setAgentKey(_id: string, key: string, value: string): Promise<void> {
    const cfg = await this.load();
    setByPath(cfg as unknown as Record<string, unknown>, key, parseValue(value));
    await this.save();
  }

  async unsetAgentKey(_id: string, key: string): Promise<void> {
    const cfg = await this.load();
    deleteByPath(cfg as unknown as Record<string, unknown>, key);
    await this.save();
  }

  async addAgent(_id: string, _defaults?: AgentSettings): Promise<void> {
    throw new Error('Aider has a single config file; use set to edit keys');
  }

  async removeAgent(_id: string): Promise<void> {
    throw new Error('Cannot remove agent (Aider has a single config file)');
  }

  async save(): Promise<void> {
    await fs.mkdir(path.dirname(this.configPath), { recursive: true });
    await backupFile(this.configPath);
    await fs.writeFile(this.configPath, yaml.stringify(this.config));
  }
}
