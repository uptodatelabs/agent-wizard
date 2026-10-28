import { AgentConfig, Agent } from '../core/types';
import JSON5 from 'json5';
import { backupFile } from '../core/backup';
import { openclawConfigSchema, validateWithSchema } from '../schemas/tool-schemas';

export interface OpenClawConfig {
  $schema?: string;
  agents: {
    defaults: {
      workspace: string;
      model?: {
        primary: string;
        fallbacks?: string[];
      };
      skills?: string[];
    };
    entries?: Record<string, {
      identity?: {
        name?: string;
        emoji?: string;
        theme?: string;
      };
      skills?: string[];
    }>;
    list?: Array<{
      id: string;
      name?: string;
      identity?: {
        name?: string;
        emoji?: string;
        theme?: string;
      };
      model?: string;
      workspace?: string;
      tools?: Record<string, unknown> | string[];
      [key: string]: unknown;
    }>;
  };
  channels?: Record<string, {
    enabled?: boolean;
    allowFrom?: string[];
    botToken?: string;
  }>;
  models?: {
    mode?: string;
    providers?: Record<string, {
      baseUrl?: string;
      apiKey?: string;
      api?: string;
      models?: Array<{
        id: string;
        contextWindow?: number;
      }>;
    }>;
  };
  tools?: {
    allow?: string[];
    deny?: string[];
  };
  mcp?: {
    servers?: Record<string, {
      command?: string;
      args?: string[];
      env?: Record<string, string>;
    }>;
  };
}

export class OpenClawAdapter {
  name = 'openclaw';
  configPath = '~/.openclaw/openclaw.json';
  format = 'json5';

  async detect(): Promise<boolean> {
    try {
      const fs = await import('fs/promises');
      const path = await import('path');
      const os = await import('os');
      
      const configPath = path.join(os.homedir(), '.openclaw', 'openclaw.json');
      await fs.access(configPath);
      return true;
    } catch {
      return false;
    }
  }

  async read(): Promise<AgentConfig> {
    const fs = await import('fs/promises');
    const path = await import('path');
    const os = await import('os');
    
    const configPath = path.join(os.homedir(), '.openclaw', 'openclaw.json');
    const content = await fs.readFile(configPath, 'utf-8');
    
    const openclawConfig: OpenClawConfig = JSON5.parse(content);
    return this.toAgentConfig(openclawConfig);
  }

  async write(config: AgentConfig): Promise<void> {
    const fs = await import('fs/promises');
    const path = await import('path');
    const os = await import('os');
    
    const configPath = path.join(os.homedir(), '.openclaw', 'openclaw.json');
    const existing = await this.readRaw(configPath);
    const openclawConfig = this.fromAgentConfig(config, existing);
    
    await fs.mkdir(path.dirname(configPath), { recursive: true });
    // Never overwrite an existing config without a restore point.
    await backupFile(configPath);
    await fs.writeFile(configPath, this.serialize(openclawConfig));
  }

  /**
   * Single source of truth for the on-disk OpenClaw format.
   *
   * `ProfileSync` injects this as well, so `init`/`configure` (adapter path)
   * and `sync to-tools` (sync path) can no longer write the same file with
   * different serializers — previously the adapter used JSON5 and sync used
   * JSON, which meant a sync silently dropped JSON5-only formatting.
   */
  serialize(value: unknown): string {
    return JSON5.stringify(value, null, 2);
  }

  private async readRaw(configPath: string): Promise<Partial<OpenClawConfig>> {
    const fs = await import('fs/promises');
    try {
      const content = await fs.readFile(configPath, 'utf-8');
      return JSON5.parse(content) as Partial<OpenClawConfig>;
    } catch {
      return {};
    }
  }

