/**
 * Everything on the pass that isn't typed by the user is derived from a hash of
 * what is. Same name + same stack => same builder class, same number, same
 * secret. That matters: the card has to survive a reload, and two people
 * comparing screenshots should see a stable identity, not a slot machine.
 *
 * `salt` is the reroll escape hatch — bump it and you get a different draw.
 */

export type Pass = {
  name: string;
  stack: string;
  handle: string;
  salt: number;
};

export type MintedPass = {
  name: string;
  stack: string;
  handle: string;
  /** e.g. "ANJUNA NIGHT-COMPILER" */
  builderClass: string;
  /** e.g. "HHG-2026-0417" */
  serial: string;
  /** 001..247 — the residency only has 247 seats, so the number means something */
  seat: string;
  /** boarding-pass detail on the sunrise layer */
  gate: string;
  /** the line that only shows up under blacklight */
  secret: string;
  /** index into the vector sigil set — drawn as a path, never as a glyph, so it
   *  can't land as tofu in a font that lacks the codepoint */
  sigil: number;
  /** two 44-char passport-style lines along the bottom edge */
  mrz: [string, string];
};

/* FNV-1a. Small, fast, and stable across runtimes — which is the whole point,
   since the client and the OG renderer must agree on every derived field. */
function hash(input: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/**
 * Each field gets its own labelled hash rather than successive draws from one
 * stream. A sequential PRNG leaks correlation into the low bits, which showed
 * up as the same gate and the same secret repeating across different names —
 * very visible when the whole point is that everyone's card feels distinct.
 */
function fieldOf(seed: number, label: string): number {
  return hash(`${seed}:${label}`);
}

function pick<T>(list: readonly T[], n: number): T {
  /* Take from the high bits: modulo on the low bits of a 32-bit hash is where
     the clustering lives. */
  return list[(n >>> 8) % list.length];
}

/* Goan geography, tides, and food — the half of the name that says *where*. */
const PLACES = [
  "SUSEGAD",
  "ANJUNA",
  "ARAMBOL",
  "PALOLEM",
  "DUDHSAGAR",
  "VAGATOR",
  "MANDREM",
  "CHAPORA",
  "MORJIM",
  "ASSAGAO",
  "SIOLIM",
  "QUERIM",
  "PANJIM",
  "GALGIBAG",
  "BUTTERFLY BAY",
  "MONSOON",
  "LOW-TIDE",
  "SPRING-TIDE",
  "NEAP-TIDE",
  "OFFSHORE",
  "SANDBAR",
  "MIDNIGHT",
  "SALT-AIR",
  "FENI",
  "KOKUM",
  "CASHEW",
  "LATERITE",
  "XACUTI",
  "BEBINCA",
  "TRANCE-COAST",
] as const;

/* ...and the half that says *what you do at 4am*. */
const ARCHETYPES = [
  "SHIPPER",
  "NIGHT-COMPILER",
  "SYSTEMS SHAMAN",
  "PACKET SMUGGLER",
  "LATENCY MONK",
  "THROUGHPUT MYSTIC",
  "KERNEL PILOT",
  "CACHE PIRATE",
  "SCHEMA DRUID",
  "PIXEL SMITH",
  "RENDER WITCH",
  "EDGE RUNNER",
  "SEGFAULT SURFER",
  "MERGE CAPTAIN",
  "ROLLBACK ORACLE",
  "UPTIME PRIEST",
  "BUFFER NOMAD",
  "SIGNAL FISHER",
  "DAEMON WRANGLER",
  "SOCKET SAILOR",
  "GRADIENT PILGRIM",
  "HOTFIX CORSAIR",
  "TERMINAL HERMIT",
  "PAYLOAD DIVER",
  "REGEX SNAKE-CHARMER",
  "DEADLOCK DANCER",
  "SHADER SUNBATHER",
  "CRON KEEPER",
  "TOKEN ALCHEMIST",
  "STACKTRACE DETECTIVE",
] as const;

/* Only ever read under the blacklight layer. Keep them short and a little
   conspiratorial — this is the payoff for tilting the card. */
const SECRETS = [
  "SEE YOU ON THE SAND",
  "THE TIDE REMEMBERS",
  "SHIP OR SHIP",
  "LESS NOISE. MORE SIGNAL.",
  "BUILT AT 2:47 AM",
  "NO FLUFF. JUST OUTPUT.",
  "THE OCEAN IS AT YOUR DOORSTEP",
  "FOUND: ONE SIGNAL IN THE NOISE",
  "SALT IN THE KEYBOARD",
  "247 SEATS. YOU TOOK ONE.",
  "SUSEGAD UNTIL DEPLOY",
  "THE SUN COMES UP EITHER WAY",
] as const;

/** How many vector sigils `drawSigil` knows how to draw. */
export const SIGIL_COUNT = 12;

const GATES = ["A1", "B2", "C3", "D4", "G7", "H2", "K9", "M1", "N4", "T7"] as const;

function normalize(s: string): string {
  return s.trim().replace(/\s+/g, " ");
}

/** Strip to the MRZ-legal alphabet and pad/truncate to exactly 44 chars. */
function mrzLine(raw: string): string {
  const cleaned = raw
    .toUpperCase()
    .replace(/[^A-Z0-9<]/g, "<")
    .slice(0, 44);
  return cleaned.padEnd(44, "<");
}

export function mint(input: Pass): MintedPass {
  const name = normalize(input.name) || "ANONYMOUS BUILDER";
  const stack = normalize(input.stack) || "FULL STACK";
  const handle = normalize(input.handle).replace(/^@/, "");

  const seed = hash(
    `${name.toLowerCase()}|${stack.toLowerCase()}|${handle.toLowerCase()}|${input.salt}`,
  );
  const f = (label: string) => fieldOf(seed, label);

  const builderClass = `${pick(PLACES, f("place"))} ${pick(ARCHETYPES, f("archetype"))}`;
  const serial = `HHG-2026-${String((f("serial") >>> 8) % 10000).padStart(4, "0")}`;
  const seat = String(((f("seat") >>> 8) % 247) + 1).padStart(3, "0");
  const gate = pick(GATES, f("gate"));
  const secret = pick(SECRETS, f("secret"));
  const sigil = (f("sigil") >>> 8) % SIGIL_COUNT;

  /* Passport-shaped, not passport-valid. It reads as a real travel document at
     a glance, which is the entire job of this strip. */
  const parts = name.toUpperCase().split(" ");
  const surname = parts.length > 1 ? parts[parts.length - 1] : parts[0];
  const given = parts.length > 1 ? parts.slice(0, -1).join("<") : "";

  const mrz: [string, string] = [
    mrzLine(`IDIND${surname}<<${given}`),
    mrzLine(
      `${serial.replace(/-/g, "")}IND2026<HHGOA<${seat}<${handle || "NOHANDLE"}`,
    ),
  ];

  return {
    name,
    stack,
    handle,
    builderClass,
    serial,
    seat,
    gate,
    secret,
    sigil,
    mrz,
  };
}
