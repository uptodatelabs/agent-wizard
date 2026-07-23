#!/usr/bin/env node

import { Command } from 'commander';
import chalk from 'chalk';
import inquirer from 'inquirer';
import { ConfigWizard } from '../core/wizard';
import { ProjectDetector } from '../core/detector';
import { ProfileManagerImpl } from '../core/profile-manager';
import { ProfileSync } from '../core/sync';
import { StatusAdapter } from '../core/status-adapter';
import { OpenClawAdapter } from '../adapters/openclaw';
import { HermesAdapter } from '../adapters/hermes';
import { ClaudeCodeAdapter } from '../adapters/claude-code';
import { CursorAdapter } from '../adapters/cursor';
import { CopilotAdapter } from '../adapters/copilot';
import { AiderAdapter } from '../adapters/aider';

const program = new Command();
const profileManager = new ProfileManagerImpl();
const profileSync = new ProfileSync();
const statusAdapter = new StatusAdapter();

program
  .name('agent-wizard')
  .description('AI coding assistant configuration wizard')
  .version('0.1.0');

// Init command
program
  .command('init')
  .description('Initialize project configuration')
  .action(async () => {
    console.log(chalk.bold.cyan('\n🧙 AgentWizard Init\n'));
    
    const wizard = new ConfigWizard();
    
    try {
      const { projectInfo, selectedTools, config } = await wizard.run();
      await wizard.writeConfig(config, selectedTools);
      
      console.log(chalk.bold.green('\n✅ Configuration complete!\n'));
      console.log('Configured tools:');
      for (const tool of selectedTools) {
        console.log(`  - ${chalk.green(tool)}`);
      }
      console.log('\nRun ' + chalk.cyan('agent-wizard validate') + ' to verify your configuration.\n');
    } catch (error) {
      console.error(chalk.red('\n❌ Error:'), error);
      process.exit(1);
    }
  });

// Detect command
program
  .command('detect')
  .description('Detect project type and tech stack')
  .action(async () => {
    console.log(chalk.bold.cyan('\n🔍 AgentWizard Detect\n'));
    
    const detector = new ProjectDetector();
    
    try {
      const projectInfo = await detector.detect();
      
      console.log(chalk.bold('Project Information:'));
      console.log(`  Name: ${chalk.green(projectInfo.name)}`);
      console.log(`  Type: ${chalk.green(projectInfo.type)}`);
      console.log(`  Languages: ${chalk.green(projectInfo.languages.join(', ') || 'Unknown')}`);
      console.log(`  Frameworks: ${chalk.green(projectInfo.frameworks.join(', ') || 'None detected')}`);
      
      console.log(chalk.bold('\nDetected AI Tools:'));
      const tools = [
        { name: 'OpenClaw', detected: projectInfo.hasOpenClaw },
        { name: 'Hermes', detected: projectInfo.hasHermes },
        { name: 'Claude Code', detected: projectInfo.hasClaudeCode },
        { name: 'Cursor', detected: projectInfo.hasCursor },
        { name: 'Copilot', detected: projectInfo.hasCopilot },
        { name: 'Aider', detected: projectInfo.hasAider },
      ];
      
      for (const tool of tools) {
        const status = tool.detected 
          ? chalk.green('✓ Detected') 
          : chalk.gray('✗ Not found');
        console.log(`  ${tool.name}: ${status}`);
      }
      
      console.log('');
    } catch (error) {
      console.error(chalk.red('\n❌ Error:'), error);
      process.exit(1);
    }
  });

// Configure command
program
  .command('configure')
  .description('Interactive configuration wizard')
  .action(async () => {
    console.log(chalk.bold.cyan('\n⚙️  AgentWizard Configure\n'));
    
    const wizard = new ConfigWizard();
    
    try {
      const { projectInfo, selectedTools, config } = await wizard.run();
      await wizard.writeConfig(config, selectedTools);
      
      console.log(chalk.bold.green('\n✅ Configuration updated!\n'));
    } catch (error) {
      console.error(chalk.red('\n❌ Error:'), error);
      process.exit(1);
    }
  });

