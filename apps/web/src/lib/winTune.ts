/**
 * Tiny WebAudio chiptune — the win fanfare is synthesized in the browser,
 * so there are no audio files, no licensing, and it works offline.
 *
 * Mobile browsers only allow sound after a user gesture, so we arm the
 * AudioContext on the first tap anywhere; by the time a reveal fires the
 * player has bet/tapped plenty and the context is unlocked.
 */

let ctx: AudioContext | null = null;

function ensureCtx(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!ctx) {
    const AC =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
  }
  if (ctx.state === "suspended") void ctx.resume().catch(() => {});
  return ctx;
}

if (typeof window !== "undefined") {
  window.addEventListener("pointerdown", () => ensureCtx(), {
    once: true,
    passive: true,
  });
}

const NOTE = {
  C5: 523.25,
  E5: 659.25,
  G5: 783.99,
  C6: 1046.5,
  E6: 1318.5,
  G6: 1568.0,
  C7: 2093.0,
} as const;

function blip(
  ac: AudioContext,
  t: number,
  freq: number,
  dur: number,
  type: OscillatorType = "square",
  vol = 0.14,
): void {
  const o = ac.createOscillator();
  const g = ac.createGain();
  o.type = type;
  o.frequency.value = freq;
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(vol, t + 0.015);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  o.connect(g).connect(ac.destination);
  o.start(t);
  o.stop(t + dur + 0.05);
}

/** Rising C-major arpeggio + sparkle; `big` adds a champion flourish. */
export function playWinTune(big = false): void {
  const ac = ensureCtx();
  if (!ac || ac.state !== "running") return;
  const t0 = ac.currentTime + 0.03;
  ([NOTE.C5, NOTE.E5, NOTE.G5, NOTE.C6] as number[]).forEach((f, i) =>
    blip(ac, t0 + i * 0.09, f, 0.18),
  );
  blip(ac, t0 + 0.4, NOTE.E6, 0.3, "triangle", 0.12);
  blip(ac, t0 + 0.52, NOTE.G6, 0.5, "triangle", 0.1);
  if (big) {
    ([NOTE.C6, NOTE.E6, NOTE.G6, NOTE.C7] as number[]).forEach((f, i) =>
      blip(ac, t0 + 0.78 + i * 0.09, f, 0.24, "square", 0.12),
    );
    blip(ac, t0 + 1.2, NOTE.C7, 0.7, "triangle", 0.1);
  }
}
