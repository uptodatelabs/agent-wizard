import React, { useState, useEffect, useCallback } from 'react';
import { Box, Text, useInput, useApp } from 'ink';
import { StatusAdapter } from '../core/status-adapter';
import { DashboardData } from '../core/status';
import { createAgentEditor, AgentEditorPort } from '../core/agent-editor';
import { ToolStatusCard } from './components/ToolStatusCard';
import { AgentDetailPanel } from './components/AgentDetailPanel';
import { AgentEditorPanel } from './components/AgentEditorPanel';

const statusAdapter = new StatusAdapter();

type View = 'tools' | 'agents' | 'editor';

export const Dashboard: React.FC = () => {
  const [data, setData] = useState<DashboardData | null>(null);
  const [toolIndex, setToolIndex] = useState(0);
  const [agentIndex, setAgentIndex] = useState(0);
  const [view, setView] = useState<View>('tools');
  const [loading, setLoading] = useState(true);
  const [editor, setEditor] = useState<AgentEditorPort | null>(null);
  const [editorAgentId, setEditorAgentId] = useState('');
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
    const interval = setInterval(fetchData, 30000);
    return () => clearInterval(interval);
  }, [fetchData]);

  useInput((input, key) => {
    if (input === 'q') {
      if (view === 'tools') {
        exit();
      } else {
        // step back one level
        if (view === 'editor') setView('agents');
        else if (view === 'agents') setView('tools');
        setAgentIndex(0);
      }
      return;
    }

    if (key.return) {
      if (view === 'tools') {
        const tool = data?.toolStatuses[toolIndex];
        if (tool && (tool.agents.length > 0 || tool.status !== 'not-configured')) {
          const ed = createAgentEditor(tool.tool);
          if (ed) {
            setEditor(ed);
            setView('agents');
            setAgentIndex(0);
          }
        }
      } else if (view === 'agents') {
        const tool = data?.toolStatuses[toolIndex];
        const agent = tool?.agents[agentIndex];
        if (tool && agent && editor) {
          setEditorAgentId(agent.id);
          setView('editor');
        }
      }
      return;
    }

    if (view === 'tools') {
      if (key.upArrow) setToolIndex((i) => Math.max(0, i - 1));
      if (key.downArrow) setToolIndex((i) => Math.min((data?.toolStatuses.length || 1) - 1, i + 1));
      if (input === 'r') fetchData();
    } else if (view === 'agents') {
      const count = data?.toolStatuses[toolIndex]?.agents.length || 0;
      if (key.upArrow) setAgentIndex((i) => Math.max(0, i - 1));
      if (key.downArrow) setAgentIndex((i) => Math.min(count - 1, i + 1));
    }
  });

  if (loading) {
    return (
      <Box flexDirection="column" padding={1}>
        <Text bold color="cyan">🧙 AgentWizard Dashboard</Text>
        <Text color="gray">Loading...</Text>
      </Box>
    );
  }

  if (!data) {
    return (
      <Box flexDirection="column" padding={1}>
        <Text bold color="red">❌ Failed to load dashboard</Text>
      </Box>
    );
  }

  const selectedTool = data.toolStatuses[toolIndex];

  return (
    <Box flexDirection="column" padding={1}>
      <Box marginBottom={1}>
        <Text bold color="cyan">🧙 AgentWizard Dashboard</Text>
        <Text color="gray"> | </Text>
        <Text color="gray">Last updated: {data.lastUpdated.toLocaleString()}</Text>
      </Box>

      <Box marginBottom={1} flexDirection="row" gap={2}>
        <Text>
          Active Tools: <Text color="green">{data.activeTools}</Text> / {data.toolStatuses.length}
        </Text>
        <Text>
          Total Agents: <Text color="cyan">{data.totalAgents}</Text>
        </Text>
      </Box>

      {view === 'tools' && (
        <Box flexDirection="column">
          <Box flexDirection="row" flexWrap="wrap" gap={1}>
            {data.toolStatuses.map((status, index) => (
              <ToolStatusCard key={status.tool} status={status} selected={index === toolIndex} />
            ))}
          </Box>
        </Box>
      )}

      {view === 'agents' && (
        <AgentDetailPanel
          status={selectedTool}
          selectedAgentIndex={agentIndex}
        />
      )}

      {view === 'editor' && editor && (
        <AgentEditorPanel
          editor={editor}
          agentId={editorAgentId}
          onBack={() => setView('agents')}
          onChanged={() => fetchData()}
        />
      )}

      <Box marginTop={1} flexDirection="row" gap={1}>
        {view === 'tools' ? (
          <>
            <Text color="gray">[↑↓] Navigate</Text>
            <Text color="gray">[Enter] {selectedTool.agents.length > 0 ? 'Agents' : 'Details'}</Text>
            <Text color="gray">[r] Refresh</Text>
            <Text color="gray">[q] Quit</Text>
          </>
        ) : view === 'agents' ? (
          <>
            <Text color="gray">[↑↓] Select agent</Text>
            <Text color="gray">[Enter] Edit</Text>
            <Text color="gray">[q] Back</Text>
          </>
        ) : (
          <Text color="gray">[q] Back to agents</Text>
        )}
      </Box>
    </Box>
  );
};
