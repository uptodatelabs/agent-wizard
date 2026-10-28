import React from 'react';
import { Box, Text } from 'ink';
import type { AgentStatus } from '../../core/status';
import type { ThemeColors } from '../../tui/theme';
import { Panel } from '../../tui/components/Panel';
import { StatusBadge } from '../../tui/components/StatusBadge';
import { windowRows } from '../../tui/hooks/useTerminalSize';
import { glyph, theme, truncate } from '../../tui/theme';

export interface AgentDetailPanelProps {
  status: AgentStatus;
  selectedAgentIndex?: number;
  /** Rows to draw before the agent table scrolls. */
  capacity?: number;
}

interface DetailRow {
  label: string;
  value: string;
  tone: keyof ThemeColors;
}

/**
 * Agent table + tool metadata for the highlighted tool.
 *
 * All colour, glyph and alignment comes from `src/tui/theme.ts`: the previous
 * version carried its own `getStatusColor`/`getStatusLabel` copies, which is
 * exactly what let the badge and this panel disagree about the same status.
 *
 * The agent table is windowed so a tool with 40 agents cannot push the footer
 * past the bottom of the terminal.
 */
export const AgentDetailPanel: React.FC<AgentDetailPanelProps> = ({
  status,
  selectedAgentIndex = -1,
  capacity = 10,
}) => {
  const { visible, offset, hidden } = windowRows(status.agents, Math.max(0, selectedAgentIndex), capacity);
  const above = offset;
  const below = hidden - above;

  const rows: DetailRow[] = [];
  if (status.details.scopes && status.details.scopes.length > 0) {
    rows.push({ label: 'scopes', value: status.details.scopes.join(', '), tone: 'muted' });
  }
  if (status.details.mcpServers !== undefined) {
    rows.push({ label: 'mcp servers', value: String(status.details.mcpServers), tone: 'brand' });
  }
  if (status.details.hooks !== undefined) {
    rows.push({ label: 'hooks', value: String(status.details.hooks), tone: 'brand' });
  }
  if (status.details.rules !== undefined) {
    rows.push({ label: 'rules', value: String(status.details.rules), tone: 'brand' });
  }
  if (status.details.profiles !== undefined) {
    rows.push({ label: 'profiles', value: String(status.details.profiles), tone: 'brand' });
  }
  if (status.details.instructions !== undefined) {
    rows.push({
      label: 'instructions',
      value: status.details.instructions ? 'present' : 'missing',
      tone: status.details.instructions ? 'success' : 'danger',
    });
  }
  if (status.details.pathInstructions !== undefined) {
    rows.push({ label: 'path rules', value: String(status.details.pathInstructions), tone: 'brand' });
  }
  if (status.details.permissions) {
    rows.push({
      label: 'permissions',
      value: `${status.details.permissions.allow} allow ${glyph.sep} ${status.details.permissions.deny} deny`,
      tone: 'muted',
    });
  }

  return (
    <Panel
      title={status.toolName}
      subtitle={`${glyph.sep} ${status.agents.length} ${status.agents.length === 1 ? 'agent' : 'agents'}`}
      focused
    >
      <Box>
        <StatusBadge status={status.status} />
        <Text color={theme.muted}> {glyph.sep} config </Text>
        <Text
          color={
            status.configValid === null ? theme.muted : status.configValid ? theme.success : theme.danger
          }
        >
          {status.configValid === null ? 'n/a' : status.configValid ? 'valid' : 'invalid'}
        </Text>
      </Box>
      <Box>
        <Text color={theme.muted}>path </Text>
        <Text color={theme.muted}>{status.configPath}</Text>
      </Box>

      <Box flexDirection="column" marginTop={1}>
        {status.agents.length === 0 ? (
          <Text color={theme.muted}>No agents configured — nothing to edit here.</Text>
        ) : (
          <>
            {above > 0 && <Text color={theme.muted}> ↑ {above} more</Text>}
            {visible.map((agent, position) => {
              const index = offset + position;
              const selected = index === selectedAgentIndex;
              return (
                <Box key={agent.id}>
                  <Box width={2}>
                    <Text color={theme.brand}>{selected ? glyph.pointer : ' '}</Text>
                  </Box>
                  <Box width={3}>
                    <Text color={theme.muted}>{index + 1}.</Text>
                  </Box>
                  <Box width={24}>
                    <Text bold={selected} color={selected ? theme.brand : theme.text}>
                      {truncate(agent.name, 23)}
                    </Text>
                  </Box>
                  <Box width={10}>
                    <Text color={agent.builtin ? theme.muted : theme.accent}>
                      {agent.builtin ? 'builtin' : 'custom'}
                    </Text>
                  </Box>
                  <Box width={18}>
                    <Text color={theme.muted}>{truncate(agent.model ?? '-', 17)}</Text>
                  </Box>
                  <Text color={agent.status === 'active' ? theme.success : theme.muted}>
                    {agent.status === 'active' ? `${glyph.dotOn} active` : `${glyph.dotOff} inactive`}
                  </Text>
                </Box>
              );
            })}
            {below > 0 && <Text color={theme.muted}> ↓ {below} more</Text>}
          </>
        )}
      </Box>

      {rows.length > 0 && (
        <Box flexDirection="column" marginTop={1}>
          <Text bold color={theme.text}>
            details
          </Text>
          {rows.map((row) => (
            <Box key={row.label}>
              <Box width={15}>
                <Text color={theme.muted}>{row.label}</Text>
              </Box>
              <Text color={theme[row.tone]}>{truncate(row.value, 48)}</Text>
            </Box>
          ))}
        </Box>
      )}
    </Panel>
  );
};
