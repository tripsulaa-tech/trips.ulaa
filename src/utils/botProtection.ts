import { useEffect, useRef } from 'react';

// =============================================
// Lightweight, no-dependency bot mitigation for public forms
// (BookingForm, ContactPage) — a real CAPTCHA (Turnstile/hCaptcha) is the
// stronger long-term fix, but this needs no third-party key/config and
// stops the overwhelming majority of naive scripted submissions:
//   1. A honeypot field that's invisible to (and never filled by) a real
//      person but that simple bots often fill in along with every other
//      input on the page.
//   2. A minimum-fill-time check — a real person takes at least a little
//      while to read the form and type into it; an instant POST is a
//      strong bot signal.
// Both checks are best-effort and deliberately fail open (never block a
// real, slightly-fast human) rather than fail closed.
// =============================================

const MIN_FILL_MS = 1200;

export function useBotTrap() {
  // Date.now() is impure and can't be called during render, so the mount
  // timestamp is captured in an effect instead of a useRef initializer.
  const mountedAt = useRef<number | null>(null);
  const honeypotRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    mountedAt.current = Date.now();
  }, []);

  const isLikelyBot = (): boolean => {
    if (honeypotRef.current && honeypotRef.current.value.trim() !== '') return true;
    // mountedAt.current is only null if submission somehow happens before
    // the mount effect ran — fail open (don't flag) rather than block a
    // real person on that edge case; the honeypot check above still applies.
    if (mountedAt.current !== null && Date.now() - mountedAt.current < MIN_FILL_MS) return true;
    return false;
  };

  return { honeypotRef, isLikelyBot };
}
