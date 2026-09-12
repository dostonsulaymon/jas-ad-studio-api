/**
 * The creative format ids the contract allows (D-065). They live in the port, not in the
 * format registry, because the port may not depend on a module's implementation (R-7) —
 * the contract declares what exists and the registry implements it.
 *
 * A test in `formats.spec.ts` asserts the registry covers exactly this list, so the two
 * cannot drift.
 */
export const FORMAT_IDS = [
  'product-film',
  'high-energy',
  'lifestyle-story',
  'ugc-authentic',
] as const;

export type FormatId = (typeof FORMAT_IDS)[number];
