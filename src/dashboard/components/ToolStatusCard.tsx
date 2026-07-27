import React from 'react';
import { Box, Text } from 'ink';
import { AgentStatus } from '../../core/status';

interface ToolStatusCardProps {
  status: AgentStatus;
  selected: boolean;
}

export const ToolStatusCard: React.FC<ToolStatusCardProps> = ({ status, selected }) => {
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

  const getStatusIcon = (status: string): string => {
    switch (status) {
      case 'active':
        return '🟢';
      case 'configured':
        return '🟡';
      case 'not-configured':
        return '⚪';
      case 'error':
        return '🔴';
      default:
        return '⚪';
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

  const borderColor = selected ? 'cyan' : 'gray';

  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor={borderColor}
      padding={1}
      width={30}
    >
      {/* Tool Name */}
      <Text bold color={selected ? 'cyan' : 'white'}>
        {getStatusIcon(status.status)} {status.toolName}
      </Text>

      {/* Status */}
      <Box marginTop={1}>
        <Text color="gray">Status: </Text>
        <Text color={getStatusColor(status.status)}>
          {getStatusLabel(status.status)}
        </Text>
      </Box>

      {/* Agent Count */}
      <Box>
        <Text color="gray">Agents: </Text>
        <Text color="cyan">{status.agents.length}</Text>
      </Box>

      {/* Config Status - only when a config file is expected/present */}
      {status.configValid !== null && (
        <Box>
          <Text color="gray">Config: </Text>
          <Text color={status.configValid ? 'green' : 'red'}>
            {status.configValid ? 'Valid ✓' : 'Invalid ✗'}
          </Text>
        </Box>
      )}

      {/* Additional Details */}
      {status.details.scopes && (
        <Box>
          <Text color="gray">Scopes: </Text>
          <Text color="gray">{status.details.scopes.join(', ')}</Text>
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

      {status.details.permissions && (
        <Box>
          <Text color="gray">Perms: </Text>
          <Text color="green">{status.details.permissions.allow}</Text>
          <Text color="gray">/</Text>
          <Text color="red">{status.details.permissions.deny}</Text>
        </Box>
      )}
    </Box>
  );
};
