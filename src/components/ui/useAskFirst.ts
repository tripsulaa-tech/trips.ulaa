import { useCallback, useRef } from 'react';
import { useConfirm } from './useConfirm';
import type { ConfirmOptions } from './useConfirm';

/**
 * Runs `action` only after the player confirms in the app's own themed dialog.
 * Pass `null` as the prompt to skip the question and run the action straight
 * away (e.g. nothing is in progress). Used by the games so one stray tap on
 * X / Leave / End game can't throw away a round.
 *
 *   const askFirst = useAskFirst();
 *   askFirst(playing ? { title: 'Quit this game?', message: '…' } : null, close);
 *
 * `onAsk` runs just before the dialog opens (e.g. to pause a live game). While
 * a dialog is open, further requests (Escape pressed twice, a second tap) are
 * ignored.
 */
export function useAskFirst() {
  const confirm = useConfirm();
  const asking = useRef(false);
  return useCallback(
    async (prompt: ConfirmOptions | null, action: () => void, onAsk?: () => void): Promise<void> => {
      if (!prompt) { action(); return; }
      if (asking.current) return;
      asking.current = true;
      onAsk?.();
      const ok = await confirm(prompt);
      asking.current = false;
      if (ok) action();
    },
    [confirm],
  );
}
