"use client";

/**
 * Event facts, not the same three words dressed up as six. The old ticker was
 * one string repeated verbatim — #FrameInGoa alone showed up roughly a dozen
 * times per screen width. Each fact appears once per lap; the hashtag is the
 * campaign tag, not the whole sentence, so it gets one slot like everything
 * else.
 */
const FACTS = [
  "GOA, INDIA · 28–31 OCT 2026",
  "247 SEATS",
  "4 DAYS. ONE RHYTHM. EVERYTHING INTENTIONAL.",
  "LESS NOISE. MORE SIGNAL.",
  "NO FLUFF. NO USELESS NETWORKING.",
  "THE OCEAN AT YOUR DOORSTEP",
  "2:47 PM STUDIO",
  "#FrameInGoa",
];

const COLORS = ["text-yellow/80", "text-pink/80", "text-paper/70"];

/** One lap of tokens, colours cycling, ✳ as the divider. */
function Lap() {
  return (
    <>
      {FACTS.map((token, i) => (
        <span key={i}>
          {i > 0 && <span className="text-paper/30"> ✳ </span>}
          <span className={COLORS[i % COLORS.length]}>{token}</span>
        </span>
      ))}
    </>
  );
}

export function Marquee() {
  const laps = Array.from({ length: 3 }, (_, i) => (
    <span key={i} className="mx-4">
      <Lap />
    </span>
  ));

  return (
    <div className="overflow-hidden border-b border-paper/15 bg-green-ink/40 py-2">
      <div className="marquee font-mono text-[11px] tracking-[0.3em]">
        <span>{laps}</span>
        <span aria-hidden>{laps}</span>
      </div>
    </div>
  );
}
