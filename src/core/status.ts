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
  /** true when this is a built-in/default agent for the tool (e.g. a Hermes
   *  built-in personality). Omitted for tools that don't distinguish. */
  builtin?: boolean;
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
