import React from 'react';
import { Text } from 'ink';
import { gradientStops, theme } from '../theme';

export interface GradientTextProps {
  text: string;
  from?: string;
  to?: string;
  bold?: boolean;
}

/**
 * Horizontal true-colour gradient for the product title.
 *
 * Degrades to a single flat colour when the palette is not true-colour — see
 * `gradientStops`. Emoji and wide characters are preserved because the string
 * is split by code point, not byte.
 */
export const GradientText: React.FC<GradientTextProps> = ({
  text,
  from = theme.brand,
  to = theme.accent,
  bold = false,
}) => {
  const stops = gradientStops(text, from, to);
  return (
    <Text bold={bold}>
      {stops.map((stop, index) => (
        <Text key={`${index}-${stop.char}`} color={stop.color}>
          {stop.char}
        </Text>
      ))}
    </Text>
  );
};
