// One-time clean-up of what Yaaru Avan? saved on this device before the rename.
// The game used to be called Stowaway and its keys started with "ulaa:stowaway:".
// Importing this file (the engine and the room API both do) moves every old key to
// "ulaa:yaaru-avan:" the first time it runs, so word bags, saved names and the
// online-room token carry over. A key that already exists under the new name wins.
// It never throws: private mode or blocked storage just means nothing is moved.

const OLD_PREFIX = 'ulaa:stowaway:';
const NEW_PREFIX = 'ulaa:yaaru-avan:';

export function migrateOldKeys(storage: Pick<Storage, 'length' | 'key' | 'getItem' | 'setItem' | 'removeItem'>): number {
  let moved = 0;
  try {
    const olds: string[] = [];
    for (let i = 0; i < storage.length; i++) {
      const k = storage.key(i);
      if (k && k.startsWith(OLD_PREFIX)) olds.push(k);
    }
    for (const k of olds) {
      const next = NEW_PREFIX + k.slice(OLD_PREFIX.length);
      if (storage.getItem(next) === null) {
        const v = storage.getItem(k);
        if (v !== null) { storage.setItem(next, v); moved++; }
      }
      storage.removeItem(k);
    }
  } catch { /* storage unavailable: nothing to move */ }
  return moved;
}

if (typeof localStorage !== 'undefined') migrateOldKeys(localStorage);
