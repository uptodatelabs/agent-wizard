import { AgentConfig, Agent, Skill } from '../core/types';

export interface HermesConfig {
  model?: {
    default?: string;
    provider?: string;
    base_url?: string;
    context_length?: number;
    max_tokens?: number;
  };
  providers?: Record<string, {
    base_url?: string;
    api_key?: string;
    timeout?: number;
  }>;
  terminal?: {
    backend?: string;
    cwd?: string;
    timeout?: number;
    home_mode?: string;
  };
  compression?: {
    enabled?: boolean;
    threshold?: number;
    target_ratio?: number;
    protect_last_n?: number;
    protect_first_n?: number;
  };
  memory?: {
    memory_enabled?: boolean;
    user_profile_enabled?: boolean;
    memory_char_limit?: number;
    user_char_limit?: number;
    nudge_interval?: number;
    flush_min_turns?: number;
  };
  skills?: {
    creation_nudge_interval?: number;
    write_approval?: boolean;
    guard_agent_created?: boolean;
  };
  agent?: {
    max_turns?: number;
    verbose?: boolean;
    reasoning_effort?: string;
    personalities?: Record<string, string>;
  };
}

export class HermesAdapter {
  name = 'hermes';
  configPath = '~/.hermes/config.yaml';
  format = 'yaml';

  async detect(): Promise<boolean> {
    try {
      const fs = await import('fs/promises');
      const path = await import('path');
      const os = await import('os');
      
      const configPath = path.join(os.homedir(), '.hermes', 'config.yaml');
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
    const yaml = await import('yaml');
    
    const configPath = path.join(os.homedir(), '.hermes', 'config.yaml');
    const content = await fs.readFile(configPath, 'utf-8');
    
    const hermesConfig: HermesConfig = yaml.parse(content);
    return this.toAgentConfig(hermesConfig);
  }

  async write(config: AgentConfig): Promise<void> {
    const fs = await import('fs/promises');
    const path = await import('path');
    const os = await import('os');
    const yaml = await import('yaml');
    
    const hermesConfig = this.fromAgentConfig(config);
    const configPath = path.join(os.homedir(), '.hermes', 'config.yaml');
    
    await fs.mkdir(path.dirname(configPath), { recursive: true });
    await fs.writeFile(configPath, yaml.stringify(hermesConfig));
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

  private toAgentConfig(hermesConfig: HermesConfig): AgentConfig {
    const agents: Agent[] = [];
    
    if (hermesConfig.agent?.personalities) {
      for (const [name, instructions] of Object.entries(hermesConfig.agent.personalities)) {
        agents.push({
          id: name,
          name,
          role: 'coder',
          model: hermesConfig.model?.default || 'default',
          instructions,
          tools: [],
          guardrails: [],
        });
      }
    }

    if (agents.length === 0) {
      agents.push({
        id: 'default',
        name: 'Hermes Agent',
        role: 'coder',
        model: hermesConfig.model?.default || 'default',
        instructions: '',
        tools: [],
        guardrails: [],
      });
    }

    return {
      project: {
        name: 'hermes-project',
        type: 'cli',
        framework: ['hermes'],
        language: ['python'],
      },
      agents,
      skills: [],
      permissions: {
        allow: [],
        deny: [],
      },
      hooks: {},
      mcp: [],
    };
  }

  private fromAgentConfig(config: AgentConfig): HermesConfig {
    const personalities: Record<string, string> = {};
    
    for (const agent of config.agents) {
      personalities[agent.name] = agent.instructions;
    }

    return {
      model: {
        default: config.agents[0]?.model || 'default',
        provider: 'auto',
      },
      terminal: {
        backend: 'local',
        cwd: '.',
        timeout: 180,
      },
      compression: {
        enabled: true,
        threshold: 0.50,
      },
      memory: {
        memory_enabled: true,
        user_profile_enabled: true,
      },
      agent: {
        max_turns: 60,
        verbose: false,
        reasoning_effort: 'medium',
        personalities,
      },
    };
  }

  async listProfiles(): Promise<string[]> {
    try {
      const fs = await import('fs/promises');
      const path = await import('path');
      const os = await import('os');
      
      const profilesDir = path.join(os.homedir(), '.hermes', 'profiles');
      const entries = await fs.readdir(profilesDir, { withFileTypes: true });
      
      return entries
        .filter(entry => entry.isDirectory())
        .map(entry => entry.name);
    } catch {
      return [];
    }
  }

  async readProfile(profileName: string): Promise<AgentConfig> {
    const fs = await import('fs/promises');
    const path = await import('path');
    const os = await import('os');
    const yaml = await import('yaml');
    
    const configPath = path.join(os.homedir(), '.hermes', 'profiles', profileName, 'config.yaml');
    const content = await fs.readFile(configPath, 'utf-8');
    
    const hermesConfig: HermesConfig = yaml.parse(content);
    return this.toAgentConfig(hermesConfig);
  }

  async writeProfile(profileName: string, config: AgentConfig): Promise<void> {
    const fs = await import('fs/promises');
    const path = await import('path');
    const os = await import('os');
    const yaml = await import('yaml');
    
    const hermesConfig = this.fromAgentConfig(config);
    const configPath = path.join(os.homedir(), '.hermes', 'profiles', profileName, 'config.yaml');
    
    await fs.mkdir(path.dirname(configPath), { recursive: true });
    await fs.writeFile(configPath, yaml.stringify(hermesConfig));
  }
}