// Validate command
program
  .command('validate')
  .description('Validate configuration for all tools')
  .action(async () => {
    console.log(chalk.bold.cyan('\n✓ AgentWizard Validate\n'));
    
    const adapters = [
      { name: 'OpenClaw', adapter: new OpenClawAdapter() },
      { name: 'Hermes', adapter: new HermesAdapter() },
      { name: 'Claude Code', adapter: new ClaudeCodeAdapter() },
      { name: 'Cursor', adapter: new CursorAdapter() },
      { name: 'Copilot', adapter: new CopilotAdapter() },
      { name: 'Aider', adapter: new AiderAdapter() },
    ];
    
    let hasErrors = false;
    
    for (const { name, adapter } of adapters) {
      const detected = await adapter.detect();
      
      if (detected) {
        const result = await adapter.validate();
        
        if (result.valid) {
          console.log(`  ${chalk.green('✓')} ${name}: ${chalk.green('Valid')}`);
        } else {
          console.log(`  ${chalk.red('✗')} ${name}: ${chalk.red('Invalid')}`);
          for (const error of result.errors) {
            console.log(`    ${chalk.red(error)}`);
          }
          hasErrors = true;
        }
      } else {
        console.log(`  ${chalk.gray('-')} ${name}: ${chalk.gray('Not configured')}`);
      }
    }
    
    console.log('');
    
    if (hasErrors) {
      console.log(chalk.red('Validation failed!'));
      process.exit(1);
    } else {
      console.log(chalk.green('All configurations are valid!'));
    }
  });

// List command
program
  .command('list')
  .description('List detected configurations')
  .action(async () => {
    console.log(chalk.bold.cyan('\n📋 AgentWizard List\n'));
    
    const adapters = [
      { name: 'OpenClaw', adapter: new OpenClawAdapter() },
      { name: 'Hermes', adapter: new HermesAdapter() },
      { name: 'Claude Code', adapter: new ClaudeCodeAdapter() },
      { name: 'Cursor', adapter: new CursorAdapter() },
      { name: 'Copilot', adapter: new CopilotAdapter() },
      { name: 'Aider', adapter: new AiderAdapter() },
    ];
    
    for (const { name, adapter } of adapters) {
      const detected = await adapter.detect();
      const status = detected 
        ? chalk.green('✓ Configured') 
        : chalk.gray('✗ Not configured');
      console.log(`  ${name}: ${status}`);
    }
    
    console.log('');
  });

// Profile command group
const profileCmd = program
  .command('profile')
  .description('Manage profiles');

// Profile list
profileCmd
  .command('list')
  .description('List all profiles')
  .action(async () => {
    console.log(chalk.bold.cyan('\n📋 Profiles\n'));
    
    try {
      const profiles = await profileManager.listProfiles();
      
      if (profiles.length === 0) {
        console.log(chalk.gray('No profiles found.'));
        console.log('Create one with: ' + chalk.cyan('agent-wizard profile create <name>'));
        return;
      }
      
      const defaultProfile = await profileManager.getDefaultProfile();
      
      for (const profile of profiles) {
        const isDefault = profile.name === defaultProfile.name;
        const marker = isDefault ? chalk.yellow(' (default)') : '';
        console.log(`  ${chalk.green(profile.name)}${marker}`);
        console.log(`    ${chalk.gray(profile.description)}`);
        console.log(`    Agents: ${profile.agents.length}`);
        console.log('');
      }
    } catch (error) {
      console.error(chalk.red('\n❌ Error:'), error);
      process.exit(1);
    }
  });

