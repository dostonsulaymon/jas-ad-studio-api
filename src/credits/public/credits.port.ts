/**
 * The credits module's public contract (R-7). Types and DI tokens only — no query, no
 * implementation. Two tokens rather than one: the seller path must not be able to reach
 * the owner operations just because it holds a reference to the module.
 */
import { z } from 'zod';
import type { Executor } from '../../common/db/transaction';

export const ORDER_STATUSES = ['pending', 'paid', 'rejected', 'cancelled'] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

/** D-008: card transfer, or a Payme/Click link. `other` is the escape hatch, not a default. */
export const PAYMENT_METHODS = ['card_transfer', 'payme', 'click', 'other'] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export const LEDGER_TYPES = ['purchase', 'owner_grant', 'reserve', 'debit', 'release'] as const;
export type LedgerType = (typeof LEDGER_TYPES)[number];

export const creditBalanceSchema = z.object({
  available: z.number().int().nonnegative(),
  reserved: z.number().int().nonnegative(),
});
export type CreditBalance = z.infer<typeof creditBalanceSchema>;

/** What a seller sees. An unpriced pack is never in this list, so `priceUzs` is not nullable. */
export const creditPackSchema = z.object({
  id: z.string(),
  credits: z.number().int().positive(),
  priceUzs: z.number().int().positive(),
  sortOrder: z.number().int(),
});
export type CreditPack = z.infer<typeof creditPackSchema>;

/** What the owner sees: the unpriced and inactive ones too. */
export const adminPackSchema = z.object({
  id: z.string(),
  credits: z.number().int().positive(),
  priceUzs: z.number().int().positive().nullable(),
  isActive: z.boolean(),
  sortOrder: z.number().int(),
});
export type AdminPack = z.infer<typeof adminPackSchema>;

export const creditOrderSummarySchema = z.object({
  id: z.uuid(),
  packId: z.string(),
  credits: z.number().int().positive(),
  amountUzs: z.number().int().positive(),
  status: z.enum(ORDER_STATUSES),
  paymentMethod: z.enum(PAYMENT_METHODS),
  payerReference: z.string().nullable(),
  rejectionReason: z.string().nullable(),
  /**
   * The wire type, not the database type. JSON has no Date, and zod 4 refuses to put
   * z.date() in a JSON Schema at all (T-09).
   */
  createdAt: z.iso.datetime(),
  confirmedAt: z.iso.datetime().nullable(),
});
export type CreditOrderSummary = z.infer<typeof creditOrderSummarySchema>;

/** The owner's queue row: the seller's identity, which a seller's own view never carries. */
export const ownerOrderSchema = creditOrderSummarySchema.extend({
  userId: z.uuid(),
  userEmail: z.email(),
});
export type OwnerOrder = z.infer<typeof ownerOrderSchema>;

export const createOrderSchema = z.object({
  packId: z.string().min(1).max(64),
  paymentMethod: z.enum(PAYMENT_METHODS),
  /** Free text from a seller: trimmed, bounded, and never interpolated into anything. */
  payerReference: z.string().trim().max(120).nullish().transform((value) => value ?? null),
});
export type CreateOrderInput = z.infer<typeof createOrderSchema>;

export const rejectOrderSchema = z.object({
  reason: z.string().trim().min(1).max(500),
});

export const grantSchema = z.object({
  userId: z.uuid(),
  credits: z.number().int().positive().max(1000),
  /** Required by the database too. D-010 pilot credits and D-020 goodwill both land here. */
  note: z.string().trim().min(1).max(500),
});
export type GrantInput = z.infer<typeof grantSchema>;

/**
 * Every field optional, but activation is not free-standing: `isActive: true` without a
 * `priceUzs` in the same request is refused (D-072), so a placeholder price cannot go
 * live by one careless toggle.
 */
export const packEditSchema = z
  .object({
    /**
     * Not nullable: there is no "clear the price" operation. An owner raises or lowers a
     * price, or deactivates the pack — and a null here could not be told apart from an
     * absent field by the COALESCE update, so offering it would be a promise we do not
     * keep.
     */
    priceUzs: z.number().int().positive().optional(),
    isActive: z.boolean().optional(),
    sortOrder: z.number().int().min(0).max(1000).optional(),
  })
  .refine((edit) => !(edit.isActive === true && edit.priceUzs === undefined), {
    message: 'activating a pack requires stating its price in the same request',
    path: ['priceUzs'],
  });
export type PackEdit = z.infer<typeof packEditSchema>;

export const ownerUserSchema = z.object({
  id: z.uuid(),
  email: z.email(),
  role: z.string(),
  createdAt: z.iso.datetime(),
  available: z.number().int().nonnegative(),
  reserved: z.number().int().nonnegative(),
});
export type OwnerUser = z.infer<typeof ownerUserSchema>;

/** `alreadyPaid` is how a caller knows a second confirm changed nothing. */
export interface ConfirmResult {
  order: CreditOrderSummary;
  credited: number;
  alreadyPaid: boolean;
}

/**
 * What P4 needs and nothing more. Every method takes an Executor so P4's
 * POST /generations can reserve a credit inside the transaction that inserts the
 * generation row — or neither happens.
 */
export const CREDIT_LEDGER = Symbol('CREDIT_LEDGER');

export interface CreditLedgerPort {
  getBalance(userId: string, tx?: Executor): Promise<CreditBalance>;
  /** Atomic. Throws NoCreditsError when available < 1. */
  reserveOne(userId: string, generationId: string | null, tx?: Executor): Promise<CreditBalance>;
  debit(userId: string, generationId: string | null, tx?: Executor): Promise<CreditBalance>;
  release(userId: string, generationId: string | null, tx?: Executor): Promise<CreditBalance>;
}

/** What the owner module needs. Separate token, so the seller path cannot reach it. */
export const CREDIT_ADMIN = Symbol('CREDIT_ADMIN');

export interface CreditAdminPort {
  listOrders(status: OrderStatus | null, limit: number, tx?: Executor): Promise<OwnerOrder[]>;
  confirmOrder(orderId: string, ownerId: string, tx?: Executor): Promise<ConfirmResult>;
  rejectOrder(
    orderId: string,
    ownerId: string,
    reason: string,
    tx?: Executor,
  ): Promise<CreditOrderSummary>;
  grant(input: GrantInput, tx?: Executor): Promise<CreditBalance>;
  setPack(packId: string, edit: PackEdit, tx?: Executor): Promise<AdminPack>;
  listUsers(limit: number, tx?: Executor): Promise<OwnerUser[]>;
}
