"use client";

export function Marquee() {
  const line = "LESS NOISE. MORE SIGNAL. · #FrameInGoa · 247 SEATS · ";
  return (
    <div className="overflow-hidden border-b border-paper/15 bg-green-ink/40 py-2">
      <div className="marquee font-mono text-[11px] tracking-[0.3em] text-yellow/80">
        <span>{line.repeat(6)}</span>
        <span aria-hidden>{line.repeat(6)}</span>
      </div>
    </div>
  );
}
