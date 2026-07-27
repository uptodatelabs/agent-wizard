import React from 'react';
import { Box, Text } from 'ink';
import { AgentStatus } from '../../core/status';

interface AgentDetailPanelProps {
  status: AgentStatus;
  selectedAgentIndex?: number;
}

export const AgentDetailPanel: React.FC<AgentDetailPanelProps> = ({ status, selectedAgentIndex = -1 }) => {
  const getStatusColor = (status: string): string => {
    switch (status) {
      case 'active':
        return 'green';
      case 'configured':
        return 'yellow';
      case 'not-configured':
        return 'gray';
      case 'error':
        return 'red';
      default:
        return 'gray';
    }
  };

  const getStatusLabel = (status: string): string => {
    switch (status) {
      case 'active':
        return 'Active';
      case 'configured':
        return 'Configured';
      case 'not-configured':
        return 'Not Configured';
      case 'error':
        return 'Error';
      default:
        return 'Unknown';
    }
  };

  return (
    <Box flexDirection="column" borderStyle="round" borderColor="cyan" padding={1}>
      {/* Header */}
      <Box marginBottom={1}>
        <Text bold color="cyan">
          📊 {status.toolName} - Agent Details
        </Text>
      </Box>

      {/* Basic Info */}
      <Box flexDirection="column" marginBottom={1}>
        <Box>
          <Text color="gray">Status: </Text>
          <Text color={getStatusColor(status.status)}>
            {getStatusLabel(status.status)}
          </Text>
        </Box>
        <Box>
          <Text color="gray">Config Path: </Text>
          <Text color="gray">{status.configPath}</Text>
        </Box>
        <Box>
          <Text color="gray">Config Valid: </Text>
          <Text color={status.configValid === null ? 'gray' : status.configValid ? 'green' : 'red'}>
            {status.configValid === null ? 'N/A' : status.configValid ? 'Yes ✓' : 'No ✗'}
          </Text>
        </Box>
      </Box>

      {/* Agents Table */}
      {status.agents.length > 0 ? (
        <Box flexDirection="column" marginBottom={1}>
          <Text bold color="white">
            🤖 Agents ({status.agents.length})
          </Text>
          <Box marginTop={1} flexDirection="column" gap={1}>
            {status.agents.map((agent, index) => (
              <Box key={agent.id} flexDirection="row" gap={1}>
                <Text color={index === selectedAgentIndex ? 'green' : 'gray'}>
                  {index === selectedAgentIndex ? '▶ ' : '  '}
                </Text>
                <Text color="gray">{index + 1}.</Text>
                <Text color="cyan">{agent.name}</Text>
                <Text color={agent.builtin ? 'gray' : 'magenta'}>
                  {agent.builtin ? '[기본]' : '[사용자]'}
                </Text>
                <Text color="gray">{agent.model || '-'}</Text>
                <Text color={agent.status === 'active' ? 'green' : 'gray'}>
                  {agent.status === 'active' ? '● Active' : '○ Inactive'}
                </Text>
              </Box>
            ))}
          </Box>
        </Box>
      ) : (
        <Box marginBottom={1}>
          <Text color="gray">No agents configured.</Text>
        </Box>
      )}

      {/* Details */}
      {Object.keys(status.details).length > 0 && (
        <Box flexDirection="column">
          <Text bold color="white">
            📋 Details
          </Text>
          <Box marginTop={1} flexDirection="column" gap={1}>
            {status.details.scopes && (
              <Box>
                <Text color="gray">Scopes: </Text>
                <Text color="gray">{status.details.scopes.join(', ')}</Text>
              </Box>
            )}
            {status.details.mcpServers !== undefined && (
              <Box>
                <Text color="gray">MCP Servers: </Text>
                <Text color="cyan">{status.details.mcpServers}</Text>
              </Box>
            )}
            {status.details.hooks !== undefined && (
              <Box>
                <Text color="gray">Hooks: </Text>
                <Text color="cyan">{status.details.hooks}</Text>
              </Box>
            )}
            {status.details.rules !== undefined && (
              <Box>
                <Text color="gray">Rules: </Text>
                <Text color="cyan">{status.details.rules}</Text>
              </Box>
            )}
            {status.details.profiles !== undefined && (
              <Box>
                <Text color="gray">Profiles: </Text>
                <Text color="cyan">{status.details.profiles}</Text>
              </Box>
            )}
            {status.details.instructions !== undefined && (
              <Box>
                <Text color="gray">Main Instructions: </Text>
                <Text color={status.details.instructions ? 'green' : 'red'}>
                  {status.details.instructions ? 'Yes ✓' : 'No ✗'}
                </Text>
              </Box>
            )}
            {status.details.pathInstructions !== undefined && (
              <Box>
                <Text color="gray">Path Instructions: </Text>
                <Text color="cyan">{status.details.pathInstructions}</Text>
              </Box>
            )}
            {status.details.permissions && (
              <Box>
                <Text color="gray">Permissions: </Text>
                <Text color="green">{status.details.permissions.allow} allow</Text>
                <Text color="gray">, </Text>
                <Text color="red">{status.details.permissions.deny} deny</Text>
              </Box>
            )}
          </Box>
        </Box>
      )}
    </Box>
  );
};
