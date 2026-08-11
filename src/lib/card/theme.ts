import { PLATE_H, PLATE_W } from "./layout";

/**
 * The tilt axis is the sun. Left is dawn, flat is midday, right is after dark —
 * one card, three printings.
 */
export type LayerName = "sunrise" | "day" | "night";

/**
 * Card dimensions. These follow the illustrated plates: the artwork defines the
 * geometry now, so everything scales from it rather than the other way round.
 */
export const CARD_W = PLATE_W;
export const CARD_H = PLATE_H;
