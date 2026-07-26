import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { AgentStatus, AgentInfo, DashboardData } from './status';
import { OpenClawAdapter } from '../adapters/openclaw';
import { HermesAdapter } from '../adapters/hermes';
import { ClaudeCodeAdapter } from '../adapters/claude-code';
import { CursorAdapter } from '../adapters/cursor';
import { CopilotAdapter } from '../adapters/copilot';
import { AiderAdapter } from '../adapters/aider';

export class StatusAdapter {
  private openclawAdapter = new OpenClawAdapter();
  private hermesAdapter = new HermesAdapter();
  private claudeCodeAdapter = new ClaudeCodeAdapter();
  private cursorAdapter = new CursorAdapter();
  private copilotAdapter = new CopilotAdapter();
  private aiderAdapter = new AiderAdapter();

  async getAllStatuses(): Promise<DashboardData> {
    const toolStatuses = await Promise.all([
      this.getOpenClawStatus(),
      this.getHermesStatus(),
      this.getClaudeCodeStatus(),
      this.getCursorStatus(),
      this.getCopilotStatus(),
      this.getAiderStatus(),
    ]);

    const totalAgents = toolStatuses.reduce((sum, status) => sum + status.agents.length, 0);
    const activeTools = toolStatuses.filter(s => s.status === 'active' || s.status === 'configured').length;

    return {
      toolStatuses,
      totalAgents,
      activeTools,
      lastUpdated: new Date(),
    };
  }

  async getToolStatus(tool: string): Promise<AgentStatus | null> {
    switch (tool) {
      case 'openclaw':
        return this.getOpenClawStatus();
      case 'hermes':
        return this.getHermesStatus();
      case 'claude-code':
        return this.getClaudeCodeStatus();
      case 'cursor':
        return this.getCursorStatus();
      case 'copilot':
        return this.getCopilotStatus();
      case 'aider':
        return this.getAiderStatus();
      default:
        return null;
    }
  }

  private async getOpenClawStatus(): Promise<AgentStatus> {
    const configPath = path.join(os.homedir(), '.openclaw', 'openclaw.json');
    
    try {
      const content = await fs.readFile(configPath, 'utf-8');
      const config = JSON.parse(content);
      
      const agents: AgentInfo[] = [];
      const entries = config.agents?.entries || {};
      
      for (const [id, entry] of Object.entries(entries) as [string, any][]) {
        agents.push({
          id,
          name: entry.identity?.name || id,
          model: config.agents?.defaults?.model?.primary,
          role: 'coder',
          enabled: true,
          status: 'active',
          config: entry,
        });
      }

      return {
        tool: 'openclaw',
        toolName: 'OpenClaw',
        status: agents.length > 0 ? 'configured' : 'not-configured',
        agents,
        configValid: true,
        configPath,
        lastChecked: new Date(),
        details: {
          scopes: ['user'],
          permissions: {
            allow: config.tools?.allow?.length || 0,
            deny: config.tools?.deny?.length || 0,
          },
        },
      };
    } catch {
      return {
        tool: 'openclaw',
        toolName: 'OpenClaw',
        status: 'not-configured',
        agents: [],
        configValid: false,
        configPath,
        lastChecked: new Date(),
        details: {},
      };
    }
  }

  private async getHermesStatus(): Promise<AgentStatus> {
    const configPath = path.join(os.homedir(), '.hermes', 'config.yaml');
    const profilesDir = path.join(os.homedir(), '.hermes', 'profiles');
    
    try {
      const yaml = await import('yaml');
      const content = await fs.readFile(configPath, 'utf-8');
      const config = yaml.parse(content);
      
      const agents: AgentInfo[] = [];
      const personalities = config.agent?.personalities || {};
      
      for (const [name, instructions] of Object.entries(personalities) as [string, string][]) {
        agents.push({
          id: name,
          name,
          model: config.model?.default,
          role: 'coder',
          enabled: true,
          status: 'active',
          config: { instructions },
        });
      }

      // Count profiles
      let profileCount = 0;
      try {
        const entries = await fs.readdir(profilesDir, { withFileTypes: true });
        profileCount = entries.filter(e => e.isDirectory()).length;
      } catch {
        // Profiles directory doesn't exist
      }

      return {
        tool: 'hermes',
        toolName: 'Hermes',
        status: agents.length > 0 ? 'configured' : 'not-configured',
        agents,
        configValid: true,
        configPath,
        lastChecked: new Date(),
        details: {
          profiles: profileCount,
          permissions: {
            allow: 0,
            deny: 0,
          },
        },
      };
    } catch {
      return {
        tool: 'hermes',
        toolName: 'Hermes',
        status: 'not-configured',
        agents: [],
        configValid: false,
        configPath,
        lastChecked: new Date(),
        details: {},
      };
    }
  }