// Profile create
profileCmd
  .command('create <name>')
  .description('Create a new profile')
  .option('-d, --description <desc>', 'Profile description')
  .action(async (name: string, options: { description?: string }) => {
    console.log(chalk.bold.cyan(`\n➕ Creating profile: ${name}\n`));
    
    try {
      const existing = await profileManager.readProfile(name);
      if (existing) {
        console.error(chalk.red(`Profile '${name}' already exists.`));
        process.exit(1);
      }

      const { description } = await inquirer.prompt([
        {
          type: 'input',
          name: 'description',
          message: 'Profile description:',
          default: options.description || '',
        },
      ]);

      const profile = {
        name,
        description: description || `${name} profile`,
        created: new Date().toISOString(),
        updated: new Date().toISOString(),
        agents: [],
        permissions: { allow: [], deny: [] },
      };

      await profileManager.writeProfile(profile);
      console.log(chalk.green(`\n✅ Profile '${name}' created!\n`));
    } catch (error) {
      console.error(chalk.red('\n❌ Error:'), error);
      process.exit(1);
    }
  });

// Profile show
profileCmd
  .command('show <name>')
  .description('Show profile details')
  .action(async (name: string) => {
    console.log(chalk.bold.cyan(`\n📄 Profile: ${name}\n`));
    
    try {
      const profile = await profileManager.readProfile(name);
      if (!profile) {
        console.error(chalk.red(`Profile '${name}' not found.`));
        process.exit(1);
      }

      console.log(`  Name: ${chalk.green(profile.name)}`);
      console.log(`  Description: ${chalk.gray(profile.description)}`);
      console.log(`  Created: ${chalk.gray(profile.created)}`);
      console.log(`  Updated: ${chalk.gray(profile.updated)}`);
      
      if (profile.agents.length > 0) {
        console.log(chalk.bold('\n  Agents:'));
        for (const agent of profile.agents) {
          const status = agent.enabled ? chalk.green('✓') : chalk.red('✗');
          console.log(`    ${status} ${chalk.cyan(agent.name)} (${agent.tool})`);
          
          if (Object.keys(agent.settings).length > 0) {
            console.log(`      Settings: ${chalk.gray(JSON.stringify(agent.settings))}`);
          }
        }
      } else {
        console.log(chalk.gray('\n  No agents configured.'));
      }
      
      console.log('');
    } catch (error) {
      console.error(chalk.red('\n❌ Error:'), error);
      process.exit(1);
    }
  });

// Profile delete
profileCmd
  .command('delete <name>')
  .description('Delete a profile')
  .option('-f, --force', 'Skip confirmation')
  .action(async (name: string, options: { force?: boolean }) => {
    try {
      const profile = await profileManager.readProfile(name);
      if (!profile) {
        console.error(chalk.red(`Profile '${name}' not found.`));
        process.exit(1);
      }

      if (!options.force) {
        const { confirmed } = await inquirer.prompt([
          {
            type: 'confirm',
            name: 'confirmed',
            message: `Delete profile '${name}'?`,
            default: false,
          },
        ]);

        if (!confirmed) {
          console.log(chalk.gray('Cancelled.'));
          return;
        }
      }

      await profileManager.deleteProfile(name);
      console.log(chalk.green(`\n✅ Profile '${name}' deleted.\n`));
    } catch (error) {
      console.error(chalk.red('\n❌ Error:'), error);
      process.exit(1);
    }
  });

// Profile use
profileCmd
  .command('use <name>')
  .description('Set default profile')
  .action(async (name: string) => {
    try {
      await profileManager.setDefaultProfile(name);
      console.log(chalk.green(`\n✅ Default profile set to '${name}'.\n`));
    } catch (error) {
      console.error(chalk.red('\n❌ Error:'), error);
      process.exit(1);
    }
  });

// Profile export
profileCmd
  .command('export <name>')
  .description('Export profile to stdout')
  .action(async (name: string) => {
    try {
      const data = await profileManager.exportProfile(name);
      console.log(data);
    } catch (error) {
      console.error(chalk.red('\n❌ Error:'), error);
      process.exit(1);
    }
  });

