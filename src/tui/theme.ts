/**
 * Design tokens for the AgentWizard TUI.
 *
 * Everything visual in `src/tui` and `src/dashboard` reads from this file so a
 * single palette / glyph change propagates everywhere. Two rules keep the
 * tokens honest:
 *
 *  1. **Colour is optional.** Terminals without true-colour support get plain
 *     ANSI names, and `NO_COLOR` / non-TTY output collapses to the basic
 *     palette. Nothing in the UI relies on colour alone to carry meaning —
 *     every state also has a glyph and a text label.
 *  2. **No colour is hard-coded outside this module.** Components ask for a
 *     semantic tone (`success`, `danger`, …) rather than a raw colour.
 */
import type { ToolStatus } from '../core/status';

/** Semantic colour roles. Components reference these, never raw colours. */
export type Tone = 'brand' | 'accent' | 'success' | 'warning' | 'danger' | 'muted' | 'text';

export interface ThemeColors {
  brand: string;
  accent: string;
  success: string;
  warning: string;
  danger: string;
  muted: string;
  text: string;
  border: string;
  borderFocused: string;
}

/** 16-colour safe fallback: every terminal understands these names. */
const BASIC_PALETTE: ThemeColors = {
  brand: 'cyan',
  accent: 'magenta',
  success: 'green',
  warning: 'yellow',
  danger: 'red',
  muted: 'gray',
  text: 'white',
  border: 'gray',
  borderFocused: 'cyan',
};

/** True-colour palette used when the terminal advertises 24-bit support. */
const TRUE_COLOR_PALETTE: ThemeColors = {
  brand: '#38bdf8',
  accent: '#c084fc',
  success: '#4ade80',
  warning: '#fbbf24',
  danger: '#f87171',
  muted: '#6b7280',
  text: '#e5e7eb',
  border: '#374151',
  borderFocused: '#38bdf8',
};

export type ColorLevel = 0 | 1 | 3;

/**
 * Detect how much colour the terminal can take.
 *
 * `NO_COLOR` wins over everything (https://no-color.org); piped output gets
 * no colour at all so `agent-wizard dashboard | tee log` stays readable.
 */
export type ColorEnv = Partial<Record<'NO_COLOR' | 'COLORTERM' | 'TERM', string | undefined>>;

export function resolveColorLevel(
  env: ColorEnv = process.env,
  isTTY: boolean = Boolean(process.stdout.isTTY)
): ColorLevel {
  if (env.NO_COLOR !== undefined && env.NO_COLOR !== '') return 0;
  if (!isTTY) return 0;
  const colorterm = env.COLORTERM ?? '';
  if (/truecolor|24bit/i.test(colorterm)) return 3;
  return 1;
}

/** Build a palette for the given colour capability. */
export function createTheme(level: ColorLevel = resolveColorLevel()): ThemeColors {
  return level === 3 ? { ...TRUE_COLOR_PALETTE } : { ...BASIC_PALETTE };
}

/** Process-wide palette. */
export const theme: ThemeColors = createTheme();

/** Unicode glyphs. Single source of truth so alignment never drifts. */
export const glyph = {
  brand: '🧙',
  pointer: '❯',
  dotOn: '●',
  dotOff: '○',
  check: '✓',
  cross: '✗',
  sep: '·',
  arrow: '→',
  bar: '│',
  bullet: '∙',
} as const;

/** Braille spinner frames (highest perceived smoothness at 8–12 fps). */
export const SPINNER_FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'] as const;

/** Layout scale — keeps paddings consistent across panels. */
export const spacing = { none: 0, xs: 1, sm: 2 } as const;

export interface StatusDescriptor {
  tone: Tone;
  icon: string;
  label: string;
}

/**
 * Map a tool status to its presentation. Previously duplicated verbatim in
 * `ToolStatusCard` and `AgentDetailPanel`; one definition keeps them in sync.
 */
export function describeToolStatus(status: ToolStatus | string): StatusDescriptor {
  switch (status) {
    case 'active':
      return { tone: 'success', icon: glyph.dotOn, label: 'Active' };
    case 'configured':
      return { tone: 'warning', icon: glyph.dotOn, label: 'Configured' };
    case 'error':
      return { tone: 'danger', icon: glyph.cross, label: 'Error' };
    case 'not-configured':
      return { tone: 'muted', icon: glyph.dotOff, label: 'Not Configured' };
    default:
      return { tone: 'muted', icon: glyph.dotOff, label: 'Unknown' };
  }
}

/** Render a timestamp for the header; invalid dates degrade to a dash. */
export function formatClock(date: Date): string {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return '—';
  return date.toLocaleTimeString();
}

/** Parse `#rrggbb` into RGB. Returns null for named/unparseable colours. */
export function parseHex(hex: string): [number, number, number] | null {
  const match = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!match || !match[1]) return null;
  const value = parseInt(match[1], 16);
  return [(value >> 16) & 0xff, (value >> 8) & 0xff, value & 0xff];
}

function toHexChannel(value: number): string {
  const clamped = Math.max(0, Math.min(255, Math.round(value)));
  return clamped.toString(16).padStart(2, '0');
}

/** Linear blend of two hex colours. Falls back to `from` when unparseable. */
export function mixHex(from: string, to: string, t: number): string {
  const a = parseHex(from);
  const b = parseHex(to);
  if (!a || !b) return from;
  const ratio = Math.max(0, Math.min(1, t));
  const r = a[0] + (b[0] - a[0]) * ratio;
  const g = a[1] + (b[1] - a[1]) * ratio;
  const bl = a[2] + (b[2] - a[2]) * ratio;
  return `#${toHexChannel(r)}${toHexChannel(g)}${toHexChannel(bl)}`;
}

export interface GradientStop {
  char: string;
  color: string;
}

/**
 * Per-character colour stops for a horizontal gradient.
 *
 * When either endpoint is not a hex colour (i.e. the basic palette is in use)
 * every character keeps the `from` colour — the caller still renders, it just
 * loses the gradient instead of breaking.
 */
export function gradientStops(text: string, from: string, to: string): GradientStop[] {
  const chars = [...text];
  if (chars.length === 0) return [];
  const usable = parseHex(from) !== null && parseHex(to) !== null;
  const last = chars.length - 1;
  return chars.map((char, index) => ({
    char,
    color: usable && last > 0 ? mixHex(from, to, index / last) : from,
  }));
}

/**
 * Clip a string to at most `max` characters (code points, not bytes).
 *
 * Tables are laid out with fixed column widths; without a hard clip a long
 * tool name or absolute path would push every following column out of
 * alignment and wrap the row.
 */
export function truncate(text: string, max: number): string {
  if (max <= 0) return '';
  const chars = [...text];
  if (chars.length <= max) return text;
  if (max === 1) return '…';
  return `${chars.slice(0, max - 1).join('')}…`;
}
