export interface AgentConfig {
  project: ProjectMetadata;
  agents: Agent[];
  skills: Skill[];
  permissions: PermissionConfig;
  hooks: HookConfig;
  mcp: MCPServerConfig[];
}

export interface ProjectMetadata {
  name: string;
  type: ProjectType;
  framework: string[];
  language: string[];
}

export type ProjectType = 'web' | 'mobile' | 'cli' | 'library' | 'api';

export interface Agent {
  id: string;
  name: string;
  role: AgentRole;
  model: string;
  instructions: string;
  tools: string[];
  guardrails: Guardrail[];
}

export type AgentRole = 'reviewer' | 'coder' | 'debugger' | 'tester';

export interface Skill {
  id: string;
  name: string;
  description: string;
  files: string[];
  compatibility: string[];
  quality: QualityScore;
}

export interface QualityScore {
  overall: number;
  documentation: number;
  tested: number;
  maintained: number;
  community: number;
}

export interface Guardrail {
  type: string;
  pattern: string;
  action: 'block' | 'warn';
}

export interface PermissionConfig {
  allow: string[];
  deny: string[];
}

export interface HookConfig {
  preCommit?: string[];
  postCommit?: string[];
  prePush?: string[];
}

export interface MCPServerConfig {
  name: string;
  command: string;
  args: string[];
  env?: Record<string, string>;
}
