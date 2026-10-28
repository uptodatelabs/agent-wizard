import React from 'react';
import { Box, Text } from 'ink';
import { theme } from '../theme';
import { useSpinner } from '../hooks/useSpinner';

export interface SpinnerProps {
  label?: string;
  active?: boolean;
}

/** Braille spinner with an optional trailing label. Renders nothing when idle. */
export const Spinner: React.FC<SpinnerProps> = ({ label, active = true }) => {
  const frame = useSpinner(active);
  if (!active) return null;
  return (
    <Box>
      <Text color={theme.brand}>{frame}</Text>
      {label ? <Text color={theme.muted}> {label}</Text> : null}
    </Box>
  );
};
