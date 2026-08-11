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
  "LESS NOISE. MORE SIGNAL.",
  "NO FLUFF. NO USELESS NETWORKING.",
  "THE OCEAN AT YOUR DOORSTEP",
  "2:47 PM STUDIO",
  "#FrameInGoa",
];

const AGENDA = [
  "DAY 01 — GENESIS DAY",
  "DAY 02 — DAY OF TRIANGLE",
  "DAY 03 — BUILD DAY · HEADS DOWN. SHIP OR SHIP",
  "DAY 04 — LAUNCH DAY · THE WORLD WATCHES",
  "4 DAYS. ONE RHYTHM. EVERYTHING INTENTIONAL.",
];

const COLORS = ["text-yellow/80", "text-pink/80", "text-paper/70"];

/** One lap of tokens, colours cycling, ✳ as the divider. */
function Lap({ tokens }: { tokens: string[] }) {
  return (
    <>
      {tokens.map((token, i) => (
        <span key={i}>
          {i > 0 && <span className="text-paper/30"> ✳ </span>}
          <span className={COLORS[i % COLORS.length]}>{token}</span>
        </span>
      ))}
    </>
  );
}

function TickerRow({
  tokens,
  reverse,
  laps = 3,
}: {
  tokens: string[];
  reverse?: boolean;
  laps?: number;
}) {
  const lapEls = Array.from({ length: laps }, (_, i) => (
    <span key={i} className="mx-4">
      <Lap tokens={tokens} />
    </span>
  ));

  return (
    <div className={`marquee font-mono text-[11px] tracking-[0.3em] ${reverse ? "marquee-reverse" : ""}`}>
      <span>{lapEls}</span>
      <span aria-hidden>{lapEls}</span>
    </div>
  );
}

export function Marquee() {
  return (
    <div className="flex flex-col overflow-hidden border-b border-paper/15 bg-green-ink/40">
      <div className="overflow-hidden py-2">
        <TickerRow tokens={FACTS} />
      </div>
      <div className="overflow-hidden border-t border-paper/10 py-2">
        <TickerRow tokens={AGENDA} reverse />
      </div>
    </div>
  );
}
