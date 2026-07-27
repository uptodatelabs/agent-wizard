import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import * as yaml from 'yaml';
import { AgentEditorPort, AgentListItem, AgentSettings, getByPath, setByPath, deleteByPath, parseValue } from '../agent-editor';
import { backupFile } from '../backup';
import { HermesConfig } from '../../adapters/hermes';

/**
 * Hermes agent editing.
 *
 * In Hermes, "agents" are expressed as `agent.personalities` — a map of
 * name -> instructions string. Each personality is surfaced as one editable
 * agent whose raw settings are `{ instructions }`. This is non-destructive:
 * unknown top-level keys (model, terminal, memory, ...) are preserved on write.
 */
export class HermesAgentEditor implements AgentEditorPort {
  readonly tool = 'hermes';
  private configPath = path.join(os.homedir(), '.hermes', 'config.yaml');
  private config: HermesConfig = {};

  private async load(): Promise<HermesConfig> {
    try {
      const content = await fs.readFile(this.configPath, 'utf-8');
      this.config = (yaml.parse(content) as HermesConfig) || {};
    } catch {
      this.config = {};
    }
    return this.config;
  }

  async listAgents(): Promise<AgentListItem[]> {
    const cfg = await this.load();
    const personalities = cfg.agent?.personalities || {};
    const ids = Object.keys(personalities);
    if (ids.length === 0) {
      return [{ id: 'default', name: 'Hermes Agent', summary: 'no personalities configured' }];
    }
    return ids.map((id) => ({
      id,
      name: id,
      summary: `instructions ${String(personalities[id]).length} chars`,
    }));
  }

  async getAgentRaw(id: string): Promise<AgentSettings> {
    const cfg = await this.load();
    const personalities = cfg.agent?.personalities || {};
    if (!(id in personalities) && id !== 'default') {
      throw new Error(`Agent '${id}' not found`);
    }
    return { instructions: personalities[id] ?? '' };
  }

  async setAgentKey(id: string, key: string, value: string): Promise<void> {
    const cfg = await this.load();
    if (!cfg.agent) cfg.agent = {};
    if (!cfg.agent.personalities) cfg.agent.personalities = {};
    const raw = getByPath(cfg.agent.personalities, id) as Record<string, unknown> | undefined;
    const target: Record<string, unknown> = raw && typeof raw === 'object' ? raw : {};
    setByPath(target, key, parseValue(value));
    // Hermes personalities are stored as a string; if only `instructions` is set,
    // collapse back to the plain string form Hermes expects.
    cfg.agent.personalities[id] = Object.keys(target).length === 1 && 'instructions' in target
      ? (target.instructions as string)
      : (target as unknown as string);
    await this.save();
  }

  async unsetAgentKey(id: string, key: string): Promise<void> {
    const cfg = await this.load();
    const personalities = cfg.agent?.personalities || {};
    if (!(id in personalities)) throw new Error(`Agent '${id}' not found`);
    const raw = personalities[id];
    if (typeof raw === 'object' && raw !== null) {
      deleteByPath(raw as Record<string, unknown>, key);
    }
    await this.save();
  }

  async addAgent(id: string, defaults?: AgentSettings): Promise<void> {
    const cfg = await this.load();
    if (!cfg.agent) cfg.agent = {};
    if (!cfg.agent.personalities) cfg.agent.personalities = {};
    if (id in cfg.agent.personalities) throw new Error(`Agent '${id}' already exists`);
    cfg.agent.personalities[id] = (defaults?.instructions as string) ?? '';
    await this.save();
  }

  async removeAgent(id: string): Promise<void> {
    const cfg = await this.load();
    if (!cfg.agent?.personalities || !(id in cfg.agent.personalities)) {
      throw new Error(`Agent '${id}' not found`);
    }
    delete cfg.agent.personalities[id];
    await this.save();
  }

  async save(): Promise<void> {
    await fs.mkdir(path.dirname(this.configPath), { recursive: true });
    await backupFile(this.configPath);
    await fs.writeFile(this.configPath, yaml.stringify(this.config));
  }
}
