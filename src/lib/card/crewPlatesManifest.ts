/**
 * Whether the crew plates exist in `public/plates/crew/`.
 *
 * Written by `scripts/crewplates.ts` when it successfully encodes all three,
 * and committed alongside the images themselves.
 *
 * This exists so the loader doesn't have to *discover* the art by requesting it
 * and catching the failure. A client-side check of a static asset is a real
 * network request, and a miss logs a 404 to the console on every visit — noise
 * in production, and indistinguishable from a genuine broken asset in the
 * checks that treat console errors as failures.
 */
export const CREW_PLATES_AVAILABLE = true;
