import { Inject, Injectable } from '@nestjs/common';
import { Pool } from 'pg';
import { NotFoundException } from '@nestjs/common';
import { PG_POOL } from '../common/db/tokens';
import type { Executor } from '../common/db/transaction';
import {
  isSettingKey,
  paymentInstructionsSchema,
  proSubscriptionSchema,
  heroPhotosSchema,
  SETTINGS_KEYS,
  supportContactsSchema,
  type HeroPhotos,
  type PaymentInstructions,
  type ProSubscription,
  type PublicSettings,
  type SettingsAdmin,
  type SettingsReader,
  type SettingValue,
  type SupportContacts,
} from './public/settings.port';

@Injectable()
export class SettingsService implements SettingsReader, SettingsAdmin {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  /**
   * A key that was never written parses `{}` through its schema, so every field comes
   * back as its declared null default. No row is created by a read.
   */
  private async readKey(key: string, tx: Executor): Promise<unknown> {
    const { rows } = await tx.query<{ value: unknown }>(
      `SELECT value FROM site_settings WHERE key = $1`,
      [key],
    );
    return rows[0]?.value ?? {};
  }

  async getPaymentInstructions(tx: Executor = this.pool): Promise<PaymentInstructions> {
    return paymentInstructionsSchema.parse(await this.readKey('payment_instructions', tx));
  }

  async getProSubscription(tx: Executor = this.pool): Promise<ProSubscription> {
    return proSubscriptionSchema.parse(await this.readKey('pro_subscription', tx));
  }

  async getSupportContacts(tx: Executor = this.pool): Promise<SupportContacts> {
    return supportContactsSchema.parse(await this.readKey('support_contacts', tx));
  }

  async getHeroPhotos(tx: Executor = this.pool): Promise<HeroPhotos> {
    return heroPhotosSchema.parse(await this.readKey('hero_photos', tx));
  }

  async isPaymentConfigured(tx: Executor = this.pool): Promise<boolean> {
    const instructions = await this.getPaymentInstructions(tx);
    return Boolean(instructions.cardNumber ?? instructions.paymeUrl ?? instructions.clickUrl);
  }

  async getPublic(tx: Executor = this.pool): Promise<PublicSettings> {
    return {
      paymentInstructions: await this.getPaymentInstructions(tx),
      proSubscription: await this.getProSubscription(tx),
      supportContacts: await this.getSupportContacts(tx),
      heroPhotos: await this.getHeroPhotos(tx),
    };
  }

  /**
   * Owner-only; the guard is on the route. The value is validated against the key's own
   * schema before it is stored, so a bad shape never reaches the table.
   */
  async setKey(
    key: string,
    value: unknown,
    ownerId: string,
    tx: Executor = this.pool,
  ): Promise<SettingValue> {
    if (!isSettingKey(key)) {
      throw new NotFoundException(`Unknown setting key: ${key}`);
    }

    const parsed = SETTINGS_KEYS[key].parse(value);

    await tx.query(
      `INSERT INTO site_settings (key, value, updated_by) VALUES ($1, $2, $3)
       ON CONFLICT (key) DO UPDATE
         SET value = $2, updated_by = $3, updated_at = now()`,
      [key, JSON.stringify(parsed), ownerId],
    );

    return parsed;
  }
}
