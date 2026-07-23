export interface Profile {
  name: string;
  description: string;
  created: string;
  updated: string;
  agents: AgentProfile[];
  permissions: {
    allow: string[];
    deny: string[];
  };
}

export interface AgentProfile {
  id: string;
  name: string;
  tool: string;
  enabled: boolean;
  settings: Record<string, any>;
  custom: Record<string, any>;
}

export interface ProfileManager {
  listProfiles(): Promise<Profile[]>;
  readProfile(name: string): Promise<Profile | null>;
  writeProfile(profile: Profile): Promise<void>;
  deleteProfile(name: string): Promise<void>;
  
  addAgent(profileName: string, agent: AgentProfile): Promise<void>;
  removeAgent(profileName: string, agentId: string): Promise<void>;
  updateAgentSettings(profileName: string, agentId: string, key: string, value: any): Promise<void>;
  
  getDefaultProfile(): Promise<Profile>;
  setDefaultProfile(name: string): Promise<void>;
  
  exportProfile(name: string): Promise<string>;
  importProfile(data: string): Promise<Profile>;
}
