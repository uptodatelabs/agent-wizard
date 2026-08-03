import { AgentConfig, Agent } from '../core/types';
import { aiderConfigSchema, validateWithSchema } from '../schemas/tool-schemas';

export interface AiderConfig {
  model?: string;
  'edit-format'?: string;
  architect?: boolean;
  'weak-model'?: string;
  'editor-model'?: string;
  'reasoning-effort'?: string;
  alias?: string;
  'verify-ssl'?: boolean;
  timeout?: number;
  'show-model-warnings'?: boolean;
  'max-chat-history-tokens'?: number;
  'cache-prompts'?: boolean;
  'cache-keepalive-pings'?: number;
  'map-tokens'?: number;
  'map-refresh'?: string;
  'map-multiplier-no-files'?: number;
  git?: boolean;
  gitignore?: boolean;
  'add-gitignore-files'?: string[];
  aiderignore?: string;
  'subtree-only'?: boolean;
  'auto-commits'?: boolean;
  'dirty-commits'?: boolean;
  'attribute-author'?: boolean;
  'attribute-committer'?: boolean;
  'attribute-co-authored-by'?: boolean;
  'git-commit-verify'?: boolean;
  commit?: boolean;
  'commit-prompt'?: string;
  'dry-run'?: boolean;
  'watch-files'?: boolean;
  lint?: boolean;
  'lint-cmd'?: string[];
  'auto-lint'?: boolean;
  'test-cmd'?: string;
  'auto-test'?: boolean;
  test?: boolean;
  read?: string[];
  file?: string[];
  'dark-mode'?: boolean;
  'light-mode'?: boolean;
  pretty?: boolean;
  stream?: boolean;
  'show-diffs'?: boolean;
  vim?: boolean;
  'chat-language'?: string;
  'commit-language'?: string;
  'yes-always'?: string[];
  encoding?: string;
  'line-endings'?: string;
}

export class AiderAdapter {
  name = 'aider';
  configPath = '.aider.conf.yml';
  format = 'yaml';

  private readonly configFiles = [
    '.aider.conf.yml',
    'aider.conf.yml',
  ];

  async detect(): Promise<boolean> {
    try {
      const fs = await import('fs/promises');
      const path = await import('path');
      
      // Check current directory
      for (const configFile of this.configFiles) {
        const configPath = path.join(process.cwd(), configFile);
        try {
          await fs.access(configPath);
          return true;
        } catch {
          // Continue
        }
      }
      
      // Check home directory
      const os = await import('os');
      for (const configFile of this.configFiles) {
        const configPath = path.join(os.homedir(), configFile);
        try {
          await fs.access(configPath);
          return true;
        } catch {
          // Continue
        }
      }
      
      return false;
    } catch {
      return false;
    }
  }

  async read(): Promise<AgentConfig> {
    const fs = await import('fs/promises');
    const path = await import('path');
    const yaml = await import('yaml');
    const os = await import('os');
    
    let aiderConfig: AiderConfig = {};
    
    // Try current directory first
    for (const configFile of this.configFiles) {
      try {
        const configPath = path.join(process.cwd(), configFile);
        const content = await fs.readFile(configPath, 'utf-8');
        aiderConfig = yaml.parse(content);
        break;
      } catch {
        // Continue
      }
    }
    
    // Try home directory
    if (Object.keys(aiderConfig).length === 0) {
      for (const configFile of this.configFiles) {
        try {
          const configPath = path.join(os.homedir(), configFile);
          const content = await fs.readFile(configPath, 'utf-8');
          aiderConfig = yaml.parse(content);
          break;
        } catch {
          // Continue
        }
      }
    }

    return this.toAgentConfig(aiderConfig);
  }

  async write(config: AgentConfig): Promise<void> {
    const fs = await import('fs/promises');
    const path = await import('path');
    const yaml = await import('yaml');
    
    const configPath = path.join(process.cwd(), '.aider.conf.yml');
    const existing = await this.readRaw();
    const aiderConfig = this.fromAgentConfig(config, existing);
    
    await fs.writeFile(configPath, yaml.stringify(aiderConfig));
  }

