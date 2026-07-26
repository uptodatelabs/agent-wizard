import { AgentConfig, Agent } from '../core/types';
import JSON5 from 'json5';

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
    await fs.writeFile(configPath, JSON5.stringify(openclawConfig, null, 2));
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
      await this.read();
      return { valid: true, errors: [] };
    } catch (error) {
      return { 
        valid: false, 
        errors: [error instanceof Error ? error.message : 'Unknown error'] 
      };
    }
  }

  private toAgentConfig(openclawConfig: OpenClawConfig): AgentConfig {
    const agents: Agent[] = [];
    
    if (openclawConfig.agents?.entries) {
      for (const [id, entry] of Object.entries(openclawConfig.agents.entries)) {
        agents.push({
          id,
          name: entry.identity?.name || id,
          role: 'coder',
          model: openclawConfig.agents.defaults.model?.primary || 'default',
          instructions: entry.identity?.theme || '',
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

    for (const agent of config.agents) {
      entries[agent.id] = {
        ...entries[agent.id],
        identity: {
          ...entries[agent.id]?.identity,
          name: agent.name,
        },
      };
    }

    const defaults = existing.agents?.defaults || { workspace: '~/.openclaw/workspace' };
    const primaryModel = config.agents[0]?.model;

    return {
      ...existing,
      $schema: existing.$schema,
      agents: {
        defaults: {
          ...defaults,
          workspace: defaults.workspace || '~/.openclaw/workspace',
          ...(primaryModel ? { model: { primary: primaryModel, ...defaults.model } } : {}),
        },
        entries,
      },
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
