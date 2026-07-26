import { AgentConfig, Agent } from '../core/types';

export interface ClaudeCodeSettings {
  $schema?: string;
  permissions?: {
    allow?: string[];
    deny?: string[];
  };
  env?: Record<string, string>;
  hooks?: {
    PreToolUse?: HookConfig[];
    PostToolUse?: HookConfig[];
    Notification?: HookConfig[];
  };
  sandbox?: {
    enabled?: boolean;
    autoAllowBashIfSandboxed?: boolean;
    excludedCommands?: string[];
    filesystem?: {
      allowWrite?: string[];
      denyRead?: string[];
    };
    network?: {
      allowedDomains?: string[];
      deniedDomains?: string[];
      allowLocalBinding?: boolean;
    };
  };
  attribution?: {
    enabled?: boolean;
  };
  model?: string;
  autoMemoryEnabled?: boolean;
  companyAnnouncements?: string[];
}

interface HookConfig {
  type: string;
  command?: string;
  prompt?: string;
  matcher?: string;
}

export class ClaudeCodeAdapter {
  name = 'claude-code';
  configPath = '~/.claude/settings.json';
  format = 'json';

  private readonly userConfigPath = '~/.claude/settings.json';
  private readonly projectConfigPath = '.claude/settings.json';
  private readonly localConfigPath = '.claude/settings.local.json';

  async detect(): Promise<boolean> {
    try {
      const fs = await import('fs/promises');
      const path = await import('path');
      const os = await import('os');
      
      const userConfigPath = path.join(os.homedir(), '.claude', 'settings.json');
      const projectConfigPath = path.join(process.cwd(), '.claude', 'settings.json');
      
      try {
        await fs.access(userConfigPath);
        return true;
      } catch {
        try {
          await fs.access(projectConfigPath);
          return true;
        } catch {
          return false;
        }
      }
    } catch {
      return false;
    }
  }

  async read(): Promise<AgentConfig> {
    const fs = await import('fs/promises');
    const path = await import('path');
    const os = await import('os');
    
    let settings: ClaudeCodeSettings = {};
    
    // Try user config first
    try {
      const userConfigPath = path.join(os.homedir(), '.claude', 'settings.json');
      const content = await fs.readFile(userConfigPath, 'utf-8');
      settings = JSON.parse(content);
    } catch {
      // Try project config
      try {
        const projectConfigPath = path.join(process.cwd(), '.claude', 'settings.json');
        const content = await fs.readFile(projectConfigPath, 'utf-8');
        settings = JSON.parse(content);
      } catch {
        // Use default settings
      }
    }

    return this.toAgentConfig(settings);
  }

  async write(config: AgentConfig): Promise<void> {
    const fs = await import('fs/promises');
    const path = await import('path');
    const os = await import('os');
    
    const settings = this.fromAgentConfig(config);
    const configPath = path.join(os.homedir(), '.claude', 'settings.json');
    
    await fs.mkdir(path.dirname(configPath), { recursive: true });
    await fs.writeFile(configPath, JSON.stringify(settings, null, 2));
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

  private toAgentConfig(settings: ClaudeCodeSettings): AgentConfig {
    const agents: Agent[] = [];
    
    // Create a default agent based on settings
    if (settings.model) {
      agents.push({
        id: 'default',
        name: 'Claude Code Agent',
        role: 'coder',
        model: settings.model,
        instructions: '',
        tools: [],
        guardrails: [],
      });
    }

    return {
      project: {
        name: 'claude-code-project',
        type: 'cli',
        framework: ['claude-code'],
        language: ['typescript'],
      },
      agents,
      skills: [],
      permissions: {
        allow: settings.permissions?.allow || [],
        deny: settings.permissions?.deny || [],
      },
      hooks: {},
      mcp: [],
    };
  }

  private fromAgentConfig(config: AgentConfig): ClaudeCodeSettings {
    const settings: ClaudeCodeSettings = {
      $schema: 'https://json.schemastore.org/claude-code-settings.json',
    };

    if (config.agents.length > 0) {
      settings.model = config.agents[0].model;
    }

    if (config.permissions.allow.length > 0 || config.permissions.deny.length > 0) {
      settings.permissions = {
        allow: config.permissions.allow,
        deny: config.permissions.deny,
      };
    }

    return settings;
  }

  async readScope(scope: 'user' | 'project' | 'local'): Promise<ClaudeCodeSettings> {
    const fs = await import('fs/promises');
    const path = await import('path');
    const os = await import('os');
    
    let configPath: string;
    
    switch (scope) {
      case 'user':
        configPath = path.join(os.homedir(), '.claude', 'settings.json');
        break;
      case 'project':
        configPath = path.join(process.cwd(), '.claude', 'settings.json');
        break;
      case 'local':
        configPath = path.join(process.cwd(), '.claude', 'settings.local.json');
        break;
    }

    try {
      const content = await fs.readFile(configPath, 'utf-8');
      return JSON.parse(content);
    } catch {
      return {};
    }
  }

  async writeScope(scope: 'user' | 'project' | 'local', settings: ClaudeCodeSettings): Promise<void> {
    const fs = await import('fs/promises');
    const path = await import('path');
    const os = await import('os');
    
    let configPath: string;
    
    switch (scope) {
      case 'user':
        configPath = path.join(os.homedir(), '.claude', 'settings.json');
        break;
      case 'project':
        configPath = path.join(process.cwd(), '.claude', 'settings.json');
        break;
      case 'local':
        configPath = path.join(process.cwd(), '.claude', 'settings.local.json');
        break;
    }

    await fs.mkdir(path.dirname(configPath), { recursive: true });
    await fs.writeFile(configPath, JSON.stringify(settings, null, 2));
  }
}