// Profile import
profileCmd
  .command('import')
  .description('Import profile from stdin')
  .action(async () => {
    console.log(chalk.bold.cyan('\n📥 Importing profile...\n'));
    
    try {
      const chunks: Buffer[] = [];
      process.stdin.on('data', (chunk) => chunks.push(chunk));
      process.stdin.on('end', async () => {
        const data = Buffer.concat(chunks).toString();
        const profile = await profileManager.importProfile(data);
        console.log(chalk.green(`\n✅ Profile '${profile.name}' imported.\n`));
      });
    } catch (error) {
      console.error(chalk.red('\n❌ Error:'), error);
      process.exit(1);
    }
  });

// Agent command group
const agentCmd = program
  .command('agent')
  .description('Manage agents in profiles');

// Agent add
agentCmd
  .command('add <profile> <tool>')
  .description('Add agent to profile')
  .option('-n, --name <name>', 'Agent name')
  .action(async (profileName: string, tool: string, options: { name?: string }) => {
    console.log(chalk.bold.cyan(`\n➕ Adding ${tool} agent to profile '${profileName}'\n`));
    
    try {
      const profile = await profileManager.readProfile(profileName);
      if (!profile) {
        console.error(chalk.red(`Profile '${profileName}' not found.`));
        process.exit(1);
      }

      const agent = await profileManager.createAgentProfile(profileName, tool, options.name);
      console.log(chalk.green(`\n✅ Agent '${agent.name}' added to profile '${profileName}'.\n`));
    } catch (error) {
      console.error(chalk.red('\n❌ Error:'), error);
      process.exit(1);
    }
  });

// Agent remove
agentCmd
  .command('remove <profile> <agentId>')
  .description('Remove agent from profile')
  .action(async (profileName: string, agentId: string) => {
    try {
      await profileManager.removeAgent(profileName, agentId);
      console.log(chalk.green(`\n✅ Agent '${agentId}' removed from profile '${profileName}'.\n`));
    } catch (error) {
      console.error(chalk.red('\n❌ Error:'), error);
      process.exit(1);
    }
  });

// Agent config
agentCmd
  .command('config <profile> <agentId> <key> <value>')
  .description('Update agent setting')
  .action(async (profileName: string, agentId: string, key: string, value: string) => {
    try {
      // Parse value (try JSON, then string)
      let parsedValue: any;
      try {
        parsedValue = JSON.parse(value);
      } catch {
        parsedValue = value;
      }

      await profileManager.updateAgentSettings(profileName, agentId, key, parsedValue);
      console.log(chalk.green(`\n✅ Setting '${key}' updated in agent '${agentId}'.\n`));
    } catch (error) {
      console.error(chalk.red('\n❌ Error:'), error);
      process.exit(1);
    }
  });

// Agent list
agentCmd
  .command('list <profile>')
  .description('List agents in profile')
  .action(async (profileName: string) => {
    console.log(chalk.bold.cyan(`\n📋 Agents in profile: ${profileName}\n`));
    
    try {
      const profile = await profileManager.readProfile(profileName);
      if (!profile) {
        console.error(chalk.red(`Profile '${profileName}' not found.`));
        process.exit(1);
      }

      if (profile.agents.length === 0) {
        console.log(chalk.gray('No agents configured.'));
        console.log('Add one with: ' + chalk.cyan(`agent-wizard agent add ${profileName} <tool>`));
        return;
      }

      for (const agent of profile.agents) {
        const status = agent.enabled ? chalk.green('✓') : chalk.red('✗');
        console.log(`  ${status} ${chalk.cyan(agent.name)} (${agent.tool})`);
        
        if (Object.keys(agent.settings).length > 0) {
          console.log(`    Settings:`);
          for (const [key, value] of Object.entries(agent.settings)) {
            console.log(`      ${chalk.gray(key)}: ${chalk.green(JSON.stringify(value))}`);
          }
        }
      }
      
      console.log('');
    } catch (error) {
      console.error(chalk.red('\n❌ Error:'), error);
      process.exit(1);
    }
  });

// Sync command group
const syncCmd = program
  .command('sync')
  .description('Sync profiles with tool configurations');

