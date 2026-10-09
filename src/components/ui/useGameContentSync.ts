import { useEffect } from 'react';
import { useGameContent } from '../../hooks/useGameContent';
import { STOWAWAY_DEFAULTS, applyStowawayContent, sanitizeStowawayContent } from './stowawayWords';
import { TWIN_PROMPTS_DEFAULTS, applyTwinPrompts, sanitizeTwinPrompts } from './findMyTwinEngine';

// Stowaway and Find My Twin read their lists straight from module-level arrays,
// so the admin's saved edits are loaded and swapped into those arrays here. Safe
// to call from several components at once: it is idempotent.

export function useStowawayContentSync() {
  const content = useGameContent('stowaway', STOWAWAY_DEFAULTS, sanitizeStowawayContent);
  useEffect(() => { applyStowawayContent(content); }, [content]);
}

export function useTwinPromptsSync() {
  const content = useGameContent('twin-prompts', TWIN_PROMPTS_DEFAULTS, sanitizeTwinPrompts);
  useEffect(() => { applyTwinPrompts(content); }, [content]);
}
