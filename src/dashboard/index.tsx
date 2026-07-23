import React, { useState, useEffect, useCallback } from 'react';
import { Box, Text, useInput, useApp } from 'ink';
import { StatusAdapter } from '../core/status-adapter';
import { AgentStatus, DashboardData } from '../core/status';
import { ToolStatusCard } from './components/ToolStatusCard';
import { AgentDetailPanel } from './components/AgentDetailPanel';

const statusAdapter = new StatusAdapter();

export const Dashboard: React.FC = () => {
  const [data, setData] = useState<DashboardData | null>(null);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [showDetail, setShowDetail] = useState(false);
  const [loading, setLoading] = useState(true);
  const { exit } = useApp();

  const fetchData = useCallback(async () => {
    try {
      const newData = await statusAdapter.getAllStatuses();
      setData(newData);
      setLoading(false);
    } catch (error) {
      console.error('Failed to fetch status:', error);
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 30000); // Refresh every 30 seconds
    return () => clearInterval(interval);
  }, [fetchData]);

  useInput((input, key) => {
    if (input === 'q') {
      exit();
    }

    if (key.upArrow) {
      setSelectedIndex(i => Math.max(0, i - 1));
    }

    if (key.downArrow) {
      setSelectedIndex(i => Math.min((data?.toolStatuses.length || 1) - 1, i + 1));
    }

    if (key.return) {
      setShowDetail(!showDetail);
    }

    if (input === 'r') {
      fetchData();
    }
  });

  if (loading) {
    return (
      <Box flexDirection="column" padding={1}>
        <Text bold color="cyan">
          🧙 AgentWizard Dashboard
        </Text>
        <Text color="gray">Loading...</Text>
      </Box>
    );
  }

  if (!data) {
    return (
      <Box flexDirection="column" padding={1}>
        <Text bold color="red">
          ❌ Failed to load dashboard
        </Text>
      </Box>
    );
  }

  const selectedTool = data.toolStatuses[selectedIndex];

  return (
    <Box flexDirection="column" padding={1}>
      {/* Header */}
      <Box marginBottom={1}>
        <Text bold color="cyan">
          🧙 AgentWizard Dashboard
        </Text>
        <Text color="gray"> | </Text>
        <Text color="gray">
          Last updated: {data.lastUpdated.toLocaleString()}
        </Text>
      </Box>

      {/* Summary */}
      <Box marginBottom={1} flexDirection="row" gap={2}>
        <Text>
          Active Tools: <Text color="green">{data.activeTools}</Text> / {data.toolStatuses.length}
        </Text>
        <Text>
          Total Agents: <Text color="cyan">{data.totalAgents}</Text>
        </Text>
      </Box>

      {/* Tool Status Grid */}
      {!showDetail ? (
        <Box flexDirection="column">
          <Box flexDirection="row" flexWrap="wrap" gap={1}>
            {data.toolStatuses.map((status, index) => (
              <ToolStatusCard
                key={status.tool}
                status={status}
                selected={index === selectedIndex}
              />
            ))}
          </Box>
        </Box>
      ) : (
        /* Agent Detail Panel */
        <AgentDetailPanel status={selectedTool} />
      )}

      {/* Footer */}
      <Box marginTop={1} flexDirection="row" gap={1}>
        <Text color="gray">
          [↑↓] Navigate
        </Text>
        <Text color="gray">
          [Enter] {showDetail ? 'Back' : 'Details'}
        </Text>
        <Text color="gray">
          [r] Refresh
        </Text>
        <Text color="gray">
          [q] Quit
        </Text>
      </Box>
    </Box>
  );
};
