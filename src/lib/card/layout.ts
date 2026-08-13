/**
 * Geometry of the illustrated card, in plate pixels.
 *
 * Every number here was measured off the original designs rather than eyeballed
 * — see `scripts/plates.ts` (which normalises them onto a shared card border)
 * and `scripts/measure.ts` (which recovers where the designer put the text).
 * Re-run both if the plates are ever regenerated.
 */

import type { LayerName } from "./theme";

export const PLATE_W = 963;
export const PLATE_H = 1485;

/**
 * The printed photo window, per layer.
 *
 * The plates are registered on the card's border, not on this window, because
 * the border is what the eye tracks — see the note in `scripts/plates.ts`. The
 * cost is that each layer prints its window a little differently, so the photo
 * is drawn into whichever window belongs to the layer being rendered.
 */
export const WINDOWS: Record<LayerName, { x: number; y: number; w: number; h: number }> = {
  day: { x: 311, y: 577, w: 333, h: 499 },
  sunrise: { x: 320, y: 612, w: 318, h: 484 },
  night: { x: 295, y: 583, w: 355, h: 515 },
};

/**
 * What the uploaded photo is cropped to. The three windows differ by a few
 * percent of aspect; the crop targets the reference layer and each layer then
 * covers its own window, so the difference costs a sliver of edge rather than
 * a visible stretch.
 */
export const PHOTO_ASPECT = WINDOWS.day.w / WINDOWS.day.h;

/**
 * The two-line name lockup. Line one is bottle green, line two hot pink, and
 * the badge straddles the gap between them.
 */
export const NAME = {
  left: 161,
  right: 902,
  /** cap-height boxes measured from the original headline */
  line1: { top: 148, bottom: 318 },
  line2: { top: 328, bottom: 480 },
};

export const BADGE = { x: 421, y: 255, w: 167, h: 115 };

/**
 * The rarity tier, in the card's header strip.
 *
 * That strip carries "RESIDENT" and a globe on the left and the LET'S BUILD
 * TOGETHER stamp on the right — the one band of the plate wide enough for a
 * chip that isn't already printed on. Everywhere else was taken: the class
 * chip's own band is illustration, and the space under it is where the night
 * plate prints the blacklight secret.
 *
 * Centred between the lanyard slot (which ends around x 500) and the stamp
 * (which starts around x 773) rather than on the card, because the slot is
 * punched left of centre and a centred chip runs straight into it.
 */
export const TIER_CHIP = {
  centerX: 640,
  centerY: 88,
  height: 46,
  padX: 26,
  size: 25,
};

/**
 * The generated builder title, on a printed chip in the band between the photo
 * window and the data panel.
 *
 * It gets a chip rather than bare text because that band is illustration on all
 * three plates — a beach at sunset, a Portuguese villa, the same villa under
 * blacklight — and no single ink colour stays legible across them. The chip
 * borrows the photo window's own treatment (cream fill, pink keyline) so it
 * reads as part of the printed card rather than something dropped on top.
 */
export const CLASS_CHIP = {
  centerY: 1150,
  height: 64,
  maxWidth: 810,
  padX: 32,
  size: 34,
};

/**
 * The data panel: STACK / ROLE / PASS NO.
 *
 * The panel is printed at a different height on each plate — day 1218,
 * sunrise 1220, night 1241 — so the row is set to clear the lowest of the
 * three. Drawing at identical coordinates on every layer is what stops the text
 * drifting while the art changes underneath it; the alternative, a per-layer
 * offset, would make the row swim mid-tilt.
 *
 * Columns are weighted rather than equal: a stack list runs long and a pass
 * number never does.
 */
export const ROW = {
  columns: [243, 567, 827],
  dividers: [416, 719],
  labelBaseline: 1284,
  valueBaseline: 1342,
  labelSize: 22,
  valueSize: 40,
  ruleTop: 1262,
  ruleBottom: 1352,
  /** per-column width budget for values, before they start shrinking */
  widths: [316, 273, 186],
};

/** Only drawn on the night plate — the payoff for tilting. */
export const SECRET = { y: 1212, size: 27 };