// Sync profile to tools
syncCmd
  .command('to-tools <profile>')
  .description('Sync profile settings to tool configurations')
  .action(async (profileName: string) => {
    console.log(chalk.bold.cyan(`\n🔄 Syncing profile '${profileName}' to tools...\n`));
    
    try {
      const profile = await profileManager.readProfile(profileName);
      if (!profile) {
        console.error(chalk.red(`Profile '${profileName}' not found.`));
        process.exit(1);
      }

      const { success, failed } = await profileSync.syncProfileToTools(profile);

      if (success.length > 0) {
        console.log(chalk.green('Synced to:'));
        for (const tool of success) {
          console.log(`  ${chalk.green('✓')} ${tool}`);
        }
      }

      if (failed.length > 0) {
        console.log(chalk.red('\nFailed to sync:'));
        for (const tool of failed) {
          console.log(`  ${chalk.red('✗')} ${tool}`);
        }
      }

      console.log('');
    } catch (error) {
      console.error(chalk.red('\n❌ Error:'), error);
      process.exit(1);
    }
  });

// Sync tools to profile
syncCmd
  .command('from-tools')
  .description('Import existing tool configurations to a new profile')
  .option('-n, --name <name>', 'Profile name', 'imported')
  .action(async (options: { name: string }) => {
    console.log(chalk.bold.cyan('\n📥 Importing from tool configurations...\n'));
    
    try {
      const profile = await profileSync.syncToolsToProfile();
      profile.name = options.name;
      
      await profileManager.writeProfile(profile);
      
      console.log(chalk.green(`\n✅ Profile '${profile.name}' created from existing configurations.\n`));
      console.log('Agents imported:');
      for (const agent of profile.agents) {
        console.log(`  ${chalk.green('✓')} ${agent.name} (${agent.tool})`);
      }
      console.log('');
    } catch (error) {
      console.error(chalk.red('\n❌ Error:'), error);
      process.exit(1);
    }
  });

// Status command group
const statusCmd = program
  .command('status')
  .description('Check agent status across all tools');

// Status - all tools
statusCmd
  .command('list')
  .description('Show status of all tools')
  .action(async () => {
    console.log(chalk.bold.cyan('\n📊 Agent Status Overview\n'));
    
    try {
      const data = await statusAdapter.getAllStatuses();
      
      // Summary
      console.log(chalk.bold('Summary:'));
      console.log(`  Active Tools: ${chalk.green(data.activeTools.toString())} / ${data.toolStatuses.length}`);
      console.log(`  Total Agents: ${chalk.green(data.totalAgents.toString())}`);
      console.log(`  Last Updated: ${chalk.gray(data.lastUpdated.toLocaleString())}`);
      
      console.log(chalk.bold('\nTool Status:'));
      
      for (const status of data.toolStatuses) {
        const statusIcon = getStatusIcon(status.status);
        const agentCount = status.agents.length;
        
        console.log(`\n  ${statusIcon} ${chalk.bold(status.toolName)}`);
        console.log(`    Status: ${getStatusColor(status.status)}`);
        console.log(`    Agents: ${chalk.cyan(agentCount.toString())}`);
        console.log(`    Config: ${status.configValid ? chalk.green('Valid ✓') : chalk.red('Invalid ✗')}`);
        
        if (status.details.scopes) {
          console.log(`    Scopes: ${chalk.gray(status.details.scopes.join(', '))}`);
        }
        if (status.details.rules !== undefined) {
          console.log(`    Rules: ${chalk.cyan(status.details.rules.toString())}`);
        }
        if (status.details.profiles !== undefined) {
          console.log(`    Profiles: ${chalk.cyan(status.details.profiles.toString())}`);
        }
        if (status.details.permissions) {
          console.log(`    Permissions: ${chalk.green(status.details.permissions.allow.toString())} allow, ${chalk.red(status.details.permissions.deny.toString())} deny`);
        }
      }
      
      console.log('');
    } catch (error) {
      console.error(chalk.red('\n❌ Error:'), error);
      process.exit(1);
    }
  });

