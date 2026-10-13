import { useEffect } from 'react';
import { useGameContent } from '../../hooks/useGameContent';
import { YAARU_AVAN_DEFAULTS, applyYaaruAvanContent, sanitizeYaaruAvanContent } from './yaaruAvanWords';
import { TWIN_PROMPTS_DEFAULTS, applyTwinPrompts, sanitizeTwinPrompts } from './findMyTwinEngine';

// Yaaru Avan and Find My Twin read their lists straight from module-level arrays,
// so the admin's saved edits are loaded and swapped into those arrays here. Safe
// to call from several components at once: it is idempotent.

export function useYaaruAvanContentSync() {
  const content = useGameContent('yaaru-avan', YAARU_AVAN_DEFAULTS, sanitizeYaaruAvanContent);
  useEffect(() => { applyYaaruAvanContent(content); }, [content]);
}

export function useTwinPromptsSync() {
  const content = useGameContent('twin-prompts', TWIN_PROMPTS_DEFAULTS, sanitizeTwinPrompts);
  // Applied during render as well (it is idempotent) so the first screen already shows the edited questions.
  applyTwinPrompts(content);
  useEffect(() => { applyTwinPrompts(content); }, [content]);
}
