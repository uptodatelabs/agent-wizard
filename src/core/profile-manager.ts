import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import * as yaml from 'yaml';
import { Profile, AgentProfile } from './profile';

export class ProfileManagerImpl {
  private readonly globalDir: string;
  private readonly localDir: string;
  private readonly profilesDir = 'profiles';
  private readonly defaultProfileFile = 'default-profile.txt';

  constructor() {
    this.globalDir = path.join(os.homedir(), '.agent-wizard');
    this.localDir = path.join(process.cwd(), '.agent-wizard');
  }

  async listProfiles(): Promise<Profile[]> {
    const profiles: Profile[] = [];
    
    // Check local first, then global
    const dirs = [this.localDir, this.globalDir];
    
    for (const dir of dirs) {
      try {
        const profilesDir = path.join(dir, this.profilesDir);
        const entries = await fs.readdir(profilesDir, { withFileTypes: true });
        
        for (const entry of entries) {
          if (entry.isDirectory()) {
            const profile = await this.readProfileFromDir(path.join(profilesDir, entry.name));
            if (profile && !profiles.find(p => p.name === profile.name)) {
              profiles.push(profile);
            }
          }
        }
      } catch {
        // Directory doesn't exist
      }
    }

    return profiles;
  }

  async readProfile(name: string): Promise<Profile | null> {
    // Check local first, then global
    const dirs = [this.localDir, this.globalDir];
    
    for (const dir of dirs) {
      try {
        const profilesDir = path.join(dir, this.profilesDir, name);
        const profile = await this.readProfileFromDir(profilesDir);
        if (profile) {
          return profile;
        }
      } catch {
        // Continue
      }
    }

    return null;
  }

  private async readProfileFromDir(dir: string): Promise<Profile | null> {
    try {
      const profilePath = path.join(dir, 'profile.yaml');
      const content = await fs.readFile(profilePath, 'utf-8');
      return yaml.parse(content) as Profile;
    } catch {
      return null;
    }
  }

  async writeProfile(profile: Profile): Promise<void> {
    const dir = await this.getProfileDir(profile.name);
    await fs.mkdir(dir, { recursive: true });
    
    const profilePath = path.join(dir, 'profile.yaml');
    const content = yaml.stringify(profile);
    await fs.writeFile(profilePath, content);
  }

  async deleteProfile(name: string): Promise<void> {
    const dir = await this.getProfileDir(name);
    await fs.rm(dir, { recursive: true, force: true });
  }

  private async getProfileDir(name: string): Promise<string> {
    // Write to local if it already exists, otherwise fall back to global
    const localProfilesDir = path.join(this.localDir, this.profilesDir);
    try {
      await fs.access(localProfilesDir);
      return path.join(this.localDir, this.profilesDir, name);
    } catch {
      return path.join(this.globalDir, this.profilesDir, name);
    }
  }

  async addAgent(profileName: string, agent: AgentProfile): Promise<void> {
    const profile = await this.readProfile(profileName);
    if (!profile) {
      throw new Error(`Profile '${profileName}' not found`);
    }

    // Check if agent already exists
    const existingIndex = profile.agents.findIndex(a => a.id === agent.id);
    if (existingIndex >= 0) {
      throw new Error(`Agent '${agent.id}' already exists in profile '${profileName}'`);
    }

    profile.agents.push(agent);
    profile.updated = new Date().toISOString();
    await this.writeProfile(profile);
  }

  async removeAgent(profileName: string, agentId: string): Promise<void> {
    const profile = await this.readProfile(profileName);
    if (!profile) {
      throw new Error(`Profile '${profileName}' not found`);
    }

    const index = profile.agents.findIndex(a => a.id === agentId);
    if (index < 0) {
      throw new Error(`Agent '${agentId}' not found in profile '${profileName}'`);
    }

    profile.agents.splice(index, 1);
    profile.updated = new Date().toISOString();
    await this.writeProfile(profile);
  }

  async updateAgentSettings(profileName: string, agentId: string, key: string, value: any): Promise<void> {
    const profile = await this.readProfile(profileName);
    if (!profile) {
      throw new Error(`Profile '${profileName}' not found`);
    }

    const agent = profile.agents.find(a => a.id === agentId);
    if (!agent) {
      throw new Error(`Agent '${agentId}' not found in profile '${profileName}'`);
    }

    // Support nested keys with dot notation
    const keys = key.split('.');
    let current: any = agent.settings;
    
    for (let i = 0; i < keys.length - 1; i++) {
      if (!current[keys[i]]) {
        current[keys[i]] = {};
      }
      current = current[keys[i]];
    }
    
    current[keys[keys.length - 1]] = value;
    
    profile.updated = new Date().toISOString();
    await this.writeProfile(profile);
  }

  async getDefaultProfile(): Promise<Profile> {
    // Read default profile name
    let defaultName = 'default';
    
    try {
      const defaultPath = path.join(this.globalDir, this.defaultProfileFile);
      defaultName = await fs.readFile(defaultPath, 'utf-8');
    } catch {
      // Use default
    }

    let profile = await this.readProfile(defaultName);
    if (!profile) {
      // Create default profile
      profile = this.createDefaultProfile(defaultName);
      await this.writeProfile(profile);
    }

    return profile;
  }

  async setDefaultProfile(name: string): Promise<void> {
    const profile = await this.readProfile(name);
    if (!profile) {
      throw new Error(`Profile '${name}' not found`);
    }

    await fs.mkdir(this.globalDir, { recursive: true });
    const defaultPath = path.join(this.globalDir, this.defaultProfileFile);
    await fs.writeFile(defaultPath, name);
  }

  private createDefaultProfile(name: string): Profile {
    return {
      name,
      description: '기본 프로파일',
      created: new Date().toISOString(),
      updated: new Date().toISOString(),
      agents: [],
      permissions: {
        allow: [],
        deny: [],
      },
    };
  }

  async exportProfile(name: string): Promise<string> {
    const profile = await this.readProfile(name);
    if (!profile) {
      throw new Error(`Profile '${name}' not found`);
    }

    return yaml.stringify(profile);
  }

  async importProfile(data: string): Promise<Profile> {
    const profile = yaml.parse(data) as Profile;
    
    // Validate
    if (!profile.name) {
      throw new Error('Profile must have a name');
    }

    // Update timestamp
    profile.updated = new Date().toISOString();
    
    await this.writeProfile(profile);
    return profile;
  }

  async getAgentDefaultSettings(tool: string): Promise<Record<string, any>> {
    const defaults: Record<string, any> = {
      openclaw: {
        model: 'anthropic/claude-sonnet-4-6',
        workspace: '~/.openclaw/workspace',
      },
      hermes: {
        model: 'anthropic/claude-opus-4.6',
        reasoning_effort: 'medium',
        terminal: {
          backend: 'local',
          timeout: 180,
        },
      },
      'claude-code': {
        model: 'claude-sonnet-4-20250514',
      },
      cursor: {},
      copilot: {},
      aider: {
        model: 'sonnet',
        architect: false,
      },
    };

    return defaults[tool] || {};
  }

  async createAgentProfile(profileName: string, tool: string, name?: string): Promise<AgentProfile> {
    const defaults = await this.getAgentDefaultSettings(tool);
    
    const agent: AgentProfile = {
      id: tool,
      name: name || `${tool} Agent`,
      tool,
      enabled: true,
      settings: defaults,
      custom: {},
    };

    await this.addAgent(profileName, agent);
    return agent;
  }
}
