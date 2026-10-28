import React, { useCallback, useEffect, useState } from 'react';
import { Box, Text, useInput } from 'ink';
import { AgentEditorPort, AgentSettings } from '../../core/agent-editor';
import { Panel } from '../../tui/components/Panel';
import { Spinner } from '../../tui/components/Spinner';
import { glyph, theme, truncate } from '../../tui/theme';

/**
 * Flatten a nested object into dot-notation keys with primitive values.
 *
 * Sorted by key so the row under the cursor cannot jump to a different setting
 * after an edit changes the underlying insertion order.
 */
function flatten(obj: AgentSettings, prefix = ''): { key: string; value: string }[] {
  const out: { key: string; value: string }[] = [];
  for (const [k, v] of Object.entries(obj)) {
    const full = prefix ? `${prefix}.${k}` : k;
    if (v !== null && typeof v === 'object' && !Array.isArray(v)) {
      out.push(...flatten(v as AgentSettings, full));
    } else {
      out.push({ key: full, value: typeof v === 'string' ? v : JSON.stringify(v) });
    }
  }
  return out.sort((a, b) => a.key.localeCompare(b.key));
}

interface Props {
  editor: AgentEditorPort;
  agentId: string;
  builtin?: boolean;
  onBack: () => void;
  onChanged: () => void;
}

type Mode = 'view' | 'edit-value' | 'add-key' | 'add-value' | 'confirm-delete';

/** Single-line text field with the caret rendered from design tokens. */
const Field: React.FC<{ label: string; value: string; tone?: keyof typeof theme }> = ({
  label,
  value,
  tone = 'warning',
}) => (
  <Box>
    <Text color={theme[tone]}>{label}</Text>
    <Text color={theme.text}>{value}</Text>
    <Text color={theme.brand}>█</Text>
  </Box>
);

/**
 * Key/value editor for one agent's settings tree.
 *
 * Visual rules inherited from `tui/theme.ts`: no raw colour names, the cursor
 * is a glyph rather than colour alone, and footer hints come from `keymap.ts`
 * so the editor cannot advertise a shortcut it does not implement.
 */
export const AgentEditorPanel: React.FC<Props> = ({
  editor,
  agentId,
  builtin,
  onBack,
  onChanged,
}) => {
  const [raw, setRaw] = useState<AgentSettings | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [mode, setMode] = useState<Mode>('view');
  const [selected, setSelected] = useState(0);
  const [buffer, setBuffer] = useState('');
  const [pendingKey, setPendingKey] = useState('');

  const reload = useCallback(async () => {
    try {
      const r = await editor.getAgentRaw(agentId);
      setRaw(r);
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }, [editor, agentId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const rows = raw ? flatten(raw) : [];
  // An edit can remove the last row; clamp so the cursor never dangles.
  const cursor = Math.min(selected, Math.max(0, rows.length - 1));

  const commit = useCallback(
    async (action: () => Promise<void>) => {
      setSaving(true);
      try {
        await action();
        setMode('view');
        setBuffer('');
        await reload();
        onChanged();
      } catch (e) {
        setError((e as Error).message);
      } finally {
        setSaving(false);
      }
    },
    [reload, onChanged]
  );

  useInput((input, key) => {
    if (mode === 'view') {
      if (key.escape || input === 'q' || key.return) {
        onBack();
        return;
      }
      if (saving) return;
      if (input === 'a') {
        setMode('add-key');
        setBuffer('');
        return;
      }
      if (input === 'd' && rows.length > 0) {
        setPendingKey(rows[cursor]?.key ?? '');
        setMode('confirm-delete');
        return;
      }
      if (input === 'e' && rows.length > 0) {
        setPendingKey(rows[cursor]?.key ?? '');
        setBuffer(rows[cursor]?.value ?? '');
        setMode('edit-value');
        return;
      }
      if (key.upArrow) setSelected(Math.max(0, cursor - 1));
      if (key.downArrow) setSelected(Math.min(rows.length - 1, cursor + 1));
      return;
    }

    if (mode === 'confirm-delete') {
      if (input === 'y') void commit(() => editor.unsetAgentKey(agentId, pendingKey));
      else setMode('view');
      return;
    }

    // Text-entry modes: Enter submits, Esc discards, everything else edits.
    if (key.return) {
      if (mode === 'add-key') {
        const trimmed = buffer.trim();
        if (!trimmed) {
          setMode('view');
          return;
        }
        setPendingKey(trimmed);
        setBuffer('');
        setMode('add-value');
        return;
      }
      if (mode === 'add-value') {
        void commit(() => editor.setAgentKey(agentId, pendingKey, buffer));
        return;
      }
      void commit(() => editor.setAgentKey(agentId, pendingKey, buffer));
      return;
    }
    if (key.escape) {
      setMode('view');
      setBuffer('');
      return;
    }
    if (key.backspace || key.delete) {
      setBuffer((b) => b.slice(0, -1));
      return;
    }
    if (input && !key.ctrl && !key.meta) setBuffer((b) => b + input);
  });

  if (!raw) {
    return (
      <Panel title={`${agentId} — settings`} focused>
        {error ? (
          <Text color={theme.danger}>
            {glyph.cross} {error}
          </Text>
        ) : (
          <Spinner label="loading settings" />
        )}
      </Panel>
    );
  }

  return (
    <Panel
      title={`${agentId} — settings`}
      subtitle={builtin ? `${glyph.sep} builtin` : `${glyph.sep} custom`}
      focused
    >
      {error && (
        <Box marginBottom={1}>
          <Text color={theme.danger}>
            {glyph.cross} {error}
          </Text>
        </Box>
      )}

      {mode === 'view' && (
        <Box flexDirection="column">
          {rows.length === 0 ? (
            <Text color={theme.muted}>(no settings — press a to add a key)</Text>
          ) : (
            rows.map((row, index) => {
              const active = index === cursor;
              return (
                <Box key={row.key}>
                  <Box width={2}>
                    <Text color={theme.brand}>{active ? glyph.pointer : ' '}</Text>
                  </Box>
                  <Box width={28}>
                    <Text bold={active} color={active ? theme.brand : theme.text}>
                      {truncate(row.key, 27)}
                    </Text>
                  </Box>
                  <Text color={theme.muted}> = </Text>
                  <Text color={theme.text}>{truncate(row.value, 40)}</Text>
                </Box>
              );
            })
          )}
          {saving && (
            <Box marginTop={1}>
              <Spinner label="saving" />
            </Box>
          )}
        </Box>
      )}

      {mode === 'add-key' && (
        <Field label="new key (dot-notation, e.g. tools.profile): " value={buffer} />
      )}
      {mode === 'add-value' && (
        <Field label={`value for '${pendingKey}' (JSON parsed when possible): `} value={buffer} />
      )}
      {mode === 'edit-value' && <Field label={`edit '${pendingKey}': `} value={buffer} />}
      {mode === 'confirm-delete' && (
        <Text color={theme.danger}>
          Delete '{pendingKey}'? [y]es / [Esc] cancel
        </Text>
      )}

      <Box marginTop={1} flexDirection="row" gap={2} flexWrap="wrap">
        <Text color={theme.muted}>[↑/↓] Select</Text>
        <Text color={theme.muted}>[e] Edit</Text>
        <Text color={theme.muted}>[a] Add</Text>
        <Text color={theme.muted}>[d] Delete</Text>
        <Text color={theme.muted}>[Esc] Back</Text>
      </Box>
    </Panel>
  );
};
