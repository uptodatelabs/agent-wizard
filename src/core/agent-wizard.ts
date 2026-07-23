import { AgentConfig } from './types';

export class AgentWizard {
  private config: AgentConfig | null = null;

  async detect(): Promise<void> {
    console.log('Detecting project...');
  }

  async configure(): Promise<void> {
    console.log('Configuring agent...');
  }

  async validate(): Promise<boolean> {
    return true;
  }

  getConfig(): AgentConfig | null {
    return this.config;
  }
}
