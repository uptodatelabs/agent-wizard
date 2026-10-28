import React, { useCallback, useEffect, useState } from 'react';
import { Box, Text, useApp, useInput } from 'ink';
import { StatusAdapter } from '../core/status-adapter';
import type { DashboardData } from '../core/status';
import { createAgentEditor, type AgentEditorPort } from '../core/agent-editor';
import { AgentDetailPanel } from './components/AgentDetailPanel';
import { AgentEditorPanel } from './components/AgentEditorPanel';
import { ToolStatusCard } from './components/ToolStatusCard';
import { ActionPalette } from '../tui/components/ActionPalette';
import { Header } from '../tui/components/Header';
import { HelpOverlay } from '../tui/components/HelpOverlay';
import { Panel } from '../tui/components/Panel';
import { Skeleton } from '../tui/components/Skeleton';
import { ToastBar } from '../tui/components/ToastBar';
import { ToolList } from '../tui/components/ToolList';
import { useListNavigation } from '../tui/hooks/useListNavigation';
import { useTerminalSize } from '../tui/hooks/useTerminalSize';
import { useToast } from '../tui/hooks/useToast';
import { buildActions, footerHints, type PaletteAction, type ViewId } from '../tui/keymap';
import { glyph, theme } from '../tui/theme';

/** Background refresh cadence for the status snapshot. */
const REFRESH_INTERVAL_MS = 30_000;

/** Below this width the two-pane layout collapses into a single column. */
const TWO_PANE_MIN_COLUMNS = 96;

/**
 * Stateless (it owns no per-render state), so one instance is shared for the
 * whole dashboard lifetime instead of being rebuilt on every render.
 */
const statusAdapter = new StatusAdapter();

/**
 * Interactive dashboard.
 *
 * Layout rules this component follows:
 *  - **One source of truth per concern.** Colour/glyph/spacing come from
 *    `tui/theme.ts`, shortcuts from `tui/keymap.ts`; nothing is retyped here.
 *  - **Ink owns stdout.** Every message — including errors — is state that the
 *    tree renders, never `console.*`, which would corrupt the frame.
 *  - **Input is scoped.** Only the active view's handler is enabled, so typing
 *    `q` into an editor field cannot also navigate away.
 */
