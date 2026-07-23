#!/usr/bin/env node

import { Command } from 'commander';
import chalk from 'chalk';
import { ConfigWizard } from '../core/wizard';
import { ProjectDetector } from '../core/detector';
import { OpenClawAdapter } from '../adapters/openclaw';
import { HermesAdapter } from '../adapters/hermes';
import { ClaudeCodeAdapter } from '../adapters/claude-code';
import { CursorAdapter } from '../adapters/cursor';
import { CopilotAdapter } from '../adapters/copilot';
import { AiderAdapter } from '../adapters/aider';

const program = new Command();

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

program.parse();
