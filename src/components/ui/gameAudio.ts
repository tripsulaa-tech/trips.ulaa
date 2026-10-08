import { useCallback, useRef } from 'react';

// ── Sound: tiny Web Audio synth (no files). Created lazily on the first tap
// of "Start" so browsers allow it; respects the mute toggle. ──
export type Sfx = 'flip' | 'miss' | 'good' | 'bad' | 'gold' | 'power' | 'tick' | 'go' | 'win' | 'end';

export function useSynth(mutedRef: React.MutableRefObject<boolean>) {
  const ctxRef = useRef<AudioContext | null>(null);

  const ensure = useCallback(() => {
    if (!ctxRef.current) {
      const AC = window.AudioContext
        ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AC) return null;
      ctxRef.current = new AC();
    }
    if (ctxRef.current.state === 'suspended') void ctxRef.current.resume();
    return ctxRef.current;
  }, []);

  const tone = useCallback((freq: number, dur: number, opts: { type?: OscillatorType; gain?: number; delay?: number; to?: number } = {}) => {
    const ctx = ctxRef.current;
    if (!ctx || mutedRef.current) return;
    const { type = 'sine', gain = 0.12, delay = 0, to } = opts;
    const t = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (to) osc.frequency.exponentialRampToValueAtTime(to, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g).connect(ctx.destination);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }, [mutedRef]);

  const play = useCallback((name: Sfx) => {
    if (mutedRef.current) return;
    switch (name) {
      case 'flip': tone(620, 0.07, { type: 'triangle', gain: 0.07 }); break;
      case 'miss': tone(320, 0.18, { type: 'sine', gain: 0.08, to: 230 }); break;
      case 'good': tone(660, 0.09, { type: 'triangle' }); tone(880, 0.12, { type: 'triangle', delay: 0.07 }); break;
      case 'bad': tone(190, 0.22, { type: 'sawtooth', gain: 0.09, to: 110 }); break;
      case 'gold': [784, 988, 1175, 1568].forEach((f, i) => tone(f, 0.16, { type: 'triangle', delay: i * 0.07 })); break;
      case 'power': tone(440, 0.28, { type: 'sine', to: 1040 }); break;
      case 'tick': tone(520, 0.1, { type: 'sine' }); break;
      case 'go': tone(880, 0.3, { type: 'triangle', gain: 0.15 }); break;
      case 'win': [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.28, { type: 'triangle', delay: i * 0.12 })); break;
      case 'end': tone(440, 0.2, { type: 'sine' }); tone(330, 0.3, { type: 'sine', delay: 0.18 }); break;
    }
  }, [tone, mutedRef]);

  return { ensure, play };
}
