import React from 'react';
import { Box, Text } from 'ink';
import { spacing, theme } from '../theme';

export interface SkeletonProps {
  label?: string;
  lines?: number;
  width?: number;
}

/**
 * Block-character placeholder shown while the first status snapshot loads.
 *
 * A skeleton beats a bare "Loading…" because it reserves the final layout
 * height, so the frame does not jump when real data arrives.
 */
export const Skeleton: React.FC<SkeletonProps> = ({ label = 'Loading', lines = 3, width = 34 }) => (
  <Box flexDirection="column" padding={spacing.xs}>
    {Array.from({ length: Math.max(1, lines) }, (_, index) => (
      <Text key={index} color={theme.muted}>
        {'░'.repeat(Math.max(1, width))}
      </Text>
    ))}
    <Box marginTop={1}>
      <Text color={theme.muted}>{label}…</Text>
    </Box>
  </Box>
);
