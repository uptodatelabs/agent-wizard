import { useCallback, useEffect, useState } from 'react';

/**
 * Move a list cursor by `delta`, clamped (default) or wrapped.
 *
 * Pure so the edge cases — empty list, overshoot, wrap from either end — are
 * covered by unit tests instead of by driving the rendered UI.
 */
export function moveIndex(current: number, length: number, delta: number, wrap = false): number {
  if (length <= 0) return 0;
  const max = length - 1;
  let next = current + delta;
  if (wrap) {
    next = ((next % length) + length) % length;
    return next;
  }
  if (Number.isNaN(next)) return 0;
  if (next < 0) return 0;
  if (next > max) return max;
  return next;
}

export interface ListNavigation {
  index: number;
  setIndex: (index: number) => void;
  next: () => void;
  prev: () => void;
  first: () => void;
  last: () => void;
}

/**
 * Cursor state for a list that can shrink (e.g. an agent removed on disk).
 * The index is re-clamped whenever `length` changes so it can never point at
 * a row that no longer exists.
 */
export function useListNavigation(length: number, options: { wrap?: boolean } = {}): ListNavigation {
  const wrap = options.wrap ?? false;
  const [index, setIndex] = useState(0);

  useEffect(() => {
    setIndex((current) => moveIndex(current, length, 0, false));
  }, [length]);

  const next = useCallback(() => setIndex((current) => moveIndex(current, length, 1, wrap)), [length, wrap]);
  const prev = useCallback(() => setIndex((current) => moveIndex(current, length, -1, wrap)), [length, wrap]);
  const first = useCallback(() => setIndex(0), []);
  const last = useCallback(() => setIndex(() => moveIndex(0, length, length, false)), [length]);

  return { index, setIndex, next, prev, first, last };
}