  async validate(): Promise<{ valid: boolean; errors: string[] }> {
    try {
      const os = await import('os');
      const path = await import('path');
      const fs = await import('fs/promises');
      const configPath = path.join(os.homedir(), '.openclaw', 'openclaw.json');
      const content = await fs.readFile(configPath, 'utf-8');
      const config = JSON5.parse(content) as Partial<OpenClawConfig>;
      return OpenClawAdapter.validateStructure(config);
    } catch (error) {
      return {
        valid: false,
        errors: [error instanceof Error ? error.message : 'Unknown error'],
      };
    }
  }

  static validateStructure(config: Partial<OpenClawConfig>): { valid: boolean; errors: string[] } {
    return validateWithSchema(openclawConfigSchema, config);
  }

  private toAgentConfig(openclawConfig: OpenClawConfig): AgentConfig {
    const agents: Agent[] = [];
    const defaultModel = openclawConfig.agents.defaults.model?.primary || 'default';

    // Support both `agents.entries` (Record) and `agents.list` (array) shapes
    if (openclawConfig.agents?.entries) {
      for (const [id, entry] of Object.entries(openclawConfig.agents.entries)) {
        agents.push({
          id,
          name: entry.identity?.name || id,
          role: 'coder',
          model: defaultModel,
          instructions: entry.identity?.theme || '',
          tools: openclawConfig.tools?.allow || [],
          guardrails: [],
        });
      }
    }

    if (Array.isArray(openclawConfig.agents?.list)) {
      for (const item of openclawConfig.agents.list) {
        if (!item?.id) continue;
        agents.push({
          id: item.id,
          name: item.name || item.identity?.name || item.id,
          role: 'coder',
          model: item.model || defaultModel,
          instructions: item.identity?.theme || '',
          tools: openclawConfig.tools?.allow || [],
          guardrails: [],
        });
      }
    }

    return {
      project: {
        name: 'openclaw-project',
        type: 'cli',
        framework: ['openclaw'],
        language: ['typescript'],
      },
      agents,
      skills: [],
      permissions: {
        allow: openclawConfig.tools?.allow || [],
        deny: openclawConfig.tools?.deny || [],
      },
      hooks: {},
      mcp: [],
    };
  }

  private fromAgentConfig(config: AgentConfig, existing: Partial<OpenClawConfig> = {}): OpenClawConfig {
    const entries: Record<string, any> = { ...(existing.agents?.entries || {}) };
    const list: any[] = Array.isArray(existing.agents?.list)
      ? existing.agents.list.map((item) => ({ ...item }))
      : [];

    for (const agent of config.agents) {
      const agentDef = {
        ...(entries[agent.id] || list.find((l) => l.id === agent.id) || {}),
        id: agent.id,
        name: agent.name,
        identity: {
          ...(entries[agent.id]?.identity || list.find((l) => l.id === agent.id)?.identity || {}),
          name: agent.name,
        },
      };

      // Preserve the existing shape: if the config used `list`, keep it as a list
      if (Array.isArray(existing.agents?.list)) {
        const idx = list.findIndex((l) => l.id === agent.id);
        if (idx >= 0) list[idx] = agentDef;
        else list.push(agentDef);
      } else {
        entries[agent.id] = agentDef;
      }
    }

    const defaults = existing.agents?.defaults || { workspace: '~/.openclaw/workspace' };
    const primaryModel = config.agents[0]?.model;

    const agentsShape: any = {
      defaults: {
        ...defaults,
        workspace: defaults.workspace || '~/.openclaw/workspace',
        ...(primaryModel ? { model: { primary: primaryModel, ...defaults.model } } : {}),
      },
    };
    // Keep whichever shape(s) already existed
    if (Array.isArray(existing.agents?.list)) {
      agentsShape.list = list;
    } else {
      agentsShape.entries = entries;
    }

    return {
      ...existing,
      $schema: existing.$schema,
      agents: agentsShape,
      channels: existing.channels,
      models: existing.models,
      tools: {
        allow: config.permissions.allow.length > 0 ? config.permissions.allow : (existing.tools?.allow || []),
        deny: config.permissions.deny.length > 0 ? config.permissions.deny : (existing.tools?.deny || []),
      },
      mcp: existing.mcp,
    };
  }
}
