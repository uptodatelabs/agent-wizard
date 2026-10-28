import React from 'react';
import { Box, Text } from 'ink';
import { formatClock, glyph, theme } from '../theme';
import { GradientText } from './GradientText';
import { Spinner } from './Spinner';

export interface HeaderProps {
  lastUpdated: Date | null;
  activeTools: number;
  totalTools: number;
  totalAgents: number;
  refreshing?: boolean;
}

/**
 * Product header: identity on the left, live state on the right.
 *
 * The right-hand slot swaps between the timestamp and a spinner so the row
 * never changes height when a refresh starts — a jumping header reads as a
 * glitch.
 */
export const Header: React.FC<HeaderProps> = ({
  lastUpdated,
  activeTools,
  totalTools,
  totalAgents,
  refreshing = false,
}) => (
  <Box flexDirection="column">
    <Box justifyContent="space-between">
      <Box>
        <GradientText text="AgentWizard" bold />
        <Text color={theme.muted}> dashboard</Text>
      </Box>
      <Box>
        {refreshing ? (
          <Spinner label="refreshing" />
        ) : (
          <Text color={theme.muted}>
            {glyph.sep} updated {lastUpdated ? formatClock(lastUpdated) : '—'}
          </Text>
        )}
      </Box>
    </Box>
    <Box>
      <Text color={theme.muted}>tools </Text>
      <Text color={theme.success}>{activeTools}</Text>
      <Text color={theme.muted}>/{totalTools}</Text>
      <Text color={theme.muted}> agents </Text>
      <Text color={theme.brand}>{totalAgents}</Text>
    </Box>
  </Box>
);
