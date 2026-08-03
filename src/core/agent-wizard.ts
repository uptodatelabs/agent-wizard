import { AgentConfig } from './types';
import { ProjectDetector, ProjectInfo } from './detector';
import { ConfigWizard, WizardOptions } from './wizard';

export interface AgentWizardResult {
  projectInfo: ProjectInfo;
  selectedTools: string[];
  config: AgentConfig;
}

/**
 * High-level facade over the AgentWizard pipeline.
 *
 * Previously this class was an empty stub. It now delegates to the real
 * implementation (ProjectDetector + ConfigWizard) so the public API in
 * `index.ts` (`AgentWizard`) is functional rather than a no-op.
 */
export class AgentWizard {
  private detector = new ProjectDetector();
  private wizard = new ConfigWizard();
  private config: AgentConfig | null = null;

  async detect(): Promise<ProjectInfo> {
    this.config = null;
    return this.detector.detect();
  }

  async configure(): Promise<AgentWizardResult> {
    const options: WizardOptions = await this.wizard.run();
    this.config = options.config;
    return {
      projectInfo: options.projectInfo,
      selectedTools: options.selectedTools,
      config: options.config,
    };
  }

  async writeConfig(result: AgentWizardResult): Promise<void> {
    await this.wizard.writeConfig(result.config, result.selectedTools);
    this.config = result.config;
  }

  async validate(): Promise<boolean> {
    if (!this.config) {
      return false;
    }
    // Reuse the per-adapter validators via the wizard's adapters.
    const { OpenClawAdapter } = await import('../adapters/openclaw.js');
    const { HermesAdapter } = await import('../adapters/hermes.js');
    const { ClaudeCodeAdapter } = await import('../adapters/claude-code.js');
    const { CursorAdapter } = await import('../adapters/cursor.js');
    const { CopilotAdapter } = await import('../adapters/copilot.js');
    const { AiderAdapter } = await import('../adapters/aider.js');

    const adapters = [
      new OpenClawAdapter(),
      new HermesAdapter(),
      new ClaudeCodeAdapter(),
      new CursorAdapter(),
      new CopilotAdapter(),
      new AiderAdapter(),
    ];

    for (const adapter of adapters) {
      const detected = await adapter.detect();
      if (detected) {
        const result = await adapter.validate();
        if (!result.valid) {
          return false;
        }
      }
    }
    return true;
  }

  getConfig(): AgentConfig | null {
    return this.config;
  }

  /** Read-only status across all supported tools (see StatusAdapter). */
  async getStatus(): Promise<import('./status').DashboardData> {
    const { StatusAdapter } = await import('./status-adapter.js');
    return new StatusAdapter().getAllStatuses();
  }

  /** List saved profiles (read-only convenience over ProfileManager). */
  async listProfiles(): Promise<import('./profile').Profile[]> {
    const { ProfileManagerImpl } = await import('./profile-manager.js');
    return new ProfileManagerImpl().listProfiles();
  }
}
