import React from 'react';
import { Text } from 'ink';
import type { ToastState } from '../hooks/useToast';
import { glyph, theme } from '../theme';

export interface ToastBarProps {
  toast: ToastState | null;
}

/**
 * Transient feedback line.
 *
 * Ink owns stdout, so `console.log` would corrupt the frame — every message
 * (including errors) has to be rendered through the tree instead. Renders
 * nothing when there is no toast so the footer never reserves a blank row.
 */
export const ToastBar: React.FC<ToastBarProps> = ({ toast }) => {
  if (!toast) return null;
  const color =
    toast.tone === 'success' ? theme.success : toast.tone === 'danger' ? theme.danger : theme.brand;
  const icon = toast.tone === 'success' ? glyph.check : toast.tone === 'danger' ? glyph.cross : glyph.bullet;
  return (
    <Text color={color}>
      {icon} {toast.message}
    </Text>
  );
};
