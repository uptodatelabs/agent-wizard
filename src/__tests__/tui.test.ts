import { describe, it, expect } from 'vitest';
import {
  createTheme,
  describeToolStatus,
  formatClock,
  gradientStops,
  glyph,
  mixHex,
  parseHex,
  resolveColorLevel,
  SPINNER_FRAMES,
  theme,
  truncate,
  type ThemeColors,
} from '../tui/theme';
import {
  buildActions,
  footerHints,
  formatBinding,
  helpGroups,
  keymap,
  type ViewId,
} from '../tui/keymap';
import { moveIndex } from '../tui/hooks/useListNavigation';
import { readTerminalSize, windowRows } from '../tui/hooks/useTerminalSize';

/**
 * These cover the pure layer of the TUI: tokens, keymap tables and layout
 * maths. They are deliberately render-free — Ink component snapshots need
 * `ink-testing-library`, and the behaviour that actually breaks in practice
 * (colour fallback, cursor clamping, column truncation) lives in these helpers.
 */

const VIEWS: ViewId[] = ['tools', 'agents', 'editor'];
const TONES: Array<keyof ThemeColors> = [
  'brand',
  'accent',
  'success',
  'warning',
  'danger',
  'muted',
  'text',
  'border',
  'borderFocused',
];

describe('theme tokens', () => {
  it('honours NO_COLOR over everything else', () => {
    expect(resolveColorLevel({ NO_COLOR: '1', COLORTERM: 'truecolor' }, true)).toBe(0);
  });

  it('drops colour when stdout is not a TTY, so piped output stays readable', () => {
    expect(resolveColorLevel({ COLORTERM: 'truecolor' }, false)).toBe(0);
  });

  it('detects 24-bit support from COLORTERM and falls back to 16 colours', () => {
    expect(resolveColorLevel({ COLORTERM: 'truecolor' }, true)).toBe(3);
    expect(resolveColorLevel({ COLORTERM: '24bit' }, true)).toBe(3);
    expect(resolveColorLevel({}, true)).toBe(1);
    expect(resolveColorLevel({ TERM: 'xterm-256color' }, true)).toBe(1);
  });

  it('builds a complete palette for every colour level', () => {
    for (const level of [0, 1, 3] as const) {
      const palette = createTheme(level);
      for (const tone of TONES) {
        expect(typeof palette[tone], `${tone}@${level}`).toBe('string');
        expect(palette[tone].length).toBeGreaterThan(0);
      }
    }
  });

  it('uses named ANSI colours when true colour is unavailable', () => {
    expect(createTheme(1).brand).toBe('cyan');
    expect(parseHex(createTheme(1).brand)).toBeNull();
    expect(parseHex(createTheme(3).brand)).not.toBeNull();
  });

  it('exposes a glyph for every state so colour is never the only signal', () => {
    expect(glyph.dotOn).not.toBe(glyph.dotOff);
    expect(glyph.check).not.toBe(glyph.cross);
    expect(SPINNER_FRAMES.length).toBeGreaterThanOrEqual(8);
  });
});

describe('describeToolStatus', () => {
  it('maps each tool status to a tone, icon and label', () => {
    const active = describeToolStatus('active');
    expect(active.tone).toBe('success');
    expect(active.icon).toBe(glyph.dotOn);
    expect(active.label).toBe('Active');

    expect(describeToolStatus('configured').tone).toBe('warning');
    expect(describeToolStatus('error').tone).toBe('danger');
    expect(describeToolStatus('error').icon).toBe(glyph.cross);
    expect(describeToolStatus('not-configured').tone).toBe('muted');
  });

  it('resolves every descriptor tone to a real palette entry', () => {
    // Guards the class of bug where a descriptor points at a tone that was
    // renamed or never added — `theme[tone]` would then be `undefined` and Ink
    // would silently render uncoloured text.
    for (const status of ['active', 'configured', 'error', 'not-configured', 'unknown-value']) {
      const descriptor = describeToolStatus(status);
      expect(typeof theme[descriptor.tone], status).toBe('string');
      expect(theme[descriptor.tone].length).toBeGreaterThan(0);
    }
  });

  it('degrades unknown statuses instead of throwing', () => {
    const unknown = describeToolStatus('something-new');
    expect(unknown.label).toBe('Unknown');
    expect(unknown.tone).toBe('muted');
  });
});

