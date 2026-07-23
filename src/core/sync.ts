import * as fs from 'fs/promises';
import * as path from 'path';
import * as yaml from 'yaml';
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
      } catch (error) {
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
    const config: OpenClawConfig = {
      agents: {
        defaults: {
          workspace: agent.settings.workspace || '~/.openclaw/workspace',
          model: {
            primary: agent.settings.model || 'anthropic/claude-sonnet-4-6',
          },
        },
        entries: {
          [agent.id]: {
            identity: {
              name: agent.name,
            },
          },
        },
      },
      tools: {
        allow: profile.permissions.allow,
        deny: profile.permissions.deny,
      },
    };

    const fs = await import('fs/promises');
    const os = await import('os');
    
    const configPath = path.join(os.homedir(), '.openclaw', 'openclaw.json');
    await fs.mkdir(path.dirname(configPath), { recursive: true });
    await fs.writeFile(configPath, JSON.stringify(config, null, 2));
  }

  private async syncToHermes(agent: AgentProfile, profile: Profile): Promise<void> {
    const config: HermesConfig = {
      model: {
        default: agent.settings.model || 'anthropic/claude-opus-4.6',
        provider: 'auto',
      },
      terminal: {
        backend: agent.settings.terminal?.backend || 'local',
        cwd: '.',
        timeout: agent.settings.terminal?.timeout || 180,
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
        reasoning_effort: agent.settings.reasoning_effort || 'medium',
      },
    };

    const fs = await import('fs/promises');
    const yaml = await import('yaml');
    const os = await import('os');
    
    const configPath = path.join(os.homedir(), '.hermes', 'config.yaml');
    await fs.mkdir(path.dirname(configPath), { recursive: true });
    await fs.writeFile(configPath, yaml.stringify(config));
  }

  private async syncToClaudeCode(agent: AgentProfile, profile: Profile): Promise<void> {
    const config: ClaudeCodeSettings = {
      $schema: 'https://json.schemastore.org/claude-code-settings.json',
      permissions: {
        allow: profile.permissions.allow,
        deny: profile.permissions.deny,
      },
    };

    const fs = await import('fs/promises');
    const os = await import('os');
    
    const configPath = path.join(os.homedir(), '.claude', 'settings.json');
    await fs.mkdir(path.dirname(configPath), { recursive: true });
    await fs.writeFile(configPath, JSON.stringify(config, null, 2));
  }

  private async syncToCursor(agent: AgentProfile, profile: Profile): Promise<void> {
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

    await fs.writeFile(path.join(rulesDir, 'agent-wizard.mdc'), ruleContent);
  }

  private async syncToCopilot(agent: AgentProfile, profile: Profile): Promise<void> {
    const instructionsDir = path.join(process.cwd(), '.github');
    const fs = await import('fs/promises');
    
    await fs.mkdir(instructionsDir, { recursive: true });

    // Create repository-wide instructions
    const instructions = `# ${agent.name}

${agent.settings.instructions || 'AgentWizard generated instructions'}
`;

    await fs.writeFile(path.join(instructionsDir, 'copilot-instructions.md'), instructions);
  }

  private async syncToAider(agent: AgentProfile, profile: Profile): Promise<void> {
    const config: AiderConfig = {
      model: agent.settings.model || 'sonnet',
      architect: agent.settings.architect || false,
      'auto-commits': true,
      'attribute-co-authored-by': true,
      git: true,
      lint: true,
      'auto-lint': true,
    };

    const fs = await import('fs/promises');
    const yaml = await import('yaml');
    
    const configPath = path.join(process.cwd(), '.aider.conf.yml');
    await fs.writeFile(configPath, yaml.stringify(config));
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
          const agent = agentConfig.agents[0];
          profile.agents.push({
            id: tool,
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

        // Merge permissions
        profile.permissions.allow.push(...agentConfig.permissions.allow);
        profile.permissions.deny.push(...agentConfig.permissions.deny);
      }
    }

    return profile;
  }
}
