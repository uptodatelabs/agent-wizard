/**
 * Keyboard map and action catalogue.
 *
 * The map is the single source of truth for *both* the footer hints and the
 * `?` help overlay, so a shortcut can never be documented in one place and
 * handled in another. Handlers stay in the components (Ink's `useInput` is
 * imperative by design); this module owns discovery and labelling.
 */

export type ViewId = 'tools' | 'agents' | 'editor';

export interface KeyBinding {
  keys: string[];
  label: string;
}

export const keymap: Record<ViewId, KeyBinding[]> = {
  tools: [
    { keys: ['↑', '↓'], label: 'Navigate tools' },
    { keys: ['Enter'], label: 'Open agents' },
    { keys: ['a'], label: 'Actions' },
    { keys: ['r'], label: 'Refresh' },
    { keys: ['?'], label: 'Help' },
    { keys: ['q'], label: 'Quit' },
  ],
  agents: [
    { keys: ['↑', '↓'], label: 'Select agent' },
    { keys: ['Enter'], label: 'Edit settings' },
    { keys: ['a'], label: 'Actions' },
    { keys: ['Esc'], label: 'Back to tools' },
    { keys: ['r'], label: 'Refresh' },
    { keys: ['?'], label: 'Help' },
  ],
  editor: [
    { keys: ['↑', '↓'], label: 'Select setting' },
    { keys: ['e'], label: 'Edit value' },
    { keys: ['a'], label: 'Add key' },
    { keys: ['d'], label: 'Delete key' },
    { keys: ['Esc'], label: 'Back to agents' },
    { keys: ['?'], label: 'Help' },
  ],
};

/** Shortcuts that work regardless of the active view. */
export const globalBindings: KeyBinding[] = [
  { keys: ['?'], label: 'Toggle this help' },
  { keys: ['Ctrl', 'C'], label: 'Quit immediately' },
];

/** `[↑/↓] Navigate tools` */
export function formatBinding(binding: KeyBinding): string {
  return `[${binding.keys.join('/')}] ${binding.label}`;
}

/**
 * Footer hints, ordered by importance and truncated when the terminal is
 * narrow. `q`/`Esc` are dropped first because the help overlay documents them.
 */
export function footerHints(view: ViewId, maxWidth = 88): string[] {
  const ordered = keymap[view].filter((binding) => binding.keys[0] !== '?');
  const hints: string[] = [];
  let width = 0;
  for (const binding of ordered) {
    const hint = formatBinding(binding);
    if (width + hint.length > maxWidth) break;
    hints.push(hint);
    width += hint.length + 3;
  }
  return hints;
}

export interface HelpGroup {
  title: string;
  bindings: KeyBinding[];
}

/** Sections rendered by the help overlay. */
export function helpGroups(): HelpGroup[] {
  return [
    { title: 'Tools', bindings: keymap.tools },
    { title: 'Agents', bindings: keymap.agents },
    { title: 'Editor', bindings: keymap.editor },
    { title: 'Global', bindings: globalBindings },
  ];
}

export type ActionId = 'refresh' | 'help' | 'open-agents' | 'edit-agent' | 'back' | 'quit';

export interface PaletteAction {
  id: ActionId;
  label: string;
  hint?: string;
  disabled?: boolean;
}

export interface ActionContext {
  /** At least one agent exists for the highlighted tool. */
  hasAgents: boolean;
  /** An editor is available for the highlighted tool. */
  canEdit: boolean;
}

/**
 * Contextual action list for the `a` menu.
 *
 * Kept as data (not JSX) so it can be unit-tested and so the dashboard stays a
 * thin dispatcher.
 */
export function buildActions(view: ViewId, context: ActionContext): PaletteAction[] {
  if (view === 'tools') {
    return [
      { id: 'open-agents', label: 'Open agents', hint: 'Enter', disabled: !context.hasAgents && !context.canEdit },
      { id: 'refresh', label: 'Refresh status', hint: 'r' },
      { id: 'help', label: 'Keyboard help', hint: '?' },
      { id: 'quit', label: 'Quit dashboard', hint: 'q' },
    ];
  }
  if (view === 'agents') {
    return [
      { id: 'edit-agent', label: 'Edit selected agent', hint: 'Enter', disabled: !context.canEdit },
      { id: 'back', label: 'Back to tools', hint: 'Esc' },
      { id: 'refresh', label: 'Refresh status', hint: 'r' },
      { id: 'help', label: 'Keyboard help', hint: '?' },
    ];
  }
  return [
    { id: 'back', label: 'Back to agents', hint: 'Esc' },
    { id: 'refresh', label: 'Refresh status', hint: 'r' },
    { id: 'help', label: 'Keyboard help', hint: '?' },
    { id: 'quit', label: 'Quit dashboard', hint: 'q' },
  ];
}
