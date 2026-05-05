import confetti from "canvas-confetti";

const reduced = () =>
  typeof window !== "undefined" &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

export function fireBinFireworks(count: number = 1) {
  if (reduced()) return;
  const colors = ["#DB5A2A", "#0E8B7A", "#3EA6E0", "#E2B23A"];
  const burst = () => {
    confetti({
      particleCount: 60,
      spread: 75,
      startVelocity: 38,
      origin: { y: 0.7 },
      colors,
      scalar: 0.9,
      ticks: 180,
    });
  };
  burst();
  if (count > 1) {
    setTimeout(burst, 220);
    setTimeout(burst, 440);
  }
}

export function thunkSound() {
  if (reduced()) return;
  try {
    const Ctx =
      (window as any).AudioContext || (window as any).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const now = ctx.currentTime;

    // Wheelie thunk: low body + tiny click on top.
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(140, now);
    osc.frequency.exponentialRampToValueAtTime(60, now + 0.18);
    gain.gain.setValueAtTime(0.001, now);
    gain.gain.exponentialRampToValueAtTime(0.32, now + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.22);
    osc.connect(gain).connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.25);

    const click = ctx.createOscillator();
    const cg = ctx.createGain();
    click.type = "triangle";
    click.frequency.setValueAtTime(680, now);
    click.frequency.exponentialRampToValueAtTime(220, now + 0.08);
    cg.gain.setValueAtTime(0.001, now);
    cg.gain.exponentialRampToValueAtTime(0.18, now + 0.005);
    cg.gain.exponentialRampToValueAtTime(0.001, now + 0.09);
    click.connect(cg).connect(ctx.destination);
    click.start(now);
    click.stop(now + 0.1);

    setTimeout(() => ctx.close(), 400);
  } catch {
    /* sound is a nice-to-have */
  }
}
