import React from 'react';
import { Box, Text } from 'ink';
import type { AgentStatus } from '../../core/status';
import type { ThemeColors } from '../../tui/theme';
import { Panel } from '../../tui/components/Panel';
import { StatusBadge } from '../../tui/components/StatusBadge';
import { glyph, theme, truncate } from '../../tui/theme';

export interface ToolStatusCardProps {
  status: AgentStatus;
  selected?: boolean;
  width?: number;
  /** Agent names to preview before collapsing into `+N more`. */
  maxAgents?: number;
}

interface DetailRow {
  label: string;
  value: string;
  tone: keyof ThemeColors;
}

/**
 * Compact summary card for one tool.
 *
 * Every visual decision comes from `src/tui/theme.ts`; the status colour, icon
 * and label are derived from `describeToolStatus` so this card can never
 * disagree with the list, the badge or the detail panel.
 */
export const ToolStatusCard: React.FC<ToolStatusCardProps> = ({
  status,
  selected = false,
  width,
  maxAgents = 5,
}) => {
  const preview = status.agents.slice(0, maxAgents);
  const hidden = status.agents.length - preview.length;

  const rows: DetailRow[] = [];
  if (status.details.scopes && status.details.scopes.length > 0) {
    rows.push({ label: 'scopes', value: status.details.scopes.join(', '), tone: 'muted' });
  }
  if (status.details.rules !== undefined) {
    rows.push({ label: 'rules', value: String(status.details.rules), tone: 'brand' });
  }
  if (status.details.profiles !== undefined) {
    rows.push({ label: 'profiles', value: String(status.details.profiles), tone: 'brand' });
  }
  if (status.details.mcpServers !== undefined) {
    rows.push({ label: 'mcp', value: String(status.details.mcpServers), tone: 'brand' });
  }
  if (status.details.hooks !== undefined) {
    rows.push({ label: 'hooks', value: String(status.details.hooks), tone: 'brand' });
  }
  if (status.details.instructions !== undefined) {
    rows.push({
      label: 'instructions',
      value: status.details.instructions ? 'present' : 'missing',
      tone: status.details.instructions ? 'success' : 'danger',
    });
  }
  if (status.details.pathInstructions !== undefined) {
    rows.push({
      label: 'path rules',
      value: String(status.details.pathInstructions),
      tone: 'brand',
    });
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
      subtitle={
        status.agents.length > 0
          ? `${glyph.sep} ${status.agents.length} ${status.agents.length === 1 ? 'agent' : 'agents'}`
          : undefined
      }
      focused={selected}
      width={width}
    >
      <Box flexDirection="column">
        <Box>
          <StatusBadge status={status.status} />
          {status.configValid !== null && (
            <>
              <Text color={theme.muted}> {glyph.sep} config </Text>
              <Text color={status.configValid ? theme.success : theme.danger}>
                {status.configValid ? 'valid' : 'invalid'}
              </Text>
            </>
          )}
        </Box>

        <Box>
          <Text color={theme.muted}>path </Text>
          <Text color={theme.muted}>{truncate(status.configPath, 44)}</Text>
        </Box>

        {rows.length > 0 && (
          <Box flexDirection="column" marginTop={1}>
            {rows.map((row) => (
              <Box key={row.label}>
                <Box width={15}>
                  <Text color={theme.muted}>{row.label}</Text>
                </Box>
                <Text color={theme[row.tone]}>{truncate(row.value, 40)}</Text>
              </Box>
            ))}
          </Box>
        )}

        {preview.length > 0 && (
          <Box flexDirection="column" marginTop={1}>
            {preview.map((agent) => (
              <Box key={agent.id}>
                <Box width={2}>
                  <Text color={theme.muted}>{glyph.bullet}</Text>
                </Box>
                <Text color={theme.text}>{truncate(agent.name, 22)}</Text>
                {agent.model ? <Text color={theme.muted}> {truncate(agent.model, 16)}</Text> : null}
              </Box>
            ))}
            {hidden > 0 && <Text color={theme.muted}>+{hidden} more</Text>}
          </Box>
        )}
      </Box>
    </Panel>
  );
};