describe('colour maths', () => {
  it('parses hex and rejects named colours', () => {
    expect(parseHex('#38bdf8')).toEqual([0x38, 0xbd, 0xf8]);
    expect(parseHex('38bdf8')).toEqual([0x38, 0xbd, 0xf8]);
    expect(parseHex('cyan')).toBeNull();
    expect(parseHex('#zzzzzz')).toBeNull();
  });

  it('blends two hex colours linearly and clamps the ratio', () => {
    expect(mixHex('#000000', '#ffffff', 0.5)).toBe('#808080');
    expect(mixHex('#000000', '#ffffff', 0)).toBe('#000000');
    expect(mixHex('#000000', '#ffffff', 1)).toBe('#ffffff');
    expect(mixHex('#000000', '#ffffff', 5)).toBe('#ffffff');
    expect(mixHex('#000000', '#ffffff', -3)).toBe('#000000');
  });

  it('returns the source colour when either endpoint is not hex', () => {
    expect(mixHex('cyan', '#ffffff', 0.5)).toBe('cyan');
  });

  it('produces one stop per code point for a gradient', () => {
    const stops = gradientStops('abc', '#000000', '#ffffff');
    expect(stops).toHaveLength(3);
    expect(stops[0].char).toBe('a');
    expect(stops[0].color).toBe('#000000');
    expect(stops[2].color).toBe('#ffffff');
    expect(gradientStops('', '#000000', '#ffffff')).toEqual([]);
  });

  it('keeps a flat colour when the palette is not true-colour', () => {
    const stops = gradientStops('ab', 'cyan', 'cyan');
    expect(stops.map((s) => s.color)).toEqual(['cyan', 'cyan']);
  });

  it('splits by code point, not byte, so emoji survive', () => {
    const stops = gradientStops('🧙ab', '#000000', '#ffffff');
    expect(stops).toHaveLength(3);
    expect(stops[0].char).toBe('🧙');
  });
});

describe('truncate', () => {
  it('leaves short strings untouched', () => {
    expect(truncate('hello', 10)).toBe('hello');
    expect(truncate('hello', 5)).toBe('hello');
  });

  it('clips long strings to the column budget with an ellipsis', () => {
    expect(truncate('hello world', 8)).toBe('hello w…');
    expect(truncate('hello', 4)).toBe('hel…');
  });

  it('degrades sanely at degenerate widths', () => {
    expect(truncate('hello', 0)).toBe('');
    expect(truncate('hello', -1)).toBe('');
    expect(truncate('hello', 1)).toBe('…');
  });

  it('counts code points so wide characters are not split mid-glyph', () => {
    expect(truncate('🧙🧙🧙', 2)).toBe('🧙…');
  });
});

describe('formatClock', () => {
  it('renders a dash for an invalid date instead of NaN text', () => {
    expect(formatClock(new Date('not a date'))).toBe('—');
  });

  it('renders a time for a valid date', () => {
    expect(formatClock(new Date(2026, 0, 2, 13, 5, 0))).toMatch(/\d/);
  });
});

describe('moveIndex', () => {
  it('clamps at both ends by default', () => {
    expect(moveIndex(0, 5, 1)).toBe(1);
    expect(moveIndex(4, 5, 1)).toBe(4);
    expect(moveIndex(0, 5, -1)).toBe(0);
    expect(moveIndex(2, 5, -2)).toBe(0);
    expect(moveIndex(2, 5, 10)).toBe(4);
  });

  it('wraps from either end when asked', () => {
    expect(moveIndex(4, 5, 1, true)).toBe(0);
    expect(moveIndex(0, 5, -1, true)).toBe(4);
    expect(moveIndex(0, 5, 5, true)).toBe(0);
  });

  it('never points outside an empty list', () => {
    expect(moveIndex(3, 0, 1)).toBe(0);
    expect(moveIndex(0, 0, -1, true)).toBe(0);
    expect(moveIndex(3, 1, -5)).toBe(0);
  });

  it('recovers from a NaN cursor', () => {
    expect(moveIndex(Number.NaN, 5, 0)).toBe(0);
  });
});

