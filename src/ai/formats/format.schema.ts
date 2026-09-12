import { z } from 'zod';
import { AD_STYLES } from '../public/brief.schema';

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
    labelUz: z.string().min(1),

    /** Which styles from the seller's brief resolve to this format. */
    styles: z.array(z.enum(AD_STYLES)).min(1),

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