  private async getClaudeCodeStatus(): Promise<AgentStatus> {
    const scopes = ['user', 'project', 'local'] as const;
    const foundScopes: string[] = [];
    let model: string | undefined;
    let allowCount = 0;
    let denyCount = 0;
    for (const scope of scopes) {
      try {
        const settings = await this.claudeCodeAdapter.readScope(scope);
        if (Object.keys(settings).length > 0) {
          foundScopes.push(scope);
          if (settings.model) model = settings.model;
          if (settings.permissions?.allow) allowCount += settings.permissions.allow.length;
          if (settings.permissions?.deny) denyCount += settings.permissions.deny.length;
        }
      } catch {
        // Continue
      }
    }

    const agents: AgentInfo[] = [];
    if (foundScopes.length > 0) {
      agents.push({
        id: 'default',
        name: 'Claude Code Agent',
        model,
        role: 'coder',
        enabled: true,
        status: 'active',
      });
    }

    return {
      tool: 'claude-code',
      toolName: 'Claude Code',
      status: foundScopes.length > 0 ? 'configured' : 'not-configured',
      agents,
      configValid: foundScopes.length > 0,
      configPath: '~/.claude/settings.json',
      lastChecked: new Date(),
      details: {
        scopes: foundScopes,
        permissions: { allow: allowCount, deny: denyCount },
      },
    };
  }

  private async getCursorStatus(): Promise<AgentStatus> {
    const rulesDir = path.join(process.cwd(), '.cursor', 'rules');
    const agents: AgentInfo[] = [];
    let rulesCount = 0;
    
    try {
      const files = await fs.readdir(rulesDir);
      const mdcFiles = files.filter(f => f.endsWith('.mdc'));
      rulesCount = mdcFiles.length;
      
      for (const file of mdcFiles) {
        const content = await fs.readFile(path.join(rulesDir, file), 'utf-8');
        const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/);
        
        if (frontmatterMatch) {
          const frontmatter = frontmatterMatch[1];
          const descriptionMatch = frontmatter.match(/description:\s*"?(.*?)"?\s*$/m);
          const alwaysApplyMatch = frontmatter.match(/alwaysApply:\s*(true|false)$/m);
          
          const isAlwaysApply = alwaysApplyMatch?.[1] === 'true';
          
          agents.push({
            id: file,
            name: descriptionMatch?.[1] || file,
            role: 'rule',
            enabled: true,
            status: 'active',
            config: { alwaysApply: isAlwaysApply },
          });
        }
      }
    } catch {
      // Rules directory doesn't exist
    }

    return {
      tool: 'cursor',
      toolName: 'Cursor',
      status: rulesCount > 0 ? 'configured' : 'not-configured',
      agents,
      configValid: rulesCount > 0,
      configPath: '.cursor/rules/',
      lastChecked: new Date(),
      details: {
        rules: rulesCount,
      },
    };
  }

  private async getCopilotStatus(): Promise<AgentStatus> {
    const instructionsPath = path.join(process.cwd(), '.github', 'copilot-instructions.md');
    const instructionsDir = path.join(process.cwd(), '.github', 'instructions');
    
    let hasMainInstructions = false;
    let pathInstructionsCount = 0;
    
    try {
      await fs.access(instructionsPath);
      hasMainInstructions = true;
    } catch {
      // File doesn't exist
    }
    
    try {
      const files = await fs.readdir(instructionsDir);
      pathInstructionsCount = files.filter(f => f.endsWith('.instructions.md')).length;
    } catch {
      // Directory doesn't exist
    }

    const agents: AgentInfo[] = [];
    if (hasMainInstructions || pathInstructionsCount > 0) {
      agents.push({
        id: 'copilot-agent',
        name: 'GitHub Copilot',
        role: 'coder',
        enabled: true,
        status: 'active',
      });
    }

    return {
      tool: 'copilot',
      toolName: 'GitHub Copilot',
      status: agents.length > 0 ? 'configured' : 'not-configured',
      agents,
      configValid: agents.length > 0,
      configPath: '.github/copilot-instructions.md',
      lastChecked: new Date(),
      details: {
        instructions: hasMainInstructions,
        pathInstructions: pathInstructionsCount,
      },
    };
  }

  private async getAiderStatus(): Promise<AgentStatus> {
    const configFiles = ['.aider.conf.yml', 'aider.conf.yml'];
    let config: any = {};
    let configPath = '';
    
    // Check current directory
    for (const file of configFiles) {
      try {
        const yaml = await import('yaml');
        const content = await fs.readFile(path.join(process.cwd(), file), 'utf-8');
        config = yaml.parse(content);
        configPath = path.join(process.cwd(), file);
        break;
      } catch {
        // Continue
      }
    }
    
    // Check home directory
    if (Object.keys(config).length === 0) {
      for (const file of configFiles) {
        try {
          const yaml = await import('yaml');
          const content = await fs.readFile(path.join(os.homedir(), file), 'utf-8');
          config = yaml.parse(content);
          configPath = path.join(os.homedir(), file);
          break;
        } catch {
          // Continue
        }
      }
    }

    const agents: AgentInfo[] = [];
    
    if (config.model) {
      agents.push({
        id: 'default',
        name: 'Aider Agent',
        model: config.model,
        role: 'coder',
        enabled: true,
        status: 'active',
      });
    }
    
    if (config.architect && config['editor-model']) {
      agents.push({
        id: 'architect',
        name: 'Aider Architect',
        model: config['editor-model'],
        role: 'architect',
        enabled: true,
        status: 'active',
      });
    }

    return {
      tool: 'aider',
      toolName: 'Aider',
      status: agents.length > 0 ? 'configured' : 'not-configured',
      agents,
      configValid: agents.length > 0,
      configPath: configPath || '.aider.conf.yml',
      lastChecked: new Date(),
      details: {},
    };
  }
}
