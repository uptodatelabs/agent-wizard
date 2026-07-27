import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import JSON5 from 'json5';
import { backupFile } from './backup';
import inquirer from 'inquirer';
import chalk from 'chalk';

export interface OpenClawAgentEntry {
  id: string;
  name?: string;
  identity?: { name?: string; emoji?: string; theme?: string };
  model?: string;
  workspace?: string;
  agentDir?: string;
  tools?: Record<string, unknown> | string[];
  [key: string]: unknown;
}

export interface OpenClawConfigShape {
  agents: {
    defaults: Record<string, unknown>;
    entries?: Record<string, OpenClawAgentEntry>;
    list?: OpenClawAgentEntry[];
  };
  [key: string]: unknown;
}

/**
 * Interactive (and programmatic) editor for OpenClaw agent configurations.
 *
 * Works directly on the real OpenClaw config file (`~/.openclaw/openclaw.json`),
 * preserving the existing shape (`agents.list` array OR `agents.entries` record)
 * and every other top-level key (channels, models, mcp, tools, ...).
 *
 * This is the dedicated path the user asked for: list / show / add / remove /
 * edit agents, with free-form custom key add & delete per agent.
 */
import { AgentEditorPort, AgentListItem, AgentSettings } from './agent-editor';

export class OpenClawWizard implements AgentEditorPort {
  readonly tool = 'openclaw';
  private configPath = path.join(os.homedir(), '.openclaw', 'openclaw.json');

  setConfigPath(p: string): void {
    this.configPath = p;
  }

  getConfigPath(): string {
    return this.configPath;
  }

  async exists(): Promise<boolean> {
    try {
      await fs.access(this.configPath);
      return true;
    } catch {
      return false;
    }
  }

  /** Read raw config, or return a minimal skeleton if absent. */
  async loadConfig(): Promise<OpenClawConfigShape> {
    try {
      const content = await fs.readFile(this.configPath, 'utf-8');
      const parsed = JSON5.parse(content) as OpenClawConfigShape;
      if (!parsed.agents) parsed.agents = { defaults: {} } as any;
      if (!parsed.agents.defaults) parsed.agents.defaults = {};
      return parsed;
    } catch {
      return { agents: { defaults: { workspace: '~/.openclaw/workspace' } } } as OpenClawConfigShape;
    }
  }

  /** Return agents as a normalized array regardless of underlying shape. */
  getAgents(config: OpenClawConfigShape): OpenClawAgentEntry[] {
    if (Array.isArray(config.agents.list)) {
      return config.agents.list.map((a) => ({ ...a }));
    }
    if (config.agents.entries) {
      return Object.entries(config.agents.entries).map(([id, entry]) => {
        const { id: _ignore, ...rest } = entry as OpenClawAgentEntry;
        return { id, ...rest };
      });
    }
    return [];
  }

  private isListShape(config: OpenClawConfigShape): boolean {
    return Array.isArray(config.agents.list);
  }

  /** Write agents back, preserving the original shape and all other keys. */
  private writeAgents(config: OpenClawConfigShape, agents: OpenClawAgentEntry[]): void {
    if (this.isListShape(config)) {
      config.agents.list = agents;
    } else {
      const entries: Record<string, OpenClawAgentEntry> = {};
      for (const a of agents) {
        const { id, ...rest } = a;
        entries[id] = rest as OpenClawAgentEntry;
      }
      config.agents.entries = entries;
    }
  }

  async saveConfig(config: OpenClawConfigShape): Promise<void> {
    await fs.mkdir(path.dirname(this.configPath), { recursive: true });
    await backupFile(this.configPath);
    await fs.writeFile(this.configPath, JSON5.stringify(config, null, 2));
  }

  // ---- Programmatic operations (also used by the interactive menu) ----

  addAgentInConfig(config: OpenClawConfigShape, id: string): OpenClawAgentEntry {
    const agents = this.getAgents(config);
    if (agents.some((a) => a.id === id)) {
      throw new Error(`Agent '${id}' already exists`);
    }
    const agent: OpenClawAgentEntry = { id, name: id };
    agents.push(agent);
    this.writeAgents(config, agents);
    return agent;
  }

  removeAgentInConfig(config: OpenClawConfigShape, id: string): void {
    const agents = this.getAgents(config);
    const next = agents.filter((a) => a.id !== id);
    if (next.length === agents.length) {
      throw new Error(`Agent '${id}' not found`);
    }
    this.writeAgents(config, next);
  }

  getAgent(config: OpenClawConfigShape, id: string): OpenClawAgentEntry | undefined {
    return this.getAgents(config).find((a) => a.id === id);
  }

  /** Return the actual agent object inside `config` (mutation target), not a copy. */
  private getRawAgent(config: OpenClawConfigShape, id: string): OpenClawAgentEntry | undefined {
    if (Array.isArray(config.agents.list)) {
      return config.agents.list.find((a) => a.id === id);
    }
    if (config.agents.entries && config.agents.entries[id]) {
      return config.agents.entries[id];
    }
    return undefined;
  }

