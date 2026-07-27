export type ToolStatus = 'active' | 'configured' | 'not-configured' | 'error';

export interface AgentStatus {
  tool: string;
  toolName: string;
  status: ToolStatus;
  agents: AgentInfo[];
  configValid: boolean | null;
  configPath: string;
  lastChecked: Date;
  details: ToolDetails;
}

export interface AgentInfo {
  id: string;
  name: string;
  model?: string;
  role?: string;
  enabled: boolean;
  status: 'active' | 'inactive';
  config?: Record<string, any>;
}

export interface ToolDetails {
  scopes?: string[];
  mcpServers?: number;
  hooks?: number;
  rules?: number;
  permissions?: { allow: number; deny: number };
  profiles?: number;
  instructions?: boolean;
  pathInstructions?: number;
}

export interface DashboardData {
  toolStatuses: AgentStatus[];
  totalAgents: number;
  activeTools: number;
  lastUpdated: Date;
}
