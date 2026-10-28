import React from 'react';
import { Box, Text, useInput } from 'ink';
import { helpGroups } from '../keymap';
import { theme } from '../theme';
import { Panel } from './Panel';

export interface HelpOverlayProps {
  onClose: () => void;
}

/**
 * `?` help overlay.
 *
 * The content is generated from `keymap.ts` — the same table the components
 * read their handlers from — so the help can never drift out of sync with the
 * actual bindings.
 */
export const HelpOverlay: React.FC<HelpOverlayProps> = ({ onClose }) => {
  useInput((input, key) => {
    if (key.escape || input === '?' || input === 'q' || key.return) onClose();
  });

  return (
    <Box marginTop={1}>
      <Panel title="Keyboard help" subtitle="? or Esc to close" focused>
        <Box flexDirection="column">
          {helpGroups().map((group) => (
            <Box key={group.title} flexDirection="column" marginBottom={1}>
              <Text bold color={theme.accent}>
                {group.title}
              </Text>
              {group.bindings.map((binding) => (
                <Box key={`${group.title}-${binding.keys.join('')}`}>
                  <Box width={12}>
                    <Text color={theme.brand}>{binding.keys.join('/')}</Text>
                  </Box>
                  <Text color={theme.text}>{binding.label}</Text>
                </Box>
              ))}
            </Box>
          ))}
        </Box>
      </Panel>
    </Box>
  );
};
