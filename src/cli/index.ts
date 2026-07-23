#!/usr/bin/env node

import { Command } from 'commander';
import { AgentWizard } from '../core/agent-wizard';

const program = new Command();
const wizard = new AgentWizard();

program
  .name('agent-wizard')
  .description('AI coding assistant configuration wizard')
  .version('0.1.0');

program
  .command('init')
  .description('Initialize project configuration')
  .action(async () => {
    console.log('Initializing project...');
    await wizard.configure();
    console.log('Done!');
  });

program
  .command('detect')
  .description('Detect project type and tech stack')
  .action(async () => {
    console.log('Detecting project...');
    await wizard.detect();
  });

program
  .command('configure')
  .description('Interactive configuration wizard')
  .action(async () => {
    console.log('Starting configuration wizard...');
    await wizard.configure();
    console.log('Configuration complete!');
  });

program
  .command('validate')
  .description('Validate configuration')
  .action(async () => {
    const valid = await wizard.validate();
    console.log(valid ? 'Configuration is valid!' : 'Configuration is invalid!');
    process.exit(valid ? 0 : 1);
  });

program.parse();
