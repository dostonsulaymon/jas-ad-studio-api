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

export const PRO_ORDER_STATUSES = ['pending', 'confirmed', 'rejected'] as const;
export type ProOrderStatus = (typeof PRO_ORDER_STATUSES)[number];

export const proOrderSchema = z
  .object({
    id: z.uuid(),
    amountUzs: z.number().int(),
    days: z.number().int(),
    status: z.enum(PRO_ORDER_STATUSES),
    rejectionReason: z.string().nullable(),
    createdAt: z.iso.datetime(),
    confirmedAt: z.iso.datetime().nullable(),
  })
  .strict();

export type ProOrder = z.infer<typeof proOrderSchema>;

/** The owner's view of the queue: the same order, plus who placed it. */
export const ownerProOrderSchema = proOrderSchema.extend({
  userId: z.uuid(),
  email: z.email(),
});

export type OwnerProOrder = z.infer<typeof ownerProOrderSchema>;

export const rejectProOrderSchema = z
  .object({ reason: z.string().min(1).max(200) })
  .strict();

/**
 * Two ports, deliberately separate, for the reason `gallery.module.ts` gives: one port with every
 * method on it would hand the gallery a `confirmOrder`. The gallery asks one question and can do
 * nothing else; the owner module gets the write surface.
 */
export const PRO_ACCESS = Symbol('PRO_ACCESS');

export interface ProAccessPort {
  /** False for a signed-out visitor, an unknown user, or one whose access has run out. */
  hasPro(userId: string | null): Promise<boolean>;
  status(userId: string | null): Promise<ProStatus>;
}

export const PRO_ADMIN = Symbol('PRO_ADMIN');

export interface ProAdminPort {
  /** The queue, newest first, for the owner panel. */
  listOrders(status: ProOrderStatus | null, limit: number): Promise<OwnerProOrder[]>;
  /** Confirming extends access by the order's own days. An order grants exactly once. */
  confirmOrder(orderId: string, ownerId: string): Promise<ProStatus>;
  rejectOrder(orderId: string, reason: string, ownerId: string): Promise<void>;
  grant(input: ProGrant, ownerId: string): Promise<ProStatus>;
}
