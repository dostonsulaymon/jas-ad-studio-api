import type { ConfigService } from '@nestjs/config';
import type { Pool } from 'pg';
import type { Env } from '../../common/config/env.schema';
import type { SettingsAdmin, SettingsReader } from '../../settings/public/settings.port';
import { AccountsService } from '../accounts.service';
import { OrdersService } from '../orders.service';
import { PacksService } from '../packs.service';
import { packEditSchema } from '../public/credits.port';

/**
 * The settings implementation is passed IN rather than constructed here.
 *
 * R-7: this file is not a `.spec.ts`, so it gets no exemption from the boundary lint — a
 * module may import another module's port but never its service. Each spec constructs the
 * real `SettingsService` (specs are exempt, because an integration test legitimately
 * wires two real modules together) and hands it over as the contract.
 */
export type TestSettings = SettingsReader & SettingsAdmin;

export interface CreditsHarness {
  accounts: AccountsService;
  packs: PacksService;
  orders: OrdersService;
  settings: TestSettings;
}

/**
 * Wires the real services against a real pool. Nothing is faked except the config
 * getter: R-4's whole point is that these races only appear against Postgres, and a stub
 * for any of these would hide the thing under test.
 */
export function buildCredits(
  pool: Pool,
  settings: TestSettings,
  ordersPerDay = 5,
): CreditsHarness {
  const packs = new PacksService(pool);
  const accounts = new AccountsService(pool);

  const config = {
    get: (key: keyof Env) => (key === 'ORDERS_PER_DAY_LIMIT' ? ordersPerDay : undefined),
  } as unknown as ConfigService<Env, true>;

  return {
    packs,
    accounts,
    settings,
    orders: new OrdersService(pool, packs, accounts, settings, config),
  };
}

/** The state a seller needs before they can order: a live pack and somewhere to pay. */
export async function openForBusiness(
  harness: CreditsHarness,
  ownerId: string,
  packId = 'pack_5',
  priceUzs = 40000,
): Promise<void> {
  await harness.packs.setPack(packId, packEditSchema.parse({ priceUzs, isActive: true }));
  await harness.settings.setKey(
    'payment_instructions',
    { cardNumber: '8600123412341234', cardHolder: 'JAS STUDIO' },
    ownerId,
  );
}

/**
 * Not truncateAll(): the seeded packs are migration data these suites depend on, so they
 * are reset to their seeded state rather than deleted.
 */
export async function resetCredits(pool: Pool): Promise<void> {
  await pool.query(`DELETE FROM owner_audit_log`);
  await pool.query(`DELETE FROM credit_ledger`);
  await pool.query(`DELETE FROM credit_orders`);
  await pool.query(`DELETE FROM credit_accounts`);
  await pool.query(`DELETE FROM site_settings`);
  await pool.query(`DELETE FROM users`);
  await pool.query(
    `UPDATE credit_packs SET is_active = false, price_uzs = CASE id
       WHEN 'pack_1' THEN 9000 WHEN 'pack_5' THEN 40000 ELSE 105000 END`,
  );
}

export async function seedUsers(
  pool: Pool,
): Promise<{ alice: string; bob: string; owner: string }> {
  const { rows } = await pool.query<{ id: string; email: string }>(
    `INSERT INTO users (google_sub, email, role) VALUES
       ('alice','alice@x.uz','seller'),
       ('bob','bob@x.uz','seller'),
       ('owner','owner@x.uz','owner')
     RETURNING id, email`,
  );
  const find = (email: string) => rows.find((row) => row.email === email)?.id ?? '';
  return { alice: find('alice@x.uz'), bob: find('bob@x.uz'), owner: find('owner@x.uz') };
}
