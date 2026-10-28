import React from 'react';
import { Text } from 'ink';
import type { ToolStatus } from '../../core/status';
import { describeToolStatus, theme } from '../theme';

export interface StatusBadgeProps {
  status: ToolStatus | string;
}

/** `● Active` — icon + label, both derived from the shared status descriptor. */
export const StatusBadge: React.FC<StatusBadgeProps> = ({ status }) => {
  const descriptor = describeToolStatus(status);
  return (
    <Text color={theme[descriptor.tone]}>
      {descriptor.icon} {descriptor.label}
    </Text>
  );
};