/**
 * The crew pass — one combined card for 2–3 people.
 *
 * Built on three illustrated plates the way the solo card is, and with the same
 * division of labour: **the plate is the card, code draws only what changes.**
 * The art already prints the border, the lanyard slot, the RESIDENT kicker, the
 * motto column, the HH stamp, the CODE/BUILD/CHAI/REPEAT column and the dated
 * footer, so the renderer must draw *around* those rather than over them. An
 * earlier version drew all of that chrome itself, on a plate used only as a
 * cropped band; against art that bakes it in, every one of those would double.
 *
 * Coordinates are in plate pixels, 1536 x 1024. The art is 3:2 and keeps its own
 * shape — cropping back to the previous 16:9 would take ~160px off the height,
 * which is exactly where the kicker and the footer live. `scene.ts` composites
 * it into a 16:9 field for sharing instead, as it already does for the solo card.
 *
 * Tiles are cut at `PHOTO_ASPECT`, so a crew photo goes through exactly the same
 * subject-aware crop a solo photo does.
 */
export const CREW = {
  W: 1536,
  H: 1024,
  /**
   * Set above the roundest of the three plates rather than to a chosen value.
   * Each plate prints its own corner against a dark surround — ~44px on day and
   * night, ~60px on sunrise — and a clip squarer than the art leaves that dark
   * corner showing as a sliver inside the card.
   */
  radius: 62,

  /**
   * What the plates already print, and the renderer may not touch.
   *
   * Measured in `scripts/crewfit.ts`. Kept as data so the placement below can be
   * checked against it rather than eyeballed, and so a future set of plates that
   * moves the chrome has one place to declare it.
   */
  reserved: {
    top: 150,
    bottom: 935,
    left: 195,
    right: 1370,
  },

  /**
   * Everything the renderer draws sits on a printed mount — cream stock, pink
   * keyline — rather than straight onto the illustration.
   *
   * This is not decoration. The same cell of the card swings from luma 19 to 217
   * between the night and day plates, so there is no ink, light or dark, that
   * stays legible across all three printings. The solo card hit this exact wall
   * with its builder-class chip and solved it the same way. The mount also means
   * the type is pixel-identical on all three layers, so nothing swims mid-tilt.
   */
  plate: { fill: "rgba(244,235,216,0.96)", radius: 16, keyline: 2.5 },

  /**
   * The team nameplate.
   *
   * The badge and the name are centred *as a group* inside it. Pinning the badge
   * to the left edge and centring the name on the card independently leaves the
   * pair visibly left-heavy, because the plate is much wider than the name.
   *
   * It and the tile row are centred together in the band the art leaves free,
   * rather than hung from the top — there is no printed footer of our own to
   * close the composition now, so the illustration has to.
   */
  nameplate: { x: 358, y: 223, w: 820, h: 114, nameMaxWidth: 600, nameCap: 52 },
  badge: { w: 96, h: 66, gap: 26 },

  /**
   * The tile row, centred on the card. Sized so three tiles and their gaps clear
   * the right-hand icon column at x 1370, and so the row plus its caption band
   * still lands above the printed footer at y 935.
   */
  window: { y: 367, h: 366, gap: 46, radius: 14, pad: 13 },
  /**
   * Name, then role · stack, then builder class — printed on the mount under
   * the photo.
   *
   * The band grew by 18px to seat the meta line, and the nameplate and tile row
   * both moved up 9 to keep the pair centred in the free band as one group,
   * which is how they were placed to begin with. The bottom of the mount lands
   * at 867, still clear of the printed footer the art puts at 935.
   */
  caption: { h: 106, nameOffset: 30, metaOffset: 52, classOffset: 74, classLeading: 18 },

  /**
   * The blacklight line, on the night printing only — the payoff for tilting,
   * and the reason the crew pass earns three printings rather than one.
   *
   * The only thing on the card drawn straight onto the illustration rather than
   * on a mount, and it can be: it exists on one layer, and that layer is dark
   * everywhere (`crewfit.ts` puts night's luma under 60 across this band), so
   * glowing pink holds without help. A mount here would read as a label rather
   * than as something surfacing out of the card.
   */
  secret: { y: 908, size: 21 },
};

/** Window width follows the card's own photo aspect, so the crop is unchanged. */
export const CREW_TILE_W = Math.round(CREW.window.h * PHOTO_ASPECT);
/** The mount is the photo plus its matte plus the printed caption band. */
export const CREW_MOUNT_W = CREW_TILE_W + CREW.window.pad * 2;
export const CREW_MOUNT_H = CREW.window.h + CREW.window.pad * 2 + CREW.caption.h;

export const INK = {
  green: "#0d3b2e",
  pink: "#e01f68",
  cream: "#f2e6cf",
  gold: "#e2a90f",
};