// Status - single tool
statusCmd
  .command('show <tool>')
  .description('Show detailed status for a specific tool')
  .action(async (tool: string) => {
    console.log(chalk.bold.cyan(`\n📊 ${tool} Status\n`));
    
    try {
      const status = await statusAdapter.getToolStatus(tool);
      
      if (!status) {
        console.error(chalk.red(`Unknown tool: ${tool}`));
        console.log('Available tools: openclaw, hermes, claude-code, cursor, copilot, aider');
        process.exit(1);
      }
      
      const statusIcon = getStatusIcon(status.status);
      
      console.log(`  ${statusIcon} ${chalk.bold(status.toolName)}`);
      console.log(`  Status: ${getStatusColor(status.status)}`);
      console.log(`  Config Path: ${chalk.gray(status.configPath)}`);
      console.log(`  Config Valid: ${status.configValid ? chalk.green('Yes ✓') : chalk.red('No ✗')}`);
      console.log(`  Last Checked: ${chalk.gray(status.lastChecked.toLocaleString())}`);
      
      if (status.agents.length > 0) {
        console.log(chalk.bold('\n  Agents:'));
        for (const agent of status.agents) {
          const agentStatus = agent.status === 'active' ? chalk.green('●') : chalk.gray('○');
          console.log(`    ${agentStatus} ${chalk.cyan(agent.name)}`);
          if (agent.model) {
            console.log(`      Model: ${chalk.gray(agent.model)}`);
          }
          if (agent.role) {
            console.log(`      Role: ${chalk.gray(agent.role)}`);
          }
        }
      } else {
        console.log(chalk.gray('\n  No agents configured.'));
      }
      
      // Details
      if (Object.keys(status.details).length > 0) {
        console.log(chalk.bold('\n  Details:'));
        
        if (status.details.scopes) {
          console.log(`    Scopes: ${chalk.gray(status.details.scopes.join(', '))}`);
        }
        if (status.details.mcpServers !== undefined) {
          console.log(`    MCP Servers: ${chalk.cyan(status.details.mcpServers.toString())}`);
        }
        if (status.details.hooks !== undefined) {
          console.log(`    Hooks: ${chalk.cyan(status.details.hooks.toString())}`);
        }
        if (status.details.rules !== undefined) {
          console.log(`    Rules: ${chalk.cyan(status.details.rules.toString())}`);
        }
        if (status.details.profiles !== undefined) {
          console.log(`    Profiles: ${chalk.cyan(status.details.profiles.toString())}`);
        }
        if (status.details.instructions !== undefined) {
          console.log(`    Main Instructions: ${status.details.instructions ? chalk.green('Yes ✓') : chalk.red('No ✗')}`);
        }
        if (status.details.pathInstructions !== undefined) {
          console.log(`    Path Instructions: ${chalk.cyan(status.details.pathInstructions.toString())}`);
        }
        if (status.details.permissions) {
          console.log(`    Permissions Allow: ${chalk.green(status.details.permissions.allow.toString())}`);
          console.log(`    Permissions Deny: ${chalk.red(status.details.permissions.deny.toString())}`);
        }
      }
      
      console.log('');
    } catch (error) {
      console.error(chalk.red('\n❌ Error:'), error);
      process.exit(1);
    }
  });

function getStatusIcon(status: string): string {
  switch (status) {
    case 'active':
      return chalk.green('🟢');
    case 'configured':
      return chalk.yellow('🟡');
    case 'not-configured':
      return chalk.gray('⚪');
    case 'error':
      return chalk.red('🔴');
    default:
      return chalk.gray('⚪');
  }
}

function getStatusColor(status: string): string {
  switch (status) {
    case 'active':
      return chalk.green('Active');
    case 'configured':
      return chalk.yellow('Configured');
    case 'not-configured':
      return chalk.gray('Not Configured');
    case 'error':
      return chalk.red('Error');
    default:
      return chalk.gray('Unknown');
  }
}

program.parse();
