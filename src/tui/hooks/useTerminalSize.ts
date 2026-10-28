import { useEffect, useState } from 'react';

export interface TerminalSize {
  columns: number;
  rows: number;
}

/** Readable fallback for non-TTY streams, which report no dimensions. */
const DEFAULT_COLUMNS = 80;
const DEFAULT_ROWS = 24;

/**
 * Pure size reader so the layout maths can be unit-tested without a TTY.
 *
 * `process.stdout.columns` is `undefined` when output is piped, so every
 * layout that depends on width has to survive the fallback path.
 */
export function readTerminalSize(stream: {
  columns?: number;
  rows?: number;
}): TerminalSize {
  const columns =
    typeof stream.columns === 'number' && stream.columns > 0 ? stream.columns : DEFAULT_COLUMNS;
  const rows = typeof stream.rows === 'number' && stream.rows > 0 ? stream.rows : DEFAULT_ROWS;
  return { columns, rows };
}

/** Terminal dimensions, kept in sync with resize events. */
export function useTerminalSize(): TerminalSize {
  const [size, setSize] = useState<TerminalSize>(() => readTerminalSize(process.stdout));

  useEffect(() => {
    const stream = process.stdout;
    const onResize = () => setSize(readTerminalSize(stream));
    // A resize leaves stale rows on screen; re-reading on every event keeps
    // the frame proportional instead of overflowing the new height.
    stream.on('resize', onResize);
    return () => {
      stream.off('resize', onResize);
    };
  }, []);

  return size;
}

/**
 * Split a list into the visible window around `index`.
 *
 * Long tool/agent lists would otherwise push the footer off screen; a window
 * plus a "+N" marker keeps the frame inside the terminal height.
 */
export function windowRows<T>(
  items: T[],
  index: number,
  capacity: number
): { visible: T[]; offset: number; hidden: number } {
  const total = items.length;
  const size = Math.max(1, capacity);
  if (total <= size) return { visible: items, offset: 0, hidden: 0 };

  const clamped = Math.max(0, Math.min(index, total - 1));
  let offset = clamped - size + 1;
  if (offset < 0) offset = 0;
  const maxOffset = total - size;
  if (offset > maxOffset) offset = maxOffset;

  return { visible: items.slice(offset, offset + size), offset, hidden: total - size };
}
