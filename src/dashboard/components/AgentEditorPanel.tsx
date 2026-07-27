import React, { useState, useCallback } from 'react';
import { Box, Text, useInput } from 'ink';
import { AgentEditorPort, AgentSettings } from '../../core/agent-editor';

/** Flatten a nested object into dot-notation keys with primitive values. */
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
  return out;
}

interface Props {
  editor: AgentEditorPort;
  agentId: string;
  onBack: () => void;
  onChanged: () => void;
}

type Mode = 'view' | 'edit-key' | 'edit-value' | 'add-key' | 'add-value' | 'confirm-delete';

export const AgentEditorPanel: React.FC<Props> = ({ editor, agentId, onBack, onChanged }) => {
  const [raw, setRaw] = useState<AgentSettings | null>(null);
  const [error, setError] = useState<string | null>(null);
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

  // Load on mount
  React.useEffect(() => {
    reload();
  }, [reload]);

  const rows = raw ? flatten(raw) : [];

  const submitEditValue = async () => {
    try {
      await editor.setAgentKey(agentId, pendingKey, buffer);
      setMode('view');
      setBuffer('');
      await reload();
      onChanged();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const submitDelete = async () => {
    try {
      await editor.unsetAgentKey(agentId, pendingKey);
      setMode('view');
      await reload();
      onChanged();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  useInput(
    (input, key) => {
      if (mode === 'view') {
        if (key.escape || input === 'q') {
          onBack();
          return;
        }
        if (key.return) {
          onBack();
          return;
        }
        if (input === 'a') {
          setMode('add-key');
          setBuffer('');
          return;
        }
        if (input === 'd' && rows.length > 0) {
          setPendingKey(rows[selected]?.key || '');
          setMode('confirm-delete');
          return;
        }
        if (input === 'e' && rows.length > 0) {
          setPendingKey(rows[selected]?.key || '');
          setBuffer(rows[selected]?.value || '');
          setMode('edit-value');
          return;
        }
        if (key.upArrow) setSelected((i) => Math.max(0, i - 1));
        if (key.downArrow) setSelected((i) => Math.min(rows.length - 1, i + 1));
        return;
      }

      if (mode === 'add-key' || mode === 'edit-value') {
        if (key.return) {
          if (mode === 'add-key') {
            if (!buffer.trim()) {
              setMode('view');
              return;
            }
            setPendingKey(buffer.trim());
            setBuffer('');
            setMode('add-value');
          } else {
            submitEditValue();
          }
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
        if (input) setBuffer((b) => b + input);
        return;
      }

      if (mode === 'add-value') {
        if (key.return) {
          submitEditValue();
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
        if (input) setBuffer((b) => b + input);
        return;
      }

      if (mode === 'confirm-delete') {
        if (input === 'y') {
          submitDelete();
          return;
        }
        setMode('view');
        return;
      }
    },
    { isActive: true }
  );

  if (!raw) {
    return (
      <Box flexDirection="column" borderStyle="round" borderColor="cyan" padding={1}>
        <Text bold color="cyan">
          🤖 {agentId} - Editor
        </Text>
        <Text color="gray">{error ? `❌ ${error}` : 'Loading...'}</Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="column" borderStyle="round" borderColor="cyan" padding={1}>
      <Box marginBottom={1}>
        <Text bold color="cyan">
          🤖 {agentId} — Settings
        </Text>
      </Box>

      {error && (
        <Box marginBottom={1}>
          <Text color="red">❌ {error}</Text>
        </Box>
      )}

      {mode === 'view' && (
        <Box flexDirection="column" marginBottom={1}>
          {rows.length === 0 ? (
            <Text color="gray">(no settings)</Text>
          ) : (
            rows.map((r, i) => (
              <Box key={r.key}>
                <Text color={i === selected ? 'green' : 'gray'}>{i === selected ? '▶ ' : '  '}</Text>
                <Text color="cyan">{r.key}</Text>
                <Text color="gray"> = </Text>
                <Text color="white">{r.value}</Text>
              </Box>
            ))
          )}
        </Box>
      )}

      {mode === 'add-key' && (
        <Box marginBottom={1}>
          <Text color="yellow">New key (dot-notation, e.g. tools.profile): </Text>
          <Text color="white">{buffer}</Text>
          <Text color="gray">█</Text>
        </Box>
      )}
      {mode === 'add-value' && (
        <Box marginBottom={1}>
          <Text color="yellow">Value for '{pendingKey}' (JSON parsed when possible): </Text>
          <Text color="white">{buffer}</Text>
          <Text color="gray">█</Text>
        </Box>
      )}
      {mode === 'edit-value' && (
        <Box marginBottom={1}>
          <Text color="yellow">Edit '{pendingKey}': </Text>
          <Text color="white">{buffer}</Text>
          <Text color="gray">█</Text>
        </Box>
      )}
      {mode === 'confirm-delete' && (
        <Box marginBottom={1}>
          <Text color="red">Delete '{pendingKey}'? [y]es / [Esc] cancel</Text>
        </Box>
      )}

      <Box marginTop={1} flexDirection="row" gap={1}>
        <Text color="gray">[↑↓] Select</Text>
        <Text color="gray">[e] Edit value</Text>
        <Text color="gray">[a] Add key</Text>
        <Text color="gray">[d] Delete</Text>
        <Text color="gray">[Enter/q] Back</Text>
      </Box>
    </Box>
  );
};
