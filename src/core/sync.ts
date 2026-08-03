import * as fs from 'fs/promises';
import * as path from 'path';
import JSON5 from 'json5';
import { backupFile } from './backup';
import { Profile, AgentProfile } from './profile';
import { OpenClawAdapter, OpenClawConfig } from '../adapters/openclaw';
import { HermesAdapter, HermesConfig } from '../adapters/hermes';
import { ClaudeCodeAdapter, ClaudeCodeSettings } from '../adapters/claude-code';
import { CursorAdapter } from '../adapters/cursor';
import { CopilotAdapter } from '../adapters/copilot';
import { AiderAdapter, AiderConfig } from '../adapters/aider';
import { SUPPORTED_TOOLS } from './tools';

export interface SyncOptions {
  /** When true, compute the merged configuration and report what *would* be
   *  written without touching the filesystem. No backup, no write. */
  dryRun?: boolean;
}

export interface SyncFailure {
  tool: string;
  reason: string;
}

export interface SyncPreviewEntry {
  tool: string;
  path: string;
  /** create = file does not exist yet, modify = existing file would change,
   *  unchanged = merged output equals current content (nothing to write). */
  action: 'create' | 'modify' | 'unchanged';
}

export interface SyncResult {
  success: string[];
  failed: SyncFailure[];
  /** Populated when `dryRun` is true. */
  preview: SyncPreviewEntry[];
}

interface WritePlan {
  tool: string;
  path: string;
  existing: unknown;
  merged: unknown;
  options: SyncOptions;
  /** Serialize the merged object to the file's text format. */
  serialize: (value: unknown) => string;
}

export class ProfileSync {
  private openclawAdapter = new OpenClawAdapter();
  private hermesAdapter = new HermesAdapter();
  private claudeCodeAdapter = new ClaudeCodeAdapter();
  private cursorAdapter = new CursorAdapter();
  private copilotAdapter = new CopilotAdapter();
  private aiderAdapter = new AiderAdapter();