describe('windowRows', () => {
  const items = Array.from({ length: 10 }, (_, index) => index);

  it('shows everything when the list fits', () => {
    const result = windowRows(items, 0, 12);
    expect(result.visible).toEqual(items);
    expect(result.offset).toBe(0);
    expect(result.hidden).toBe(0);
  });

  it('keeps the cursor inside the window as it moves down', () => {
    const result = windowRows(items, 9, 3);
    expect(result.visible).toEqual([7, 8, 9]);
    expect(result.offset).toBe(7);
    expect(result.hidden).toBe(7);
  });

  it('starts at the top when the cursor is at the top', () => {
    const result = windowRows(items, 0, 3);
    expect(result.visible).toEqual([0, 1, 2]);
    expect(result.offset).toBe(0);
  });

  it('survives an out-of-range cursor and a zero capacity', () => {
    expect(windowRows(items, 99, 3).visible).toEqual([7, 8, 9]);
    expect(windowRows(items, 0, 0).visible).toEqual([0]);
  });

  it('handles an empty list', () => {
    const result = windowRows([] as number[], 0, 5);
    expect(result.visible).toEqual([]);
    expect(result.hidden).toBe(0);
  });
});

describe('readTerminalSize', () => {
  it('falls back to 80x24 when the stream reports no dimensions', () => {
    expect(readTerminalSize({})).toEqual({ columns: 80, rows: 24 });
  });

  it('ignores non-positive dimensions', () => {
    expect(readTerminalSize({ columns: 0, rows: -5 })).toEqual({ columns: 80, rows: 24 });
  });

  it('passes real dimensions through', () => {
    expect(readTerminalSize({ columns: 120, rows: 40 })).toEqual({ columns: 120, rows: 40 });
  });
});

describe('keymap', () => {
  it('documents at least one binding per view', () => {
    for (const view of VIEWS) {
      expect(keymap[view].length).toBeGreaterThan(0);
      for (const binding of keymap[view]) {
        expect(binding.keys.length).toBeGreaterThan(0);
        expect(binding.label.length).toBeGreaterThan(0);
      }
    }
  });

  it('formats a hint as [keys] label', () => {
    expect(formatBinding({ keys: ['↑', '↓'], label: 'Navigate' })).toBe('[↑/↓] Navigate');
  });

  it('drops the help hint from the footer and truncates by width', () => {
    const wide = footerHints('tools', 200);
    expect(wide).toHaveLength(keymap.tools.length - 1);
    expect(wide.some((hint) => hint.includes('Toggle this help'))).toBe(false);

    const narrow = footerHints('tools', 20);
    expect(narrow.length).toBeLessThan(wide.length);
  });

  it('never returns a hint list that overflows the given width', () => {
    for (const view of VIEWS) {
      for (const width of [20, 40, 80, 120]) {
        const hints = footerHints(view, width);
        const total = hints.reduce((sum, hint) => sum + hint.length + 3, 0);
        expect(total, `${view}@${width}`).toBeLessThanOrEqual(width + 3);
      }
    }
  });

  it('lists every view plus global bindings in the help overlay', () => {
    const groups = helpGroups();
    expect(groups.map((group) => group.title)).toEqual(['Tools', 'Agents', 'Editor', 'Global']);
    expect(groups[3].bindings.length).toBeGreaterThan(0);
  });
});

describe('buildActions', () => {
  it('disables opening agents when the tool has none and cannot be edited', () => {
    const actions = buildActions('tools', { hasAgents: false, canEdit: false });
    const open = actions.find((action) => action.id === 'open-agents');
    expect(open?.disabled).toBe(true);
  });

  it('enables opening agents when the tool has agents', () => {
    const actions = buildActions('tools', { hasAgents: true, canEdit: true });
    expect(actions.find((action) => action.id === 'open-agents')?.disabled).toBeFalsy();
  });

  it('disables editing when no editor is available for the tool', () => {
    const actions = buildActions('agents', { hasAgents: true, canEdit: false });
    expect(actions.find((action) => action.id === 'edit-agent')?.disabled).toBe(true);
  });

  it('always offers a way out of the editor', () => {
    const actions = buildActions('editor', { hasAgents: true, canEdit: true });
    expect(actions.map((action) => action.id)).toContain('back');
  });
});
