import { useEffect, useState } from 'react';
import { SPINNER_FRAMES } from '../theme';

/**
 * Braille spinner frame.
 *
 * The interval only runs while `isActive` is true — an idle dashboard should
 * not wake up 11 times a second just to repaint the same frame. Returns an
 * empty string when inactive so callers can render it unconditionally.
 */
export function useSpinner(isActive: boolean, intervalMs = 90): string {
  const [frame, setFrame] = useState(0);

  useEffect(() => {
    if (!isActive) {
      setFrame(0);
      return;
    }
    const timer = setInterval(() => {
      setFrame((current) => (current + 1) % SPINNER_FRAMES.length);
    }, intervalMs);
    return () => clearInterval(timer);
  }, [isActive, intervalMs]);

  if (!isActive) return '';
  return SPINNER_FRAMES[frame] ?? SPINNER_FRAMES[0];
}
