import React from 'react';
import { Box, Text } from 'ink';
import { glyph, spacing, theme } from '../theme';

export interface PanelProps {
  title?: string;
  subtitle?: string;
  /** Draws the focus ring (double border + accent) on the active pane. */
  focused?: boolean;
  width?: number;
  padding?: number;
  children: React.ReactNode;
}

/**
 * Bordered surface used by every pane.
 *
 * Focus is communicated three ways — border weight, border colour and a
 * leading pointer glyph — so it survives monochrome terminals and `NO_COLOR`.
 */
export const Panel: React.FC<PanelProps> = ({
  title,
  subtitle,
  focused = false,
  width,
  padding = spacing.xs,
  children,
}) => (
  <Box
    flexDirection="column"
    borderStyle={focused ? 'double' : 'round'}
    borderColor={focused ? theme.borderFocused : theme.border}
    padding={padding}
    width={width}
  >
    {(title || subtitle) && (
      <Box marginBottom={1}>
        {title && (
          <Text bold color={focused ? theme.brand : theme.text}>
            {focused ? `${glyph.pointer} ` : ''}
            {title}
          </Text>
        )}
        {subtitle && <Text color={theme.muted}> {subtitle}</Text>}
      </Box>
    )}
    {children}
  </Box>
);
