import React from 'react';
import { Box, Text } from 'ink';
import type { AgentStatus } from '../../core/status';
import { describeToolStatus, glyph, theme, truncate } from '../theme';
import { windowRows } from '../hooks/useTerminalSize';

export interface ToolListProps {
  statuses: AgentStatus[];
  selectedIndex: number;
  /** Maximum number of rows to draw before windowing kicks in. */
  capacity?: number;
  nameWidth?: number;
}

/**
 * Vertical tool list with a cursor.
 *
 * Chosen over the previous wrapping card grid because a grid reflows into a
 * different shape on every terminal width, which makes the cursor position
 * unpredictable; a fixed-column list keeps the cursor on the same row and lets
 * the detail pane carry the extra information.
 *
 * State is communicated three ways (pointer glyph, colour, text label) so it
 * survives `NO_COLOR` and monochrome terminals.
 */
export const ToolList: React.FC<ToolListProps> = ({
  statuses,
  selectedIndex,
  capacity = 12,
  nameWidth = 18,
}) => {
  if (statuses.length === 0) {
    return <Text color={theme.muted}>No supported tools detected.</Text>;
  }

  const { visible, offset, hidden } = windowRows(statuses, selectedIndex, capacity);
  const above = offset;
  const below = hidden - above;

  return (
    <Box flexDirection="column">
      {above > 0 && (
        <Text color={theme.muted}>
          {' '}
          ↑ {above} more
        </Text>
      )}
      {visible.map((status, position) => {
        const index = offset + position;
        const selected = index === selectedIndex;
        const descriptor = describeToolStatus(status.status);
        return (
          <Box key={status.tool}>
            <Box width={2}>
              <Text color={theme.brand}>{selected ? glyph.pointer : ' '}</Text>
            </Box>
            <Box width={2}>
              <Text color={theme[descriptor.tone]}>{descriptor.icon}</Text>
            </Box>
            <Box width={nameWidth}>
              <Text bold={selected} color={selected ? theme.brand : theme.text}>
                {truncate(status.toolName, Math.max(1, nameWidth - 1))}
              </Text>
            </Box>
            <Box width={11}>
              <Text color={theme.muted}>
                {status.agents.length} {status.agents.length === 1 ? 'agent' : 'agents'}
              </Text>
            </Box>
            <Text color={theme[descriptor.tone]}>{descriptor.label}</Text>
          </Box>
        );
      })}
      {below > 0 && (
        <Text color={theme.muted}>
          {' '}
          ↓ {below} more
        </Text>
      )}
    </Box>
  );
};