  /** Set a (nested, dot-notation) key on an agent. Value parsed as JSON when possible. */
  setAgentKeyInConfig(config: OpenClawConfigShape, id: string, key: string, value: string): void {
    const agent = this.requireRawAgent(config, id);
    const parsed = this.parseValue(value);
    this.setNested(agent, key, parsed);
  }

  /** Remove a (nested, dot-notation) key from an agent. */
  unsetAgentKeyInConfig(config: OpenClawConfigShape, id: string, key: string): void {
    const agent = this.requireRawAgent(config, id);
    this.unsetNested(agent, key);
  }

  // ---- AgentEditorPort implementation (load + persist) ----

  async listAgents(): Promise<AgentListItem[]> {
    const config = await this.loadConfig();
    return this.getAgents(config).map((a) => ({
      id: a.id,
      name: a.name,
      summary: [a.model && `model=${a.model}`, a.workspace && `workspace=${a.workspace}`]
        .filter(Boolean)
        .join(', '),
    }));
  }

  async getAgentRaw(id: string): Promise<AgentSettings> {
    const config = await this.loadConfig();
    const agent = this.getAgent(config, id);
    if (!agent) throw new Error(`Agent '${id}' not found`);
    return { ...agent } as AgentSettings;
  }

  async setAgentKey(id: string, key: string, value: string): Promise<void> {
    const config = await this.loadConfig();
    this.setAgentKeyInConfig(config, id, key, value);
    await this.saveConfig(config);
  }

  async unsetAgentKey(id: string, key: string): Promise<void> {
    const config = await this.loadConfig();
    this.unsetAgentKeyInConfig(config, id, key);
    await this.saveConfig(config);
  }

  async addAgent(id: string, defaults?: AgentSettings): Promise<void> {
    const config = await this.loadConfig();
    const agent = this.addAgentInConfig(config, id);
    if (defaults) {
      for (const [k, v] of Object.entries(defaults)) {
        this.setNested(agent, k, v);
      }
    }
    await this.saveConfig(config);
  }

  async removeAgent(id: string): Promise<void> {
    const config = await this.loadConfig();
    this.removeAgentInConfig(config, id);
    await this.saveConfig(config);
  }

  async save(): Promise<void> {
    // All mutating methods already persist; this is a no-op for OpenClaw but
    // part of the common port contract (some adapters batch changes).
  }

  private requireAgent(config: OpenClawConfigShape, id: string): OpenClawAgentEntry {
    const agent = this.getAgent(config, id);
    if (!agent) throw new Error(`Agent '${id}' not found`);
    return agent;
  }

  private requireRawAgent(config: OpenClawConfigShape, id: string): OpenClawAgentEntry {
    const agent = this.getRawAgent(config, id);
    if (!agent) throw new Error(`Agent '${id}' not found`);
    return agent;
  }

  private parseValue(value: string): unknown {
    try {
      return JSON.parse(value);
    } catch {
      return value;
    }
  }

  private setNested(obj: Record<string, unknown>, key: string, value: unknown): void {
    const keys = key.split('.');
    let cur: any = obj;
    for (let i = 0; i < keys.length - 1; i++) {
      if (typeof cur[keys[i]] !== 'object' || cur[keys[i]] === null) {
        cur[keys[i]] = {};
      }
      cur = cur[keys[i]];
    }
    cur[keys[keys.length - 1]] = value;
  }

  private unsetNested(obj: Record<string, unknown>, key: string): void {
    const keys = key.split('.');
    let cur: any = obj;
    for (let i = 0; i < keys.length - 1; i++) {
      if (typeof cur[keys[i]] !== 'object' || cur[keys[i]] === null) return;
      cur = cur[keys[i]];
    }
    delete cur[keys[keys.length - 1]];
  }

  private describeAgent(a: OpenClawAgentEntry): string {
    const parts: string[] = [];
    if (a.name) parts.push(`name=${a.name}`);
    if (a.model) parts.push(`model=${a.model}`);
    if (a.workspace) parts.push(`workspace=${a.workspace}`);
    return parts.length ? `(${parts.join(', ')})` : '';
  }

