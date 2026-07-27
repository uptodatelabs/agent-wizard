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

export class ProfileSync {
  private openclawAdapter = new OpenClawAdapter();
  private hermesAdapter = new HermesAdapter();
  private claudeCodeAdapter = new ClaudeCodeAdapter();
  private cursorAdapter = new CursorAdapter();
  private copilotAdapter = new CopilotAdapter();
  private aiderAdapter = new AiderAdapter();

  async syncProfileToTools(profile: Profile): Promise<{ success: string[]; failed: string[] }> {
    const success: string[] = [];
    const failed: string[] = [];

    for (const agent of profile.agents) {
      if (!agent.enabled) continue;

      try {
        await this.syncAgentToTool(agent, profile);
        success.push(agent.tool);
      } catch (_error) {
        failed.push(agent.tool);
      }
    }

    return { success, failed };
  }

  private async syncAgentToTool(agent: AgentProfile, profile: Profile): Promise<void> {
    switch (agent.tool) {
      case 'openclaw':
        await this.syncToOpenClaw(agent, profile);
        break;
      case 'hermes':
        await this.syncToHermes(agent, profile);
        break;
      case 'claude-code':
        await this.syncToClaudeCode(agent, profile);
        break;
      case 'cursor':
        await this.syncToCursor(agent, profile);
        break;
      case 'copilot':
        await this.syncToCopilot(agent, profile);
        break;
      case 'aider':
        await this.syncToAider(agent, profile);
        break;
    }
  }

  private async syncToOpenClaw(agent: AgentProfile, profile: Profile): Promise<void> {
    const fs = await import('fs/promises');
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
          primary: agent.settings.model || existing.agents?.defaults?.model?.primary || 'anthropic/claude-sonnet-4-6',
          ...existing.agents?.defaults?.model,
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

    await fs.mkdir(path.dirname(configPath), { recursive: true });
    await backupFile(configPath);
    await fs.writeFile(configPath, JSON.stringify(merged, null, 2));
  }

  private async syncToHermes(agent: AgentProfile, _profile: Profile): Promise<void> {
    const fs = await import('fs/promises');
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

    await fs.mkdir(path.dirname(configPath), { recursive: true });
    await backupFile(configPath);
    await fs.writeFile(configPath, yaml.stringify(merged));
  }

  private async syncToClaudeCode(agent: AgentProfile, profile: Profile): Promise<void> {
    const fs = await import('fs/promises');
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

    await fs.mkdir(path.dirname(configPath), { recursive: true });
    await backupFile(configPath);
    await fs.writeFile(configPath, JSON.stringify(merged, null, 2));
  }

  private async syncToCursor(agent: AgentProfile, _profile: Profile): Promise<void> {
    const rulesDir = path.join(process.cwd(), '.cursor', 'rules');
    const fs = await import('fs/promises');
    
    await fs.mkdir(rulesDir, { recursive: true });

    // Create main rule file
    const ruleContent = `---
description: "${agent.name} rules"
globs: "**/*"
alwaysApply: false
---

# ${agent.name}

${agent.settings.instructions || 'AgentWizard generated rules'}
`;

    await backupFile(path.join(rulesDir, 'agent-wizard.mdc'));
    await fs.writeFile(path.join(rulesDir, 'agent-wizard.mdc'), ruleContent);
  }

  private async syncToCopilot(agent: AgentProfile, _profile: Profile): Promise<void> {
    const instructionsDir = path.join(process.cwd(), '.github');
    const fs = await import('fs/promises');
    
    await fs.mkdir(instructionsDir, { recursive: true });

    // Create repository-wide instructions
    const instructions = `# ${agent.name}

${agent.settings.instructions || 'AgentWizard generated instructions'}
`;

    await backupFile(path.join(instructionsDir, 'copilot-instructions.md'));
    await fs.writeFile(path.join(instructionsDir, 'copilot-instructions.md'), instructions);
  }

  private async syncToAider(agent: AgentProfile, _profile: Profile): Promise<void> {
    const fs = await import('fs/promises');
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

    await backupFile(configPath);
    await fs.writeFile(configPath, yaml.stringify(merged));
  }

  private async readJson5<T>(configPath: string): Promise<T> {
    const fs = await import('fs/promises');
    try {
      const content = await fs.readFile(configPath, 'utf-8');
      return JSON5.parse(content) as T;
    } catch {
      return {} as T;
    }
  }

  private async readJson<T>(configPath: string): Promise<T> {
    const fs = await import('fs/promises');
    try {
      const content = await fs.readFile(configPath, 'utf-8');
      return JSON.parse(content) as T;
    } catch {
      return {} as T;
    }
  }

  private async readYaml<T>(configPath: string): Promise<T> {
    const fs = await import('fs/promises');
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
