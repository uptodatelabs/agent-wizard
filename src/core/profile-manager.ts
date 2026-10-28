import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import * as yaml from 'yaml';
import { backupFile } from './backup';
import { Profile, AgentProfile } from './profile';
import { isSupportedTool, SUPPORTED_TOOLS } from './tools';
import { DEFAULT_MODELS } from './models';
import { parseProfile } from '../schemas/profile-schema';

/** Validate a profile name used as a directory name. Returns an error message
 *  or null when valid. Guards against path traversal (`..`, separators) and
 *  control characters. */
export function validateProfileName(name: string): string | null {
  if (typeof name !== 'string' || name.trim().length === 0) {
    return 'Profile name must not be empty';
  }
  if (name === '.' || name === '..') {
    return `Invalid profile name '${name}'`;
  }
  if (name.includes('/') || name.includes('\\')) {
    return 'Profile name must not contain path separators';
  }
  for (const ch of name) {
    const code = ch.charCodeAt(0);
    if (code < 0x20 || code === 0x7f) {
      return 'Profile name must not contain control characters';
    }
  }
  if (name !== name.trim()) {
    return 'Profile name must not have leading or trailing whitespace';
  }
  return null;
}

export class ProfileManagerImpl {
  private readonly globalDir: string;
  private readonly localDir: string;
  private readonly profilesDir = 'profiles';
  private readonly defaultProfileFile = 'default-profile.txt';

  constructor() {
    this.globalDir = path.join(os.homedir(), '.agent-wizard');
    this.localDir = path.join(process.cwd(), '.agent-wizard');
  }

  private assertValidProfileName(name: string): void {
    const error = validateProfileName(name);
    if (error) {
      throw new Error(error);
    }
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
    this.assertValidProfileName(name);

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
      // Runtime-validate instead of casting: a hand-edited or truncated
      // profile used to make `profile.agents.length` throw a TypeError and
      // take down every CLI command.
      const { profile } = parseProfile(yaml.parse(content));
      return profile;
    } catch {
      return null;
    }
  }

  async writeProfile(profile: Profile): Promise<void> {
    this.assertValidProfileName(profile.name);
    const dir = await this.getProfileDir(profile.name);
    await fs.mkdir(dir, { recursive: true });
    
    const profilePath = path.join(dir, 'profile.yaml');
    const content = yaml.stringify(profile);
    await backupFile(profilePath);
    await fs.writeFile(profilePath, content);
  }

  async deleteProfile(name: string): Promise<void> {
    this.assertValidProfileName(name);
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
      // Trim: a trailing newline in a hand-edited file used to produce a
      // 'Profile not found' error for a name that exists.
      const raw = (await fs.readFile(defaultPath, 'utf-8')).trim();
      if (raw.length > 0) defaultName = raw;
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
    this.assertValidProfileName(name);
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
    this.assertValidProfileName(name);
    const profile = await this.readProfile(name);
    if (!profile) {
      throw new Error(`Profile '${name}' not found`);
    }

    return yaml.stringify(profile);
  }

  async importProfile(data: string): Promise<Profile> {
    const parsed = yaml.parse(data) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('Profile data must be a YAML mapping');
    }

    const { profile, result } = parseProfile(parsed);
    if (!profile) {
      throw new Error(`Invalid profile: ${result.errors.join('; ')}`);
    }

    // Update timestamp
    profile.updated = new Date().toISOString();

    await this.writeProfile(profile);
    return profile;
  }

  async getAgentDefaultSettings(tool: string): Promise<Record<string, any>> {
    // Model names come from `models.ts` so the wizard's first choice and the
    // profile default can never drift apart (they previously differed).
    const defaults: Record<string, any> = {
      openclaw: {
        model: DEFAULT_MODELS.openclaw,
        workspace: '~/.openclaw/workspace',
      },
      hermes: {
        model: DEFAULT_MODELS.hermes,
        reasoning_effort: 'medium',
        terminal: {
          backend: 'local',
          timeout: 180,
        },
      },
      'claude-code': {
        model: DEFAULT_MODELS['claude-code'],
      },
      cursor: {},
      copilot: {},
      aider: {
        model: DEFAULT_MODELS.aider,
        architect: false,
      },
    };

    return defaults[tool] || {};
  }

  /** Turn a display name into an id-safe slug. */
  private slugifyName(value: string): string {
    return value
      .toLowerCase()
      .replace(/[^a-z0-9._-]+/g, '-')
      .replace(/^-+|-+$/g, '');
  }

  /**
   * Add an agent for `tool`.
   *
   * The id defaults to the tool name (so existing profiles/tests keep their
   * ids), but a *second* agent for the same tool now gets a unique id instead
   * of being rejected. Before this, "one fast Claude agent + one architect
   * Claude agent" was impossible from the CLI even though the editor port
   * already accepted arbitrary ids.
   */
  async createAgentProfile(profileName: string, tool: string, name?: string): Promise<AgentProfile> {
    if (!isSupportedTool(tool)) {
      throw new Error(
        `Unsupported tool '${tool}'. Supported tools: ${SUPPORTED_TOOLS.join(', ')}`,
      );
    }

    const profile = await this.readProfile(profileName);
    if (!profile) {
      throw new Error(`Profile '${profileName}' not found`);
    }

    const slug = name ? this.slugifyName(name) : '';
    const baseId = slug ? `${tool}-${slug}` : tool;
    let id = baseId;
    let suffix = 2;
    while (profile.agents.some((a) => a.id === id)) {
      id = `${baseId}-${suffix}`;
      suffix += 1;
    }

    const defaults = await this.getAgentDefaultSettings(tool);
    const agent: AgentProfile = {
      id,
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
