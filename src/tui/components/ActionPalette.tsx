import React, { useMemo, useState } from 'react';
import { Box, Text, useInput } from 'ink';
import type { PaletteAction } from '../keymap';
import { glyph, theme, truncate } from '../theme';
import { Panel } from './Panel';

export interface ActionPaletteProps {
  actions: PaletteAction[];
  onSelect: (id: PaletteAction['id']) => void;
  onCancel: () => void;
}

/**
 * Command palette (`a`).
 *
 * Unlike a plain menu it accepts typing to narrow the list, so a keyboard user
 * never has to arrow through entries they do not want. Disabled actions stay
 * visible — hiding them would make the shortcut set unpredictable.
 */
export const ActionPalette: React.FC<ActionPaletteProps> = ({ actions, onSelect, onCancel }) => {
  const [filter, setFilter] = useState('');
  const [index, setIndex] = useState(0);

  const visible = useMemo(() => {
    const query = filter.trim().toLowerCase();
    if (!query) return actions;
    return actions.filter((action) => action.label.toLowerCase().includes(query));
  }, [actions, filter]);

  const cursor = Math.min(index, Math.max(0, visible.length - 1));

  useInput((input, key) => {
    if (key.escape) {
      onCancel();
      return;
    }
    if (key.return) {
      const action = visible[cursor];
      if (action && !action.disabled) onSelect(action.id);
      return;
    }
    if (key.upArrow) {
      setIndex(Math.max(0, cursor - 1));
      return;
    }
    if (key.downArrow) {
      setIndex(Math.min(Math.max(0, visible.length - 1), cursor + 1));
      return;
    }
    if (key.backspace || key.delete) {
      setFilter((current) => current.slice(0, -1));
      setIndex(0);
      return;
    }
    if (input && !key.ctrl && !key.meta) {
      setFilter((current) => current + input);
      setIndex(0);
    }
  });

  return (
    <Box marginTop={1}>
      <Panel title="Actions" subtitle="type to filter" focused width={54}>
        <Box marginBottom={1}>
          <Text color={theme.brand}>{glyph.pointer} </Text>
          <Text color={theme.text}>{filter || ''}</Text>
          <Text color={theme.muted}>{filter ? '' : 'filter…'}</Text>
          <Text color={theme.brand}>█</Text>
        </Box>
        {visible.length === 0 ? (
          <Text color={theme.muted}>No matching action.</Text>
        ) : (
          visible.map((action, position) => {
            const active = position === cursor;
            const tone = action.disabled ? theme.muted : active ? theme.brand : theme.text;
            return (
              <Box key={action.id}>
                <Box width={2}>
                  <Text color={theme.brand}>{active ? glyph.pointer : ' '}</Text>
                </Box>
                <Box width={26}>
                  <Text bold={active} color={tone}>
                    {truncate(action.label, 25)}
                  </Text>
                </Box>
                <Text color={theme.muted}>{action.disabled ? 'unavailable' : action.hint ?? ''}</Text>
              </Box>
            );
          })
        )}
      </Panel>
    </Box>
  );
};
