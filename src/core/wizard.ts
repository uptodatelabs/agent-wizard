import inquirer from 'inquirer';
import chalk from 'chalk';
import ora from 'ora';
import { AgentConfig, Agent } from './types';
import { ProjectDetector, ProjectInfo } from './detector';
import { OpenClawAdapter } from '../adapters/openclaw';
import { HermesAdapter } from '../adapters/hermes';
import { ClaudeCodeAdapter } from '../adapters/claude-code';
import { CursorAdapter } from '../adapters/cursor';
import { CopilotAdapter } from '../adapters/copilot';
import { AiderAdapter } from '../adapters/aider';

export interface WizardOptions {
  projectInfo: ProjectInfo;
  selectedTools: string[];
  config: AgentConfig;
}

export class ConfigWizard {
  private detector = new ProjectDetector();

  async run(): Promise<WizardOptions> {
    console.log(chalk.bold.cyan('\n🧙 AgentWizard Configuration Wizard\n'));

    // Step 1: Detect project
    const spinner = ora('Detecting project...').start();
    const projectInfo = await this.detector.detect();
    spinner.succeed('Project detected');

    this.printProjectInfo(projectInfo);

    // Step 2: Select tools
    const selectedTools = await this.selectTools(projectInfo);

    // Step 3: Configure each tool
    const config = await this.configureTools(selectedTools, projectInfo);

    // Step 4: Review and confirm
    await this.reviewConfig(config, selectedTools);

    return { projectInfo, selectedTools, config };
  }

  private printProjectInfo(info: ProjectInfo): void {
    console.log(chalk.bold('\n📋 Project Information:'));
    console.log(`  Name: ${chalk.green(info.name)}`);
    console.log(`  Type: ${chalk.green(info.type)}`);
    console.log(`  Languages: ${chalk.green(info.languages.join(', ') || 'Unknown')}`);
    console.log(`  Frameworks: ${chalk.green(info.frameworks.join(', ') || 'None detected')}`);
    
    const detectedTools: string[] = [];
    if (info.hasOpenClaw) detectedTools.push('OpenClaw');
    if (info.hasHermes) detectedTools.push('Hermes');
    if (info.hasClaudeCode) detectedTools.push('Claude Code');
    if (info.hasCursor) detectedTools.push('Cursor');
    if (info.hasCopilot) detectedTools.push('Copilot');
    if (info.hasAider) detectedTools.push('Aider');

    if (detectedTools.length > 0) {
      console.log(`  Existing Tools: ${chalk.yellow(detectedTools.join(', '))}`);
    }
  }

  private async selectTools(projectInfo: ProjectInfo): Promise<string[]> {
    const choices = [
      { name: 'OpenClaw', value: 'openclaw', checked: projectInfo.hasOpenClaw },
      { name: 'Hermes', value: 'hermes', checked: projectInfo.hasHermes },
      { name: 'Claude Code', value: 'claude-code', checked: projectInfo.hasClaudeCode },
      { name: 'Cursor', value: 'cursor', checked: projectInfo.hasCursor },
      { name: 'GitHub Copilot', value: 'copilot', checked: projectInfo.hasCopilot },
      { name: 'Aider', value: 'aider', checked: projectInfo.hasAider },
    ];

    const { tools } = await inquirer.prompt([
      {
        type: 'checkbox',
        name: 'tools',
        message: 'Select AI tools to configure:',
        choices,
      },
    ]);

    return tools;
  }