  async validate(): Promise<{ valid: boolean; errors: string[] }> {
    try {
      const config = await this.readRaw();
      return AiderAdapter.validateStructure(config);
    } catch (error) {
      return {
        valid: false,
        errors: [error instanceof Error ? error.message : 'Unknown error'],
      };
    }
  }

  static validateStructure(config: Partial<AiderConfig>): { valid: boolean; errors: string[] } {
    if (!config || typeof config !== 'object') {
      return { valid: false, errors: ['Config is not an object'] };
    }
    if (Object.keys(config).length === 0) {
      return { valid: false, errors: ['No Aider configuration found'] };
    }
    return validateWithSchema(aiderConfigSchema, config);
  }

  private toAgentConfig(aiderConfig: AiderConfig): AgentConfig {
    const agents: Agent[] = [];
    
    // Create agent based on model configuration
    if (aiderConfig.model) {
      agents.push({
        id: 'default',
        name: 'Aider Agent',
        role: 'coder',
        model: aiderConfig.model,
        instructions: aiderConfig['commit-prompt'] || '',
        tools: [],
        guardrails: [],
      });
    }

    // Add architect agent if enabled
    if (aiderConfig.architect && aiderConfig['editor-model']) {
      agents.push({
        id: 'architect',
        name: 'Aider Architect',
        role: 'coder',
        model: aiderConfig['editor-model'],
        instructions: '',
        tools: [],
        guardrails: [],
      });
    }

    return {
      project: {
        name: 'aider-project',
        type: 'cli',
        framework: ['aider'],
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

  private fromAgentConfig(config: AgentConfig, existing: Partial<AiderConfig> = {}): AiderConfig {
    const aiderConfig: AiderConfig = { ...existing };
    
    if (config.agents.length > 0) {
      aiderConfig.model = config.agents[0].model || existing.model;
      
      if (config.agents[0].instructions) {
        aiderConfig['commit-prompt'] = config.agents[0].instructions;
      }
    }

    // Only set sensible defaults when the key isn't already configured
    if (aiderConfig['auto-commits'] === undefined) aiderConfig['auto-commits'] = true;
    if (aiderConfig['attribute-co-authored-by'] === undefined) aiderConfig['attribute-co-authored-by'] = true;
    if (aiderConfig.git === undefined) aiderConfig.git = true;
    if (aiderConfig.lint === undefined) aiderConfig.lint = true;
    if (aiderConfig['auto-lint'] === undefined) aiderConfig['auto-lint'] = true;

    return aiderConfig;
  }

  async readRaw(): Promise<AiderConfig> {
    const fs = await import('fs/promises');
    const path = await import('path');
    const yaml = await import('yaml');
    const os = await import('os');
    
    // Try current directory first
    for (const configFile of this.configFiles) {
      try {
        const configPath = path.join(process.cwd(), configFile);
        const content = await fs.readFile(configPath, 'utf-8');
        return yaml.parse(content);
      } catch {
        // Continue
      }
    }
    
    // Try home directory
    for (const configFile of this.configFiles) {
      try {
        const configPath = path.join(os.homedir(), configFile);
        const content = await fs.readFile(configPath, 'utf-8');
        return yaml.parse(content);
      } catch {
        // Continue
      }
    }

    return {};
  }

  async writeRaw(config: AiderConfig): Promise<void> {
    const fs = await import('fs/promises');
    const path = await import('path');
    const yaml = await import('yaml');
    
    const configPath = path.join(process.cwd(), '.aider.conf.yml');
    await fs.writeFile(configPath, yaml.stringify(config));
  }

  async setOption(key: string, value: string | number | boolean | string[]): Promise<void> {
    const config = await this.readRaw();
    (config as any)[key] = value;
    await this.writeRaw(config);
  }

  async getOption(key: string): Promise<string | number | boolean | string[] | undefined> {
    const config = await this.readRaw();
    return (config as any)[key];
  }

  async unsetOption(key: string): Promise<void> {
    const config = await this.readRaw();
    delete (config as any)[key];
    await this.writeRaw(config);
  }
}
