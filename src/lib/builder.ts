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
  role: string;
  stack: string;
  handle: string;
  salt: number;
};

/**
 * How rare this draw is.
 *
 * The builder class was already the thing people compare — this puts a number
 * on it. REROLL is right there and costs nothing, so a tier printed on the card
 * turns "what did you get?" into a loop: reroll for a good one, post the good
 * one. The Radar ranks on views of that post.
 *
 * Weighted so MYTHIC is genuinely uncommon; a tier everyone has is not a tier.
 */
export type Tier = "COMMON" | "RARE" | "MYTHIC";

export const TIERS: Record<Tier, { label: string; share: number }> = {
  COMMON: { label: "COMMON", share: 0.78 },
  RARE: { label: "RARE", share: 0.18 },
  MYTHIC: { label: "MYTHIC", share: 0.04 },
};

/**
 * Bucket by hash range.
 *
 * Its own labelled draw rather than a reuse of the class hash: sharing one would
 * tie a tier to a specific builder class forever, so ANJUNA SHIPPER would be
 * MYTHIC for everybody who ever rolled it and the rest would be unreachable.
 * A separate field means any class can come up at any tier.
 */
export function tierOf(n: number): Tier {
  const roll = (n >>> 8) % 10000;
  if (roll < TIERS.MYTHIC.share * 10000) return "MYTHIC";
  if (roll < (TIERS.MYTHIC.share + TIERS.RARE.share) * 10000) return "RARE";
  return "COMMON";
}

export type MintedPass = {
  name: string;
  /** what they do — "FULL STACK", "DESIGN ENGINEER" */
  role: string;
  /** what they do it in — "TYPESCRIPT · RUST" */
  stack: string;
  handle: string;
  /** e.g. "ANJUNA NIGHT-COMPILER" */
  builderClass: string;
  /** how rare that draw was — printed on the card, foiled above COMMON */
  tier: Tier;
  /** e.g. "HHG-2026-0417" */
  serial: string;
  /** the four digits of the serial, which is what the card prints */
  passNo: string;
  /** 001..247 — the residency only has 247 seats, so the number means something */
  seat: string;
  /** the line that only shows up under blacklight */
  secret: string;
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
  const role = normalize(input.role) || "BUILDER";
  const stack = normalize(input.stack) || "FULL STACK";
  const handle = normalize(input.handle).replace(/^@/, "");

  const seed = hash(
    `${name.toLowerCase()}|${role.toLowerCase()}|${stack.toLowerCase()}|${handle.toLowerCase()}|${input.salt}`,
  );
  const f = (label: string) => fieldOf(seed, label);

  const builderClass = `${pick(PLACES, f("place"))} ${pick(ARCHETYPES, f("archetype"))}`;
  const tier = tierOf(f("tier"));
  const passNo = String((f("serial") >>> 8) % 10000).padStart(4, "0");
  const serial = `HHG-2026-${passNo}`;
  const seat = String(((f("seat") >>> 8) % 247) + 1).padStart(3, "0");
  const secret = pick(SECRETS, f("secret"));

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
    role,
    stack,
    handle,
    builderClass,
    tier,
    serial,
    passNo,
    seat,
    secret,
    mrz,
  };
}

/* ------------------------------------------------------------------ */
/* crew                                                                */
/* ------------------------------------------------------------------ */

export type MintedCrew = {
  /** the shared header — one team, one card */
  team: string;
  /** each member keeps their own builder class, minted exactly as a solo pass */
  members: MintedPass[];
  serial: string;
  passNo: string;
  secret: string;
  mrz: [string, string];
};

export const CREW_MIN = 2;
export const CREW_MAX = 3;

/**
 * A combined pass for a team.
 *
 * Built *on* `mint` rather than beside it: every member is a real minted pass,
 * so a builder class means the same thing on a crew card as on a solo one and
 * there is only ever one place that derives it. What's added is the layer above
 * — a team name, and a serial seeded from the roster rather than from any one
 * person, so the crew card has an identity of its own that still changes when
 * the line-up does.
 *
 * The roster is folded in order, which is deliberate: reordering the team is a
 * different crew and should mint a different number. `salt` rerolls the whole
 * card, members included, so REROLL behaves the same in both modes.
 */
export function mintCrew(input: {
  team: string;
  members: Pass[];
  salt: number;
}): MintedCrew {
  const team = normalize(input.team) || "UNNAMED CREW";
  const members = input.members.map((m) => mint({ ...m, salt: input.salt }));

  const roster = members.map((m) => m.name.toLowerCase()).join("+");
  const seed = hash(`crew|${team.toLowerCase()}|${roster}|${input.salt}`);
  const f = (label: string) => fieldOf(seed, label);

  const passNo = String((f("serial") >>> 8) % 10000).padStart(4, "0");
  const serial = `HHG-CREW-${passNo}`;
  const secret = pick(SECRETS, f("secret"));

  const tag = members
    .map((m) => m.handle || m.name.split(" ")[0])
    .join("<")
    .toUpperCase();

  const mrz: [string, string] = [
    mrzLine(`IDINDCREW<<${team.toUpperCase().replace(/\s+/g, "<")}`),
    mrzLine(`${serial.replace(/-/g, "")}IND2026<HHGOA<${members.length}PAX<${tag}`),
  ];

  return { team, members, serial, passNo, secret, mrz };
}
