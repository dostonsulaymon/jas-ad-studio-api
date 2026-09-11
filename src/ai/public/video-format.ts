/** Vocabulary shared by the brief, the result and the target config. */
export const ASPECT_RATIOS = ['9:16', '16:9', '1:1'] as const;
export const REFERENCE_MODES = ['frames-to-video', 'ingredients-to-video', 'none'] as const;

export type AspectRatio = (typeof ASPECT_RATIOS)[number];
export type ReferenceMode = (typeof REFERENCE_MODES)[number];