export const Dashboard: React.FC = () => {
  const [data, setData] = useState<DashboardData | null>(null);
  const [view, setView] = useState<ViewId>('tools');
  const [refreshing, setRefreshing] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [helpOpen, setHelpOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [editor, setEditor] = useState<AgentEditorPort | null>(null);
  const [editorAgentId, setEditorAgentId] = useState('');
  const [editorBuiltin, setEditorBuiltin] = useState(false);

  const { exit } = useApp();
  const { toast, show } = useToast();
  const { columns, rows } = useTerminalSize();

  const tools = useListNavigation(data?.toolStatuses.length ?? 0);
  const selectedTool = data?.toolStatuses[tools.index];
  const agents = useListNavigation(selectedTool?.agents.length ?? 0);

  const fetchData = useCallback(
    async (userInitiated = false) => {
      setRefreshing(true);
      try {
        const next = await statusAdapter.getAllStatuses();
        setData(next);
        setError(null);
        if (userInitiated) show(`${next.toolStatuses.length} tools scanned`, 'success');
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        setError(message);
        if (userInitiated) show(`Refresh failed: ${message}`, 'danger');
      } finally {
        setRefreshing(false);
      }
    },
    [show]
  );

  useEffect(() => {
    void fetchData();
    const interval = setInterval(() => void fetchData(), REFRESH_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [fetchData]);

  const openAgents = useCallback(() => {
    if (!selectedTool) return;
    const next = createAgentEditor(selectedTool.tool);
    if (!next) {
      show(`${selectedTool.toolName} has no agent editor`, 'info');
      return;
    }
    setEditor(next);
    setEditorAgentId('');
    setView('agents');
    agents.setIndex(0);
  }, [selectedTool, show, agents]);

  const openEditor = useCallback(() => {
    const agent = selectedTool?.agents[agents.index];
    if (!editor || !agent) return;
    setEditorAgentId(agent.id);
    setEditorBuiltin(Boolean(agent.builtin));
    setView('editor');
  }, [editor, selectedTool, agents.index]);

  const dispatch = useCallback(
    (id: PaletteAction['id']) => {
      setPaletteOpen(false);
      switch (id) {
        case 'refresh':
          void fetchData(true);
          break;
        case 'help':
          setHelpOpen(true);
          break;
        case 'open-agents':
          openAgents();
          break;
        case 'edit-agent':
          openEditor();
          break;
        case 'back':
          setView((current) => (current === 'editor' ? 'agents' : 'tools'));
          break;
        case 'quit':
          exit();
          break;
        default:
          break;
      }
    },
    [fetchData, openAgents, openEditor, exit]
  );

  // Disabled while an overlay or a text-entry pane owns the keyboard.
  useInput(
    (input, key) => {
      if (key.ctrl && input === 'c') {
        exit();
        return;
      }
      if (input === '?') {
        setHelpOpen(true);
        return;
      }
      if (input === 'a') {
        setPaletteOpen(true);
        return;
      }
      if (input === 'r') {
        void fetchData(true);
        return;
      }
      if (key.escape) {
        if (view === 'agents') setView('tools');
        return;
      }

      if (view === 'tools') {
        if (key.upArrow) tools.prev();
        if (key.downArrow) tools.next();
        if (key.return) openAgents();
        if (input === 'q') exit();
        return;
      }

      if (view === 'agents') {
        if (key.upArrow) agents.prev();
        if (key.downArrow) agents.next();
        if (key.return) openEditor();
        if (input === 'q') setView('tools');
      }
    },
    { isActive: !helpOpen && !paletteOpen && view !== 'editor' }
  );

  const header = (
    <Header
      lastUpdated={data?.lastUpdated ?? null}
      activeTools={data?.activeTools ?? 0}
      totalTools={data?.toolStatuses.length ?? 0}
      totalAgents={data?.totalAgents ?? 0}
      refreshing={refreshing}
    />
  );

  // First-load: reserve the final layout so the frame does not jump into place.
  if (!data) {
    return (
      <Box flexDirection="column" padding={1}>
        {header}
        <Box flexDirection="column" marginTop={1}>
          {error ? (
            <Panel title="Status unavailable" focused>
              <Text color={theme.danger}>
                {glyph.cross} {error}
              </Text>
              <Text color={theme.muted}>Press r to retry, q to quit.</Text>
            </Panel>
          ) : (
            <Skeleton label="Scanning tool configurations" lines={4} width={Math.min(48, columns - 4)} />
          )}
        </Box>
      </Box>
    );
  }

  const listCapacity = Math.max(3, rows - 16);
  const actions = buildActions(view, {
    hasAgents: (selectedTool?.agents.length ?? 0) > 0,
    canEdit: editor !== null && (selectedTool?.agents.length ?? 0) > 0,
  });
  const hints = footerHints(view, Math.max(20, columns - 2));
  const twoPane = columns >= TWO_PANE_MIN_COLUMNS;

  return (
    <Box flexDirection="column" padding={1}>
      {header}

      {error && (
        <Box marginTop={1}>
          <Text color={theme.danger}>
            {glyph.cross} Status refresh failed: {error}
          </Text>
          <Text color={theme.muted}> (r to retry)</Text>
        </Box>
      )}

      {view === 'tools' && (
        <Box flexDirection={twoPane ? 'row' : 'column'} marginTop={1} gap={1}>
          <Panel title="Tools" subtitle={`${tools.index + 1}/${data.toolStatuses.length}`} focused>
            <ToolList statuses={data.toolStatuses} selectedIndex={tools.index} capacity={listCapacity} />
          </Panel>
          {selectedTool && (
            <ToolStatusCard
              status={selectedTool}
              selected={twoPane}
              width={twoPane ? Math.max(40, columns - 44) : undefined}
            />
          )}
        </Box>
      )}

      {view === 'agents' && selectedTool && (
        <Box marginTop={1}>
          <AgentDetailPanel status={selectedTool} selectedAgentIndex={agents.index} />
        </Box>
      )}

      {view === 'editor' && editor && selectedTool && (
        <Box marginTop={1}>
          <AgentEditorPanel
            editor={editor}
            agentId={editorAgentId}
            builtin={editorBuiltin}
            onBack={() => setView('agents')}
            onChanged={() => void fetchData()}
          />
        </Box>
      )}

      {helpOpen && <HelpOverlay onClose={() => setHelpOpen(false)} />}

      {paletteOpen && (
        <ActionPalette actions={actions} onSelect={dispatch} onCancel={() => setPaletteOpen(false)} />
      )}

      <Box marginTop={1}>
        <ToastBar toast={toast} />
      </Box>

      <Box marginTop={1} flexDirection="row" gap={2} flexWrap="wrap">
        {hints.map((hint) => (
          <Text key={hint} color={theme.muted}>
            {hint}
          </Text>
        ))}
      </Box>
    </Box>
  );
};