  /** Interactive wizard: list / add / remove / edit agents (TTY required). */
  async configure(): Promise<void> {
    const config = await this.loadConfig();

    while (true) {
      const agents = this.getAgents(config);
      console.log(chalk.bold.cyan('\n🧙 OpenClaw Agent Configuration'));
      console.log(chalk.gray(`Config: ${this.configPath}`));
      if (agents.length === 0) {
        console.log(chalk.yellow('  (no agents configured)'));
      } else {
        agents.forEach((a, i) => {
          console.log(`  ${i + 1}. ${chalk.green(a.id)} ${this.describeAgent(a)}`);
        });
      }

      const { action } = await inquirer.prompt([
        {
          type: 'list',
          name: 'action',
          message: 'What would you like to do?',
          choices: [
            ...agents.map((a) => ({ name: `Edit agent '${a.id}'`, value: `edit:${a.id}` })),
            { name: '+ Add new agent', value: 'add' },
            ...agents.map((a) => ({ name: `🗑 Remove agent '${a.id}'`, value: `remove:${a.id}` })),
            { name: '💾 Save & exit', value: 'save' },
            { name: '✖ Cancel (discard)', value: 'cancel' },
          ],
        },
      ]);

      if (action === 'save') {
        await this.saveConfig(config);
        console.log(chalk.green('\n✅ Saved.\n'));
        return;
      }
      if (action === 'cancel') {
        console.log(chalk.gray('\nCancelled. No changes saved.\n'));
        return;
      }

      if (action === 'add') {
        const { id } = await inquirer.prompt([
          { type: 'input', name: 'id', message: 'New agent id:', validate: (v: string) => (v.trim() ? true : 'id is required') },
        ]);
        try {
          const agent = this.addAgentInConfig(config, id.trim());
          const { name } = await inquirer.prompt([{ type: 'input', name: 'name', message: 'Display name:', default: id.trim() }]);
          const { model } = await inquirer.prompt([{ type: 'input', name: 'model', message: 'Model (optional):' }]);
          const { workspace } = await inquirer.prompt([{ type: 'input', name: 'workspace', message: 'Workspace path (optional):' }]);
          agent.name = name || id.trim();
          if (model) agent.model = model;
          if (workspace) agent.workspace = workspace;
          console.log(chalk.green(`Added agent '${id.trim()}'.`));
        } catch (e) {
          console.error(chalk.red((e as Error).message));
        }
        continue;
      }

      if (action.startsWith('remove:')) {
        const id = action.slice('remove:'.length);
        const { confirm } = await inquirer.prompt([
          { type: 'confirm', name: 'confirm', message: `Remove agent '${id}'?`, default: false },
        ]);
        if (confirm) {
          this.removeAgentInConfig(config, id);
          console.log(chalk.green(`Removed '${id}'.`));
        }
        continue;
      }

      if (action.startsWith('edit:')) {
        const id = action.slice('edit:'.length);
        await this.editAgent(config, id);
      }
    }
  }

  private async editAgent(config: OpenClawConfigShape, id: string): Promise<void> {
    const agent = this.getAgent(config, id);
    if (!agent) {
      console.error(chalk.red(`Agent '${id}' not found.`));
      return;
    }

    while (true) {
      const agents = this.getAgents(config);
      const current = agents.find((a) => a.id === id)!;
      console.log(chalk.bold(`\n✏️  Editing agent '${chalk.green(id)}' ${this.describeAgent(current)}`));

      const customKeys = Object.keys(current).filter((k) => k !== 'id');
      const { action } = await inquirer.prompt([
        {
          type: 'list',
          name: 'action',
          message: `Edit '${id}':`,
          choices: [
            { name: `Set name (=${current.name || ''})`, value: 'set:name' },
            { name: `Set identity.name (=${current.identity?.name || ''})`, value: 'set:identity.name' },
            { name: `Set identity.emoji (=${current.identity?.emoji || ''})`, value: 'set:identity.emoji' },
            { name: `Set identity.theme (=${current.identity?.theme || ''})`, value: 'set:identity.theme' },
            { name: `Set model (=${current.model || ''})`, value: 'set:model' },
            { name: `Set workspace (=${current.workspace || ''})`, value: 'set:workspace' },
            { name: '+ Add / set custom key (dot-notation)', value: 'custom-set' },
            { name: '🗑 Unset (delete) a key', value: 'custom-unset' },
            { name: '↩ Back to agent list', value: 'back' },
          ],
        },
      ]);

      if (action === 'back') return;

      if (action === 'custom-set') {
        const { key } = await inquirer.prompt([{ type: 'input', name: 'key', message: 'Key (dot-notation, e.g. tools.profile):', validate: (v: string) => (v.trim() ? true : 'key required') }]);
        const { value } = await inquirer.prompt([{ type: 'input', name: 'value', message: 'Value (JSON parsed when possible):' }]);
        this.setAgentKeyInConfig(config, id, key.trim(), value);
        console.log(chalk.green(`Set ${key.trim()}.`));
        continue;
      }

      if (action === 'custom-unset') {
        const choices = customKeys.length ? customKeys : ['<none>'];
        const { key } = await inquirer.prompt([
          { type: 'list', name: 'key', message: 'Key to delete:', choices },
        ]);
        if (key && key !== '<none>') {
          this.unsetAgentKeyInConfig(config, id, key);
          console.log(chalk.green(`Deleted '${key}'.`));
        }
        continue;
      }

      const field = action.replace('set:', '');
      const currentVal = this.readDot(current, field);
      const { value } = await inquirer.prompt([
        { type: 'input', name: 'value', message: `New value for '${field}':`, default: currentVal === undefined ? '' : String(currentVal) },
      ]);
      if (value === '') {
        this.unsetAgentKeyInConfig(config, id, field);
        console.log(chalk.gray(`Cleared '${field}'.`));
      } else {
        this.setAgentKeyInConfig(config, id, field, value);
        console.log(chalk.green(`Set '${field}'.`));
      }
    }
  }

  private readDot(obj: Record<string, unknown>, key: string): unknown {
    return key.split('.').reduce<any>((cur, k) => (cur == null ? undefined : cur[k]), obj);
  }
}
