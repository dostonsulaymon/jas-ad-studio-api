/**
 * The settings module's public contract (R-7). `credits` depends on it to refuse an order
 * the seller could not act on.
 */
import { z } from 'zod';
import type { Executor } from '../../common/db/transaction';

/**
 * D-008 and Addendum A §A4 step 2: what a seller is shown when placing an order. Every
 * field starts null — the structure ships, the content is the owner's. A card number is
 * never seeded into a migration: that file is committed and this repo will have a remote.
 */
/**
 * What PRO costs and how long it lasts (D-102). One plan, no tiers, no choice of length.
 *
 * `priceUzs` is null until Jakhongir sets one, and a null price means PRO is **not for sale**:
 * the order screen shows nothing rather than inventing a number, exactly as `GET /api/packs`
 * returns an empty list while packs are unpriced (D-072). Source 01 forbids invented prices
 * and this is the rule holding.
 */
export const proSubscriptionSchema = z.object({
  priceUzs: z.number().int().positive().max(100_000_000).nullable().default(null),
  days: z.number().int().positive().max(366).default(30),
  /**
   * R-021: how many prompt generations a PRO month includes, on top of the PRO prompts.
   *
   * **Granted as ordinary credits**, so there is no second counter to keep, no second refund
   * path when a generation fails, and a seller's balance stays one number. Zero — the default —
   * means PRO unlocks prompts and nothing else, which is exactly what D-102 shipped.
   *
   * The number is Jakhongir's and he does not have it yet: at about 4,414 soʻm a generation
   * (D-082) the count *is* most of the price, so it stays 0 until he sets it rather than being
   * guessed here.
   */
  generationsIncluded: z.number().int().min(0).max(1000).default(0),
});

export type ProSubscription = z.infer<typeof proSubscriptionSchema>;

export const paymentInstructionsSchema = z.object({
  cardNumber: z.string().trim().min(8).max(32).nullable().default(null),
  cardHolder: z.string().trim().min(2).max(120).nullable().default(null),
  /** https only: this URL is rendered for sellers, so http would be a downgrade we chose. */
  paymeUrl: z.url({ protocol: /^https$/ }).max(500).nullable().default(null),
  clickUrl: z.url({ protocol: /^https$/ }).max(500).nullable().default(null),
  /** Free-text Uzbek instructions — e.g. what to write in the transfer comment. */
  instructionsUz: z.string().trim().max(1000).nullable().default(null),
});
export type PaymentInstructions = z.infer<typeof paymentInstructionsSchema>;

/** D-023: all three, editable without a deploy. */
export const supportContactsSchema = z.object({
  telegramUser: z.string().trim().max(64).nullable().default(null),
  telegramBot: z.string().trim().max(64).nullable().default(null),
  email: z.email().max(200).nullable().default(null),
});
export type SupportContacts = z.infer<typeof supportContactsSchema>;

/**
 * The hero tray's photos (D-091).
 *
 * Only the image and its alt text: the size and tilt of each plate stay in
 * `hero-tray.tsx`, because they are how the tray is composed rather than what it shows.
 * An owner changing a product photo should not be able to break the layout.
 *
 * Empty is the shipping default, and the tray falls back to its committed photos rather
 * than rendering a gap — an empty hero is worse than a slightly stale one.
 */
export const heroPhotosSchema = z.object({
  /**
   * Overrides, keyed by the plate they replace — not a dense list (R-005).
   *
   * A flat array could only ever be all-or-nothing: replacing the third photo would mean
   * supplying the first two as well. The owner's actual question is "I do not like the
   * third one, how do I change it", and `slot` is what makes that one action instead of
   * seven. A slot with no entry keeps the committed image.
   */
  photos: z
    .array(
      z.object({
        slot: z.number().int().min(0).max(11),
        /** A path into the gallery media volume, from an owner upload. */
        path: z.string().trim().min(1).max(200),
        /** Required: a decorative-looking product photo still needs a name (§39). */
        altUz: z.string().trim().min(1).max(120),
      }),
    )
    .max(12)
    .default([])
    // Two overrides for one plate is a contradiction, and the later one silently winning
    // is how an owner ends up staring at the photo they just replaced.
    .refine((photos) => new Set(photos.map((p) => p.slot)).size === photos.length, {
      message: 'each slot may be overridden once',
    }),
});
export type HeroPhotos = z.infer<typeof heroPhotosSchema>;

/**
 * The whitelist. A PATCH to a key that is not here is a 404, so the table can never grow
 * a key that nothing validates.
 */
export const SETTINGS_KEYS = {
  pro_subscription: proSubscriptionSchema,
  payment_instructions: paymentInstructionsSchema,
  support_contacts: supportContactsSchema,
  hero_photos: heroPhotosSchema,
} as const;

export type SettingKey = keyof typeof SETTINGS_KEYS;

export function isSettingKey(value: string): value is SettingKey {
  return Object.hasOwn(SETTINGS_KEYS, value);
}

/**
 * What setKey returns: the stored value, whichever key it was. A union type is fine here —
 * only a DTO *class* cannot be one, which is why the owner routes are split per key
 * rather than taking `:key` with a union body.
 */
export type SettingValue = PaymentInstructions | SupportContacts | HeroPhotos | ProSubscription;

export const publicSettingsSchema = z.object({
  paymentInstructions: paymentInstructionsSchema,
  /** D-102: the locked PRO panel names the price, and it does so signed out. */
  proSubscription: proSubscriptionSchema,
  supportContacts: supportContactsSchema,
  /** Public because the landing page renders them before anyone signs in. */
  heroPhotos: heroPhotosSchema,
});
export type PublicSettings = z.infer<typeof publicSettingsSchema>;

export class SettingKeyNotFoundError extends Error {
  readonly code = 'SETTING_NOT_FOUND';
}

export const SETTINGS_READER = Symbol('SETTINGS_READER');

export interface SettingsReader {
  getPaymentInstructions(tx?: Executor): Promise<PaymentInstructions>;
  /** D-102: what PRO costs and for how long. A null price means it is not for sale. */
  getProSubscription(tx?: Executor): Promise<ProSubscription>;
  /** True when a seller could actually pay: card, Payme or Click is set. */
  isPaymentConfigured(tx?: Executor): Promise<boolean>;
  getPublic(tx?: Executor): Promise<PublicSettings>;
}

export const SETTINGS_ADMIN = Symbol('SETTINGS_ADMIN');

export interface SettingsAdmin {
  setKey(key: string, value: unknown, ownerId: string, tx?: Executor): Promise<SettingValue>;
}