  private async configureTools(tools: string[], projectInfo: ProjectInfo): Promise<AgentConfig> {
    const agents: Agent[] = [];
    const permissions = { allow: [] as string[], deny: [] as string[] };

    for (const tool of tools) {
      console.log(chalk.bold(`\n⚙️  Configuring ${tool}...`));
      
      const agent = await this.configureTool(tool);
      if (agent) {
        agents.push(agent);
      }
    }

    // Configure permissions
    const { usePermissions } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'usePermissions',
        message: 'Do you want to configure permission rules?',
        default: false,
      },
    ]);

    if (usePermissions) {
      const permConfig = await this.configurePermissions();
      permissions.allow = permConfig.allow;
      permissions.deny = permConfig.deny;
    }

    return {
      project: {
        name: projectInfo.name,
        type: projectInfo.type,
        framework: projectInfo.frameworks,
        language: projectInfo.languages,
      },
      agents,
      skills: [],
      permissions,
      hooks: {},
      mcp: [],
    };
  }

  private async configureTool(tool: string): Promise<Agent | null> {
    switch (tool) {
      case 'openclaw':
        return this.configureOpenClaw();
      case 'hermes':
        return this.configureHermes();
      case 'claude-code':
        return this.configureClaudeCode();
      case 'cursor':
        return this.configureCursor();
      case 'copilot':
        return this.configureCopilot();
      case 'aider':
        return this.configureAider();
      default:
        return null;
    }
  }

  private async configureOpenClaw(): Promise<Agent> {
    const answers = await inquirer.prompt([
      {
        type: 'input',
        name: 'name',
        message: 'Agent name:',
        default: 'OpenClaw Agent',
      },
      {
        type: 'list',
        name: 'model',
        message: 'Select model:',
        choices: [
          'anthropic/claude-sonnet-4-6',
          'anthropic/claude-opus-4-6',
          'openai/gpt-4o',
          'openai/gpt-4-turbo',
        ],
      },
    ]);

    return {
      id: 'openclaw',
      name: answers.name,
      role: 'coder',
      model: answers.model,
      instructions: '',
      tools: [],
      guardrails: [],
    };
  }

  private async configureHermes(): Promise<Agent> {
    const answers = await inquirer.prompt([
      {
        type: 'input',
        name: 'name',
        message: 'Agent name:',
        default: 'Hermes Agent',
      },
      {
        type: 'list',
        name: 'model',
        message: 'Select model:',
        choices: [
          'anthropic/claude-opus-4.6',
          'anthropic/claude-sonnet-4.6',
          'openai/gpt-4o',
          'openai/gpt-4-turbo',
        ],
      },
      {
        type: 'list',
        name: 'reasoningEffort',
        message: 'Reasoning effort:',
        choices: ['low', 'medium', 'high'],
        default: 'medium',
      },
    ]);

    return {
      id: 'hermes',
      name: answers.name,
      role: 'coder',
      model: answers.model,
      instructions: '',
      tools: [],
      guardrails: [],
    };
  }

  private async configureClaudeCode(): Promise<Agent> {
    const answers = await inquirer.prompt([
      {
        type: 'input',
        name: 'name',
        message: 'Agent name:',
        default: 'Claude Code Agent',
      },
      {
        type: 'list',
        name: 'model',
        message: 'Select model:',
        choices: [
          'claude-sonnet-4-20250514',
          'claude-opus-4-20250514',
          'claude-haiku-3-20240307',
        ],
      },
    ]);

    return {
      id: 'claude-code',
      name: answers.name,
      role: 'coder',
      model: answers.model,
      instructions: '',
      tools: [],
      guardrails: [],
    };
  }

  private async configureCursor(): Promise<Agent> {
    const answers = await inquirer.prompt([
      {
        type: 'input',
        name: 'name',
        message: 'Agent name:',
        default: 'Cursor Agent',
      },
      {
        type: 'editor',
        name: 'instructions',
        message: 'Enter agent instructions (Markdown):',
      },
    ]);

    return {
      id: 'cursor',
      name: answers.name,
      role: 'coder',
      model: 'cursor-default',
      instructions: answers.instructions,
      tools: [],
      guardrails: [],
    };
  }

  private async configureCopilot(): Promise<Agent> {
    const answers = await inquirer.prompt([
      {
        type: 'input',
        name: 'name',
        message: 'Agent name:',
        default: 'Copilot Agent',
      },
      {
        type: 'editor',
        name: 'instructions',
        message: 'Enter repository instructions (Markdown):',
      },
    ]);

    return {
      id: 'copilot',
      name: answers.name,
      role: 'coder',
      model: 'copilot-default',
      instructions: answers.instructions,
      tools: [],
      guardrails: [],
    };
  }

  private async configureAider(): Promise<Agent> {
    const answers = await inquirer.prompt([
      {
        type: 'input',
        name: 'name',
        message: 'Agent name:',
        default: 'Aider Agent',
      },
      {
        type: 'list',
        name: 'model',
        message: 'Select model:',
        choices: [
          'sonnet',
          'opus',
          'haiku',
          'gpt-4o',
          'gpt-4-turbo',
          'deepseek/deepseek-chat',
        ],
      },
      {
        type: 'confirm',
        name: 'architect',
        message: 'Enable architect mode?',
        default: false,
      },
    ]);

    return {
      id: 'aider',
      name: answers.name,
      role: 'coder',
      model: answers.model,
      instructions: '',
      tools: [],
      guardrails: [],
    };
  }

  private async configurePermissions(): Promise<{ allow: string[]; deny: string[] }> {
    const { allowRules } = await inquirer.prompt([
      {
        type: 'input',
        name: 'allowRules',
        message: 'Enter allowed patterns (comma-separated):',
        default: 'Bash(npm run *)',
      },
    ]);

    const { denyRules } = await inquirer.prompt([
      {
        type: 'input',
        name: 'denyRules',
        message: 'Enter denied patterns (comma-separated):',
        default: 'Read(./.env)',
      },
    ]);

    return {
      allow: allowRules.split(',').map((r: string) => r.trim()).filter(Boolean),
      deny: denyRules.split(',').map((r: string) => r.trim()).filter(Boolean),
    };
  }

  private async reviewConfig(config: AgentConfig, tools: string[]): Promise<void> {
    console.log(chalk.bold('\n📋 Configuration Summary:'));
    console.log(`  Tools: ${chalk.green(tools.join(', '))}`);
    console.log(`  Agents: ${chalk.green(config.agents.length.toString())}`);
    
    if (config.agents.length > 0) {
      console.log(chalk.bold('\n  Agents:'));
      for (const agent of config.agents) {
        console.log(`    - ${chalk.cyan(agent.name)} (${agent.model})`);
      }
    }

    if (config.permissions.allow.length > 0) {
      console.log(chalk.bold('\n  Allowed:'));
      for (const rule of config.permissions.allow) {
        console.log(`    + ${chalk.green(rule)}`);
      }
    }

    if (config.permissions.deny.length > 0) {
      console.log(chalk.bold('\n  Denied:'));
      for (const rule of config.permissions.deny) {
        console.log(`    - ${chalk.red(rule)}`);
      }
    }

    const { confirmed } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'confirmed',
        message: 'Apply this configuration?',
        default: true,
      },
    ]);

    if (!confirmed) {
      console.log(chalk.yellow('\nConfiguration cancelled.'));
      process.exit(0);
    }
  }

  async writeConfig(config: AgentConfig, tools: string[]): Promise<void> {
    const spinner = ora('Writing configuration files...').start();

    try {
      for (const tool of tools) {
        await this.writeToolConfig(tool, config);
      }
      spinner.succeed('Configuration files written');
    } catch (error) {
      spinner.fail('Failed to write configuration');
      throw error;
    }
  }

  private async writeToolConfig(tool: string, config: AgentConfig): Promise<void> {
    switch (tool) {
      case 'openclaw':
        const openclaw = new OpenClawAdapter();
        await openclaw.write(config);
        break;
      case 'hermes':
        const hermes = new HermesAdapter();
        await hermes.write(config);
        break;
      case 'claude-code':
        const claudeCode = new ClaudeCodeAdapter();
        await claudeCode.write(config);
        break;
      case 'cursor':
        const cursor = new CursorAdapter();
        await cursor.write(config);
        break;
      case 'copilot':
        const copilot = new CopilotAdapter();
        await copilot.write(config);
        break;
      case 'aider':
        const aider = new AiderAdapter();
        await aider.write(config);
        break;
    }
  }
}