  async syncProfileToTools(profile: Profile, options: SyncOptions = {}): Promise<SyncResult> {
    const success: string[] = [];
    const failed: SyncFailure[] = [];
    const preview: SyncPreviewEntry[] = [];

    for (const agent of profile.agents) {
      if (!agent.enabled) continue;

      if (!SUPPORTED_TOOLS.includes(agent.tool as (typeof SUPPORTED_TOOLS)[number])) {
        failed.push({ tool: agent.tool, reason: `Unsupported tool '${agent.tool}'` });
        continue;
      }

      try {
        const entry = await this.syncAgentToTool(agent, profile, options);
        if (entry) {
          preview.push(entry);
          if (!options.dryRun && entry.action !== 'unchanged') {
            success.push(agent.tool);
          }
        }
      } catch (error) {
        failed.push({
          tool: agent.tool,
          reason: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }

    return { success, failed, preview };
  }

  private async syncAgentToTool(agent: AgentProfile, profile: Profile, options: SyncOptions): Promise<SyncPreviewEntry> {
    switch (agent.tool) {
      case 'openclaw':
        return this.syncToOpenClaw(agent, profile, options);
      case 'hermes':
        return this.syncToHermes(agent, profile, options);
      case 'claude-code':
        return this.syncToClaudeCode(agent, profile, options);
      case 'cursor':
        return this.syncToCursor(agent, profile, options);
      case 'copilot':
        return this.syncToCopilot(agent, profile, options);
      case 'aider':
        return this.syncToAider(agent, profile, options);
      default:
        throw new Error(`Unsupported tool '${agent.tool}'`);
    }
  }

  /** Core apply step: decide create/modify/unchanged, then (unless dry-run)
   *  back up the existing file and write the merged config. */
  private async applyWrite(plan: WritePlan): Promise<SyncPreviewEntry> {
    const exists = await this.fileExists(plan.path);
    const unchanged = exists && this.deepEqual(plan.existing, plan.merged);
    const action: SyncPreviewEntry['action'] = !exists ? 'create' : unchanged ? 'unchanged' : 'modify';

    if (plan.options.dryRun || action === 'unchanged') {
      return { tool: plan.tool, path: plan.path, action };
    }

    await fs.mkdir(path.dirname(plan.path), { recursive: true });
    await backupFile(plan.path);
    await fs.writeFile(plan.path, plan.serialize(plan.merged));

    return { tool: plan.tool, path: plan.path, action };
  }

  private async syncToOpenClaw(agent: AgentProfile, profile: Profile, options: SyncOptions): Promise<SyncPreviewEntry> {
    const os = await import('os');
    const configPath = path.join(os.homedir(), '.openclaw', 'openclaw.json');
    const existing = await this.readJson5<Partial<OpenClawConfig>>(configPath);

    // Preserve the existing agents shape (entries Record OR list array)
    const useList = Array.isArray(existing.agents?.list);
    const entries = { ...(existing.agents?.entries || {}) };
    const list: any[] = useList
      ? existing.agents!.list!.map((item: any) => ({ ...item }))
      : [];

    if (useList) {
      const idx = list.findIndex((l: any) => l.id === agent.id);
      const def = { ...(idx >= 0 ? list[idx] : {}), id: agent.id, name: agent.name,
        identity: { ...(idx >= 0 ? list[idx]?.identity : {}), name: agent.name } };
      if (idx >= 0) list[idx] = def; else list.push(def);
    } else {
      entries[agent.id] = {
        ...entries[agent.id],
        identity: { ...entries[agent.id]?.identity, name: agent.name },
      };
    }

    const agentsShape: any = {
      defaults: {
        ...existing.agents?.defaults,
        workspace: existing.agents?.defaults?.workspace || agent.settings.workspace || '~/.openclaw/workspace',
        model: {
          // Spread existing first so extra keys (e.g. fallbacks) are kept,
          // then set primary so an updated model actually takes effect.
          ...existing.agents?.defaults?.model,
          primary: agent.settings.model || existing.agents?.defaults?.model?.primary || 'anthropic/claude-sonnet-4-6',
        },
      },
    };
    if (useList) agentsShape.list = list; else agentsShape.entries = entries;

    const merged: OpenClawConfig = {
      ...existing,
      agents: agentsShape,
      channels: existing.channels,
      models: existing.models,
      tools: {
        allow: profile.permissions.allow.length > 0 ? profile.permissions.allow : (existing.tools?.allow || []),
        deny: profile.permissions.deny.length > 0 ? profile.permissions.deny : (existing.tools?.deny || []),
      },
      mcp: existing.mcp,
    };

    return this.applyWrite({
      tool: 'openclaw',
      path: configPath,
      existing,
      merged,
      options,
      serialize: (v) => JSON.stringify(v, null, 2),
    });
  }

  private async syncToHermes(agent: AgentProfile, _profile: Profile, options: SyncOptions): Promise<SyncPreviewEntry> {
    const yaml = await import('yaml');
    const os = await import('os');
    const configPath = path.join(os.homedir(), '.hermes', 'config.yaml');
    const existing = await this.readYaml<Partial<HermesConfig>>(configPath);

    const personalities = { ...(existing.agent?.personalities || {}) };
    if (agent.settings.instructions !== undefined) {
      personalities[agent.name] = agent.settings.instructions;
    } else if (!personalities[agent.name]) {
      personalities[agent.name] = '';
    }

    const merged: HermesConfig = {
      ...existing,
      model: {
        ...existing.model,
        default: agent.settings.model || existing.model?.default || 'anthropic/claude-opus-4.6',
        provider: existing.model?.provider || 'auto',
      },
      terminal: existing.terminal || {
        backend: agent.settings.terminal?.backend || 'local',
        cwd: '.',
        timeout: agent.settings.terminal?.timeout || 180,
      },
      compression: existing.compression || { enabled: true, threshold: 0.50 },
      memory: existing.memory || { memory_enabled: true, user_profile_enabled: true },
      skills: existing.skills,
      agent: {
        ...existing.agent,
        max_turns: existing.agent?.max_turns || 60,
        verbose: existing.agent?.verbose || false,
        reasoning_effort: agent.settings.reasoning_effort || existing.agent?.reasoning_effort || 'medium',
        personalities,
      },
    };

    return this.applyWrite({
      tool: 'hermes',
      path: configPath,
      existing,
      merged,
      options,
      serialize: (v) => yaml.stringify(v),
    });
  }

  private async syncToClaudeCode(agent: AgentProfile, profile: Profile, options: SyncOptions): Promise<SyncPreviewEntry> {
    const os = await import('os');
    const configPath = path.join(os.homedir(), '.claude', 'settings.json');
    const existing = await this.readJson<Partial<ClaudeCodeSettings>>(configPath);

    const permissions = profile.permissions.allow.length > 0 || profile.permissions.deny.length > 0
      ? { allow: profile.permissions.allow, deny: profile.permissions.deny }
      : existing.permissions;

    const merged: ClaudeCodeSettings = {
      ...existing,
      $schema: existing.$schema || 'https://json.schemastore.org/claude-code-settings.json',
      model: agent.settings.model || existing.model,
      permissions,
      env: existing.env,
      hooks: existing.hooks,
      sandbox: existing.sandbox,
      attribution: existing.attribution,
      autoMemoryEnabled: existing.autoMemoryEnabled,
      companyAnnouncements: existing.companyAnnouncements,
    };

    return this.applyWrite({
      tool: 'claude-code',
      path: configPath,
      existing,
      merged,
      options,
      serialize: (v) => JSON.stringify(v, null, 2),
    });
  }

  private async syncToCursor(agent: AgentProfile, _profile: Profile, options: SyncOptions): Promise<SyncPreviewEntry> {
    const rulesDir = path.join(process.cwd(), '.cursor', 'rules');
    const filePath = path.join(rulesDir, 'agent-wizard.mdc');

    // Create main rule file
    const content = `---
description: "${agent.name} rules"
globs: "**/*"
alwaysApply: false
---

# ${agent.name}

${agent.settings.instructions || 'AgentWizard generated rules'}
`;

    const exists = await this.fileExists(filePath);
    const unchanged = exists && (await this.readText(filePath)) === content;
    const action: SyncPreviewEntry['action'] = !exists ? 'create' : unchanged ? 'unchanged' : 'modify';

    if (options.dryRun || action === 'unchanged') {
      return { tool: 'cursor', path: filePath, action };
    }

    await fs.mkdir(rulesDir, { recursive: true });
    await backupFile(filePath);
    await fs.writeFile(filePath, content);

    return { tool: 'cursor', path: filePath, action };
  }

  private async syncToCopilot(agent: AgentProfile, _profile: Profile, options: SyncOptions): Promise<SyncPreviewEntry> {
    const instructionsDir = path.join(process.cwd(), '.github');
    const filePath = path.join(instructionsDir, 'copilot-instructions.md');

    // Create repository-wide instructions
    const content = `# ${agent.name}

${agent.settings.instructions || 'AgentWizard generated instructions'}
`;

    const exists = await this.fileExists(filePath);
    const unchanged = exists && (await this.readText(filePath)) === content;
    const action: SyncPreviewEntry['action'] = !exists ? 'create' : unchanged ? 'unchanged' : 'modify';

    if (options.dryRun || action === 'unchanged') {
      return { tool: 'copilot', path: filePath, action };
    }

    await fs.mkdir(instructionsDir, { recursive: true });
    await backupFile(filePath);
    await fs.writeFile(filePath, content);

    return { tool: 'copilot', path: filePath, action };
  }

  private async syncToAider(agent: AgentProfile, _profile: Profile, options: SyncOptions): Promise<SyncPreviewEntry> {
    const yaml = await import('yaml');
    const configPath = path.join(process.cwd(), '.aider.conf.yml');
    const existing = await this.readYaml<Partial<AiderConfig>>(configPath);

    const merged: AiderConfig = {
      ...existing,
      model: agent.settings.model || existing.model || 'sonnet',
      architect: agent.settings.architect || existing.architect || false,
    };
    if (merged['auto-commits'] === undefined) merged['auto-commits'] = true;
    if (merged['attribute-co-authored-by'] === undefined) merged['attribute-co-authored-by'] = true;
    if (merged.git === undefined) merged.git = true;
    if (merged.lint === undefined) merged.lint = true;
    if (merged['auto-lint'] === undefined) merged['auto-lint'] = true;

    return this.applyWrite({
      tool: 'aider',
      path: configPath,
      existing,
      merged,
      options,
      serialize: (v) => yaml.stringify(v),
    });
  }

  private async fileExists(filePath: string): Promise<boolean> {
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  private async readText(filePath: string): Promise<string> {
    try {
      return await fs.readFile(filePath, 'utf-8');
    } catch {
      return '';
    }
  }

  private deepEqual(a: unknown, b: unknown): boolean {
    return JSON.stringify(a) === JSON.stringify(b);
  }

  private async readJson5<T>(configPath: string): Promise<T> {
    try {
      const content = await fs.readFile(configPath, 'utf-8');
      return JSON5.parse(content) as T;
    } catch {
      return {} as T;
    }
  }

  private async readJson<T>(configPath: string): Promise<T> {
    try {
      const content = await fs.readFile(configPath, 'utf-8');
      return JSON.parse(content) as T;
    } catch {
      return {} as T;
    }
  }

  private async readYaml<T>(configPath: string): Promise<T> {
    const yaml = await import('yaml');
    try {
      const content = await fs.readFile(configPath, 'utf-8');
      return yaml.parse(content) as T;
    } catch {
      return {} as T;
    }
  }

  async syncToolsToProfile(): Promise<Profile> {
    const profile: Profile = {
      name: 'imported',
      description: 'Imported from existing tool configurations',
      created: new Date().toISOString(),
      updated: new Date().toISOString(),
      agents: [],
      permissions: { allow: [], deny: [] },
    };

    // Import from each tool
    const tools = [
      { adapter: this.openclawAdapter, tool: 'openclaw' },
      { adapter: this.hermesAdapter, tool: 'hermes' },
      { adapter: this.claudeCodeAdapter, tool: 'claude-code' },
      { adapter: this.cursorAdapter, tool: 'cursor' },
      { adapter: this.copilotAdapter, tool: 'copilot' },
      { adapter: this.aiderAdapter, tool: 'aider' },
    ];

    for (const { adapter, tool } of tools) {
      const detected = await adapter.detect();
      if (detected) {
        const agentConfig = await adapter.read();

        if (agentConfig.agents.length > 0) {
          for (const agent of agentConfig.agents) {
            // Avoid id collision when a single tool exposes multiple agents
            const agentId = profile.agents.some((a) => a.id === agent.id) ? `${tool}-${agent.id}` : agent.id;
            profile.agents.push({
              id: agentId,
              name: agent.name,
              tool,
              enabled: true,
              settings: {
                model: agent.model,
                instructions: agent.instructions,
              },
              custom: {},
            });
          }
        }

        // Merge permissions
        profile.permissions.allow.push(...agentConfig.permissions.allow);
        profile.permissions.deny.push(...agentConfig.permissions.deny);
      }
    }

    return profile;
  }
}
