/**
 * The pro module's public contract (R-7). The gallery asks one question of it — may this
 * caller read a locked prompt — and the owner module grants access. Neither touches the
 * table.
 */

import { z } from 'zod';

export const PROMPT_ACCESS = ['free', 'pro'] as const;
export type PromptAccess = (typeof PROMPT_ACCESS)[number];

export const proStatusSchema = z
  .object({
    hasPro: z.boolean(),
    /** When it runs out. Null when the seller has never had access. */
    until: z.iso.datetime().nullable(),
  })
  .strict();

export type ProStatus = z.infer<typeof proStatusSchema>;

/** A grant is a date, not a duration: "until" is what the owner can check against a payment. */
export const proGrantSchema = z
  .object({
    userId: z.uuid(),
    until: z.iso.datetime(),
    note: z.string().min(1).max(200),
  })
  .strict();

export type ProGrant = z.infer<typeof proGrantSchema>;

export const PRO_ACCESS = Symbol('PRO_ACCESS');

export interface ProAccessPort {
  /** False for a signed-out visitor, an unknown user, or one whose access has run out. */
  hasPro(userId: string | null): Promise<boolean>;
  status(userId: string | null): Promise<ProStatus>;
  grant(input: ProGrant, ownerId: string): Promise<ProStatus>;
}
