import { useEffect, useState } from 'react';
import { getCachedGameContent, loadGameContent, type GameContentKey } from '../services/api/gameContent';

/**
 * A game's content: the built-in `defaults` first, then the admin's saved edits
 * once they arrive. `sanitize` must be a stable (module-level) function that
 * returns null for anything unusable, in which case the defaults stay.
 */
export function useGameContent<T>(key: GameContentKey, defaults: T, sanitize: (raw: unknown) => T | null): T {
  const [value, setValue] = useState<T>(() => {
    const cached = getCachedGameContent(key);
    return (cached !== undefined ? sanitize(cached) : null) ?? defaults;
  });

  useEffect(() => {
    let alive = true;
    loadGameContent()
      .then(() => {
        if (!alive) return;
        const saved = getCachedGameContent(key);
        const clean = saved !== undefined ? sanitize(saved) : null;
        if (clean) setValue(clean);
      })
      .catch(() => { /* offline or not readable: keep the built-in content */ });
    return () => { alive = false; };
  }, [key, sanitize]);

  return value;
}
