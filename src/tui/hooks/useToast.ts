import { useCallback, useEffect, useRef, useState } from 'react';

export type ToastTone = 'info' | 'success' | 'danger';

export interface ToastState {
  message: string;
  tone: ToastTone;
  /** Monotonic id so an identical repeated message still re-animates. */
  seq: number;
}

export interface ToastApi {
  toast: ToastState | null;
  show: (message: string, tone?: ToastTone) => void;
  clear: () => void;
}

/**
 * Transient status line (the Ink equivalent of a toast).
 *
 * Ink owns stdout, so `console.log` would corrupt the frame; transient
 * feedback therefore has to be state that the tree renders.
 */
export function useToast(timeoutMs = 4000): ToastApi {
  const [toast, setToast] = useState<ToastState | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const seq = useRef(0);

  const clearTimer = useCallback(() => {
    if (timer.current !== null) {
      clearTimeout(timer.current);
      timer.current = null;
    }
  }, []);

  const clear = useCallback(() => {
    clearTimer();
    setToast(null);
  }, [clearTimer]);

  const show = useCallback(
    (message: string, tone: ToastTone = 'info') => {
      clearTimer();
      seq.current += 1;
      setToast({ message, tone, seq: seq.current });
      timer.current = setTimeout(() => {
        timer.current = null;
        setToast(null);
      }, timeoutMs);
    },
    [clearTimer, timeoutMs]
  );

  useEffect(() => clearTimer, [clearTimer]);

  return { toast, show, clear };
}
