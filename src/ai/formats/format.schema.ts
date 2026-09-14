import { z } from 'zod';

/**
 * How energetic a format's camera and cutting may be. This is the dial that source 01
 * §25's pacing rules defer to (C-6, D-057). It never relaxes the fidelity rules.
 */
export const ENERGY_LEVELS = ['restrained', 'moderate', 'high'] as const;
export type EnergyLevel = (typeof ENERGY_LEVELS)[number];

export const creativeFormatSchema = z
  .object({
    id: z.string().min(1),
    version: z.number().int().positive(),
    /** Shown in the wizard's format picker. The seller chooses from these (D-065). */
    labelUz: z.string().min(1),
    /** One plain Uzbek sentence telling the seller what this format looks like. */
    descriptionUz: z.string().min(10),

    /** One line telling the model what kind of film this is. */
    intent: z.string().min(20),

    /**
     * The sections the prompt carries, in order. Different per format: a fast social ad
     * does not need the same shape as a luxury product film (D-056).
     */
    sections: z.array(z.string().min(3)).min(4),

    beats: z.object({
      default: z.number().int().positive(),
      max: z.number().int().positive(),
    }),

    /** Guidance, not a rule the validators enforce — Flow decides the real cut. */
    shotSecondsRange: z.tuple([z.number().positive(), z.number().positive()]),

    energy: z.enum(ENERGY_LEVELS),

    /** The moves this format may draw on. The model still picks, never stacks blindly. */
    cameraVocabulary: z.array(z.string().min(3)).min(3),
    transitions: z.array(z.string().min(3)).min(2),

    /**
     * What the product itself may do on screen (D-096). Assembly and separation are never
     * listed: the system prompt bans them in every format.
     */
    productMotion: z.array(z.string().min(3)).min(1),
    /** Particles, haze and similar. Empty means none. */
    atmosphere: z.array(z.string().min(3)),

    /**
     * D-060: what a person may do with the product, for formats whose premise invites an
     * action the photo cannot support (opening a car door revealed an invented interior).
     * Null where the format has no such premise.
     */
    interactionBoundary: z.string().min(20).nullable(),
  })
  .strict()
  .refine((f) => f.beats.default <= f.beats.max, {
    message: 'beats.default must not exceed beats.max',
    path: ['beats', 'default'],
  })
  .refine((f) => new Set(f.sections).size === f.sections.length, {
    message: 'sections must be unique',
    path: ['sections'],
  })
  .refine((f) => f.shotSecondsRange[0] < f.shotSecondsRange[1], {
    message: 'shotSecondsRange must be low to high',
    path: ['shotSecondsRange'],
  });

export type CreativeFormat = z.infer<typeof creativeFormatSchema>;
