import type { RefObject } from 'react';

// Visually hidden (not display:none — some bots skip those) decoy field.
// Real visitors never see or fill it; anything that does gets flagged as
// a likely bot by useBotTrap's isLikelyBot(). Kept out of tab order and
// out of autofill so it never accidentally catches a real person either.
export default function HoneypotField({ inputRef }: { inputRef: RefObject<HTMLInputElement | null> }) {
  return (
    <div
      aria-hidden="true"
      style={{ position: 'absolute', left: '-9999px', top: 'auto', width: 1, height: 1, overflow: 'hidden' }}
    >
      <label htmlFor="ulaa-hp-website">Leave this field blank</label>
      <input
        ref={inputRef}
        id="ulaa-hp-website"
        name="website"
        type="text"
        tabIndex={-1}
        autoComplete="off"
      />
    </div>
  );
}
